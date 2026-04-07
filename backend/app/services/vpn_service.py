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


WG_CONF_DIR = "/etc/wireguard"
OVPN_CONF_DIR = "/etc/openvpn"


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


def _write_config_file(config: VPNConfig) -> str:
    """Write config content to filesystem. Returns file path."""
    if config.vpn_type == "wireguard":
        os.makedirs(WG_CONF_DIR, exist_ok=True)
        iface = _get_interface_name(config)
        path = os.path.join(WG_CONF_DIR, f"{iface}.conf")
        with open(path, "w") as f:
            f.write(config.config_content)
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


def _get_default_gateway():
    """Get the default gateway IP and interface."""
    try:
        result = subprocess.run(
            ["ip", "route", "show", "default"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0 and result.stdout.strip():
            # default via 192.168.1.1 dev eth0
            parts = result.stdout.strip().split("\n")[0].split()
            gw_ip = parts[2] if len(parts) > 2 else None
            gw_dev = parts[4] if len(parts) > 4 else None
            return gw_ip, gw_dev
    except Exception:
        pass
    return None, None


def _get_host_ips():
    """Get all non-loopback IPv4 IPs on the host to protect from VPN routing."""
    ips = set()
    try:
        result = subprocess.run(
            ["ip", "-4", "addr", "show"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            for line in result.stdout.split("\n"):
                line = line.strip()
                if line.startswith("inet "):
                    ip = line.split()[1].split("/")[0]
                    if not ip.startswith("127."):
                        ips.add(ip)
    except Exception:
        pass
    return ips


def _has_full_tunnel(config_content: str) -> bool:
    """Check if a VPN config routes all traffic (0.0.0.0/0)."""
    return "0.0.0.0/0" in config_content or "redirect-gateway" in config_content


def _add_route_protection(config: VPNConfig):
    """Add policy routing rules to prevent lockout when VPN routes all traffic.

    Uses 'ip rule from <ip> table main' so that all traffic originating
    from any of the host's real IPs is routed through the real default
    gateway instead of the VPN tunnel. This protects SSH and management
    access for both public servers and NATted/private servers.
    """
    if not _has_full_tunnel(config.config_content):
        return []

    host_ips = _get_host_ips()
    protected = []

    for ip in host_ips:
        try:
            result = subprocess.run(
                ["ip", "rule", "add", "from", ip, "table", "main", "priority", "10"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode == 0:
                logger.info(f"Route protection rule added: from {ip} table main")
                protected.append(ip)
            elif "RTNETLINK answers: File exists" in result.stderr:
                logger.info(f"Rule for {ip} already exists, skipping")
                protected.append(ip)
            else:
                logger.warning(f"Failed to add rule for {ip}: {result.stderr}")
        except Exception as e:
            logger.warning(f"Route protection error for {ip}: {e}")

    return protected


def _remove_route_protection(config: VPNConfig):
    """Remove policy routing rules added for host IP protection."""
    if not _has_full_tunnel(config.config_content):
        return

    host_ips = _get_host_ips()
    for ip in host_ips:
        try:
            subprocess.run(
                ["ip", "rule", "del", "from", ip, "table", "main", "priority", "10"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            logger.info(f"Route protection rule removed: {ip}")
        except Exception:
            pass


async def connect_vpn(config: VPNConfig) -> dict:
    """Connect a VPN tunnel."""
    # Validate config content before writing to disk
    try:
        _validate_vpn_config(config)
    except ValueError as e:
        logger.error(f"VPN config rejected: {e}")
        return {"success": False, "error": str(e), "name": config.name}

    iface = _get_interface_name(config)
    _write_config_file(config)

    # Protect host IPs from being routed through VPN (prevents lockout)
    protected_ips = _add_route_protection(config)
    if protected_ips:
        logger.info(
            f"Route protection active for {len(protected_ips)} IP(s) before starting {config.name}"
        )

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
                f"--log",
                f"/var/log/openvpn-{iface}.log",
                "--writepid",
                f"/run/openvpn-{iface}.pid",
            ]
        )

    if result.returncode != 0:
        logger.error(f"VPN connect failed ({config.vpn_type}): {result.stderr}")
        # Clean up route protection on failure
        _remove_route_protection(config)
        return {"success": False, "error": result.stderr.strip(), "name": config.name}

    logger.info(f"VPN connected: {config.name} ({config.vpn_type})")
    return {"success": True, "name": config.name}


async def disconnect_vpn(config: VPNConfig) -> dict:
    """Disconnect a VPN tunnel."""
    iface = _get_interface_name(config)

    # Remove route protection before disconnect (routes no longer needed after tunnel is down)
    _remove_route_protection(config)

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
            result = await _run(["killall", f"openvpn"])

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


async def auto_connect_vpn():
    """Auto-connect VPN tunnels on startup."""
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
