import asyncio
import logging
import os
import re
import subprocess

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import async_session
from ..models.vpn_config import VPNConfig

logger = logging.getLogger("nfs-manager.service.vpn")

WG_CONF_DIR = "/etc/wireguard"
OVPN_CONF_DIR = "/etc/openvpn"

# OpenVPN directives that can execute arbitrary commands
_DANGEROUS_OVPN_DIRECTIVES = re.compile(
    r"^\s*(script-security\s+[2-9]|up\s|down\s|client-connect\s|client-disconnect\s|"
    r"learn-address\s|auth-user-pass-verify\s|tls-verify\s|ipchange\s|"
    r"route-up\s|route-pre-down\s|plugin\s)",
    re.MULTILINE | re.IGNORECASE,
)


def _validate_vpn_config(config: VPNConfig):
    """Reject VPN configs containing dangerous directives (RCE prevention)."""
    if config.vpn_type == "openvpn":
        match = _DANGEROUS_OVPN_DIRECTIVES.search(config.config_content)
        if match:
            directive = match.group(0).strip().split()[0]
            raise ValueError(
                f"OpenVPN config contains blocked directive: '{directive}'. "
                "Script execution directives are not allowed."
            )


async def _run(cmd: list[str], timeout: int = 30) -> subprocess.CompletedProcess:
    loop = asyncio.get_event_loop()
    try:
        return await loop.run_in_executor(
            None,
            lambda: subprocess.run(
                cmd, capture_output=True, text=True, timeout=timeout
            ),
        )
    except FileNotFoundError:
        return subprocess.CompletedProcess(
            cmd, returncode=127, stdout="", stderr=f"Command not found: {cmd[0]}"
        )
    except subprocess.TimeoutExpired:
        return subprocess.CompletedProcess(
            cmd, returncode=-1, stdout="", stderr=f"Command timed out after {timeout}s"
        )


def _get_interface_name(config: VPNConfig) -> str:
    if config.vpn_type == "wireguard":
        return f"wg{config.id}"
    return f"ovpn{config.id}"


def _prepare_wg_config(config_content: str) -> str:
    """Prepare WireGuard config for safe use in host network mode.

    - Strips DNS lines (prevents wg-quick from hijacking host /etc/resolv.conf)
    - Adds Table = off (prevents wg-quick from managing routing — we do it ourselves)
    """
    lines = config_content.splitlines(keepends=True)
    filtered = []
    removed_dns = []
    has_table = False
    in_interface = True  # first section is always [Interface]

    for line in lines:
        stripped = line.strip().lower()

        # Track sections
        if stripped.startswith("[") and not stripped.startswith("[interface"):
            # Leaving [Interface] section — inject Table=off if not present
            if in_interface and not has_table:
                filtered.append("Table = off\n")
                has_table = True
            in_interface = False

        # Strip DNS
        if in_interface and stripped.startswith("dns") and "=" in stripped:
            removed_dns.append(line.strip())
            continue

        # Replace existing Table directive with off
        if in_interface and stripped.startswith("table") and "=" in stripped:
            filtered.append("Table = off\n")
            has_table = True
            continue

        filtered.append(line)

    # If config only has [Interface] section (no [Peer] yet)
    if in_interface and not has_table:
        filtered.append("Table = off\n")

    if removed_dns:
        logger.info(f"Stripped DNS from WireGuard config: {removed_dns}")
    logger.info("Injected Table = off into WireGuard config")

    return "".join(filtered)


def _write_config_file(config: VPNConfig) -> str:
    """Write config content to filesystem. Returns file path."""
    if config.vpn_type == "wireguard":
        os.makedirs(WG_CONF_DIR, exist_ok=True)
        iface = _get_interface_name(config)
        path = os.path.join(WG_CONF_DIR, f"{iface}.conf")
        # Prepare config: strip DNS, add Table=off
        content = _prepare_wg_config(config.config_content)
        with open(path, "w") as f:
            f.write(content)
        os.chmod(path, 0o600)
        return path
    else:
        os.makedirs(OVPN_CONF_DIR, exist_ok=True)
        iface = _get_interface_name(config)
        path = os.path.join(OVPN_CONF_DIR, f"{iface}.conf")
        with open(path, "w") as f:
            f.write(config.config_content)
        os.chmod(path, 0o600)
        return path


def _remove_config_file(config: VPNConfig):
    """Remove config file from filesystem."""
    iface = _get_interface_name(config)
    if config.vpn_type == "wireguard":
        path = os.path.join(WG_CONF_DIR, f"{iface}.conf")
    else:
        path = os.path.join(OVPN_CONF_DIR, f"{iface}.conf")
    try:
        os.remove(path)
    except FileNotFoundError:
        pass


async def connect_vpn(config: VPNConfig) -> dict:
    """Connect a VPN tunnel.

    For WireGuard: uses Table=off so wg-quick only creates the interface
    and establishes the tunnel without modifying any routing. The server's
    network stays completely untouched — all existing connections, SSH,
    API access, notifications etc. continue to work normally.

    The VPN tunnel is available as a network interface (wg{id}) that
    NFS mounts can be configured to use when needed.
    """
    try:
        _validate_vpn_config(config)
    except ValueError as e:
        logger.error(f"VPN config rejected: {e}")
        return {"success": False, "error": str(e), "name": config.name}

    iface = _get_interface_name(config)
    _write_config_file(config)

    if config.vpn_type == "wireguard":
        result = await _run(["wg-quick", "up", iface])
    else:
        conf_path = os.path.join(OVPN_CONF_DIR, f"{iface}.conf")
        result = await _run(
            [
                "openvpn",
                "--config",
                conf_path,
                "--daemon",
                "--log",
                f"/var/log/openvpn-{iface}.log",
                "--writepid",
                f"/run/openvpn-{iface}.pid",
            ]
        )

    if result.returncode != 0:
        logger.error(f"VPN connect failed ({config.vpn_type}): {result.stderr}")
        return {"success": False, "error": result.stderr.strip(), "name": config.name}

    logger.info(f"VPN connected: {config.name} ({config.vpn_type}) on {iface}")
    return {"success": True, "name": config.name}


async def disconnect_vpn(config: VPNConfig) -> dict:
    """Disconnect a VPN tunnel."""
    iface = _get_interface_name(config)

    if config.vpn_type == "wireguard":
        result = await _run(["wg-quick", "down", iface])
    else:
        pid_file = f"/run/openvpn-{iface}.pid"
        try:
            with open(pid_file, "r") as f:
                pid = f.read().strip()
            result = await _run(["kill", pid])
            try:
                os.remove(pid_file)
            except FileNotFoundError:
                pass
        except FileNotFoundError:
            result = await _run(["killall", "openvpn"])

    if result.returncode != 0:
        logger.warning(f"VPN disconnect warning: {result.stderr}")
        return {"success": False, "error": result.stderr.strip()}

    logger.info(f"VPN disconnected: {config.name}")
    return {"success": True}


async def get_vpn_status(config: VPNConfig) -> dict:
    """Get status for a VPN config."""
    iface = _get_interface_name(config)

    if config.vpn_type == "wireguard":
        return await _get_wireguard_status(config, iface)
    else:
        return await _get_openvpn_status(config, iface)


async def _get_wireguard_status(config: VPNConfig, iface: str) -> dict:
    result = await _run(["wg", "show", iface])
    if result.returncode != 0:
        return {
            "id": config.id,
            "name": config.name,
            "vpn_type": "wireguard",
            "is_active": False,
            "interface": iface,
            "endpoint": "",
            "transfer": {},
            "peers": [],
        }

    lines = result.stdout.strip().split("\n")
    peers = []
    transfer = {}
    current_peer = {}
    endpoint = ""

    for line in lines:
        line = line.strip()
        if line.startswith("peer:"):
            if current_peer:
                peers.append(current_peer)
            current_peer = {"public_key": line.split(": ", 1)[1]}
        elif line.startswith("endpoint:"):
            ep = line.split(": ", 1)[1]
            current_peer["endpoint"] = ep
            if not endpoint:
                endpoint = ep
        elif line.startswith("transfer:"):
            transfer["raw"] = line.split(": ", 1)[1]
        elif line.startswith("latest handshake:"):
            current_peer["latest_handshake"] = line.split(": ", 1)[1]
        elif line.startswith("allowed ips:"):
            current_peer["allowed_ips"] = line.split(": ", 1)[1]

    if current_peer:
        peers.append(current_peer)

    return {
        "id": config.id,
        "name": config.name,
        "vpn_type": "wireguard",
        "is_active": True,
        "interface": iface,
        "endpoint": endpoint,
        "transfer": transfer,
        "peers": peers,
    }


async def _get_openvpn_status(config: VPNConfig, iface: str) -> dict:
    pid_file = f"/run/openvpn-{iface}.pid"
    active = os.path.isfile(pid_file)

    if active:
        try:
            with open(pid_file, "r") as f:
                pid = f.read().strip()
            result = await _run(["kill", "-0", pid])
            active = result.returncode == 0
        except Exception:
            active = False

    return {
        "id": config.id,
        "name": config.name,
        "vpn_type": "openvpn",
        "is_active": active,
        "interface": iface,
        "endpoint": "",
        "transfer": {},
        "peers": [],
    }


def cleanup_stale_vpn_state():
    """Clean up any stale VPN state from previous runs.

    Called on startup. Removes leftover routing rules from previous
    code versions that may have modified the routing table.
    """
    # Clean up any stale rules from previous code versions
    for _ in range(50):
        result = subprocess.run(
            ["ip", "rule", "del", "table", "200", "priority", "10"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode != 0:
            break
    for _ in range(50):
        result = subprocess.run(
            ["ip", "rule", "del", "fwmark", "0x100", "table", "200", "priority", "10"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode != 0:
            break
    # Flush old protection table
    subprocess.run(
        ["ip", "route", "flush", "table", "200"],
        capture_output=True,
        text=True,
        timeout=5,
    )
    # Remove stale /1 routes from main table (from previous code versions)
    subprocess.run(
        ["ip", "route", "del", "0.0.0.0/1"],
        capture_output=True,
        text=True,
        timeout=5,
    )
    subprocess.run(
        ["ip", "route", "del", "128.0.0.0/1"],
        capture_output=True,
        text=True,
        timeout=5,
    )
    # Clean up old iptables chain if it exists
    for hook in ["PREROUTING", "OUTPUT"]:
        for _ in range(5):
            r = subprocess.run(
                ["iptables", "-t", "mangle", "-D", hook, "-j", "NFS_VPN_PROTECT"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if r.returncode != 0:
                break
    subprocess.run(
        ["iptables", "-t", "mangle", "-F", "NFS_VPN_PROTECT"],
        capture_output=True,
        text=True,
        timeout=5,
    )
    subprocess.run(
        ["iptables", "-t", "mangle", "-X", "NFS_VPN_PROTECT"],
        capture_output=True,
        text=True,
        timeout=5,
    )
    logger.info("Cleaned up stale VPN routing state")


async def auto_connect_vpn():
    """Auto-connect VPN tunnels on startup."""
    # Clean up stale state from previous container run
    cleanup_stale_vpn_state()

    async with async_session() as session:
        result = await session.execute(
            select(VPNConfig).where(
                VPNConfig.enabled == True,
                VPNConfig.auto_connect == True,
            )
        )
        configs = result.scalars().all()
        results = []
        for config in configs:
            r = await connect_vpn(config)
            if r["success"]:
                config.is_active = True
                session.add(config)
            results.append(r)
        await session.commit()
        return results
