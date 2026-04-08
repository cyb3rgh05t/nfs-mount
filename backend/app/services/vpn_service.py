import asyncio
import ipaddress
import json
import logging
import os
import re
import subprocess

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import async_session
from ..models.vpn_config import VPNConfig

logger = logging.getLogger("nfs-manager.service.vpn")

# Dedicated routing table for VPN lockout protection.
PROTECT_TABLE = "200"
# Firewall mark for incoming-connection protection (connmark)
PROTECT_MARK = "0x100/0x100"
PROTECT_MARK_VALUE = "0x100"
# iptables chain for our rules (easy cleanup)
PROTECT_CHAIN = "NFS_VPN_PROTECT"
# File to persist gateway info across container restarts
GATEWAY_CACHE_FILE = "/data/vpn_gateway.json"

# In-memory cache of gateway info per VPN id
_vpn_gateway_cache: dict[int, tuple[str, str]] = {}

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


def _extract_wg_endpoint(config_content: str) -> str | None:
    """Extract endpoint IP from WireGuard config."""
    for line in config_content.splitlines():
        stripped = line.strip()
        if stripped.lower().startswith("endpoint") and "=" in stripped:
            val = stripped.split("=", 1)[1].strip()
            # Endpoint = 69.16.145.215:51820
            host = val.rsplit(":", 1)[0]
            # Handle IPv6 [addr]:port format
            host = host.strip("[]")
            return host
    return None


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


def _get_host_subnets():
    """Get all non-loopback IPv4 subnets (CIDR) and their devices."""
    subnets = []
    try:
        result = subprocess.run(
            ["ip", "-4", "addr", "show"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            current_dev = None
            for line in result.stdout.split("\n"):
                # Lines like "2: eth0: <BROADCAST..."
                if not line.startswith(" "):
                    parts = line.split(":")
                    if len(parts) >= 2:
                        current_dev = parts[1].strip().split("@")[0]
                line = line.strip()
                if line.startswith("inet ") and current_dev:
                    addr_cidr = line.split()[1]  # e.g. "192.168.1.100/24"
                    ip_str, prefix = addr_cidr.split("/")
                    if not ip_str.startswith("127."):
                        net = ipaddress.ip_network(f"{ip_str}/{prefix}", strict=False)
                        subnets.append((str(net), current_dev))
    except Exception:
        pass
    return subnets


def _has_full_tunnel(config_content: str) -> bool:
    """Check if a VPN config routes all traffic through the tunnel."""
    content_lower = config_content.lower()
    if "0.0.0.0/0" in config_content:
        return True
    if "redirect-gateway" in content_lower:
        return True
    if "0.0.0.0/1" in config_content and "128.0.0.0/1" in config_content:
        return True
    return False


def _set_rp_filter_loose():
    """Set reverse path filtering to loose mode on all interfaces.

    Critical: with strict rp_filter, the kernel drops incoming packets
    when the reverse route goes through a different interface (the VPN).
    """
    try:
        subprocess.run(
            ["sysctl", "-w", "net.ipv4.conf.all.rp_filter=2"],
            capture_output=True, text=True, timeout=5,
        )
        subprocess.run(
            ["sysctl", "-w", "net.ipv4.conf.default.rp_filter=2"],
            capture_output=True, text=True, timeout=5,
        )
        result = subprocess.run(
            ["ip", "-o", "link", "show"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0:
            for line in result.stdout.strip().split("\n"):
                parts = line.split(": ")
                if len(parts) >= 2:
                    dev = parts[1].split("@")[0]
                    if dev != "lo" and not dev.startswith(("wg", "ovpn", "tun", "tap")):
                        subprocess.run(
                            ["sysctl", "-w", f"net.ipv4.conf.{dev}.rp_filter=2"],
                            capture_output=True, text=True, timeout=5,
                        )
        logger.info("Set rp_filter=2 (loose) on all interfaces")
    except Exception as e:
        logger.warning(f"Failed to set rp_filter: {e}")


def _save_gateway_info(gw_ip: str, gw_dev: str):
    """Persist gateway info so cleanup can work after container restart."""
    try:
        with open(GATEWAY_CACHE_FILE, "w") as f:
            json.dump({"gw_ip": gw_ip, "gw_dev": gw_dev}, f)
    except Exception:
        pass


def _load_gateway_info() -> tuple[str | None, str | None]:
    """Load persisted gateway info."""
    try:
        with open(GATEWAY_CACHE_FILE, "r") as f:
            data = json.load(f)
        return data.get("gw_ip"), data.get("gw_dev")
    except Exception:
        return None, None


def _setup_iptables_connmark(gw_dev: str):
    """Set up iptables connmark rules to protect incoming connections.

    Marks incoming connections on the physical interface so that response
    packets are routed via the original gateway instead of through the VPN.
    New outgoing connections (e.g. NFS to remote servers) go through VPN.
    """
    # Create our chain (ignore error if already exists)
    subprocess.run(
        ["iptables", "-t", "mangle", "-N", PROTECT_CHAIN],
        capture_output=True, text=True, timeout=5,
    )
    # Flush our chain (idempotent)
    subprocess.run(
        ["iptables", "-t", "mangle", "-F", PROTECT_CHAIN],
        capture_output=True, text=True, timeout=5,
    )

    # Rule 1: Mark connections entering on the physical interface
    subprocess.run(
        ["iptables", "-t", "mangle", "-A", PROTECT_CHAIN,
         "-i", gw_dev, "-j", "CONNMARK", "--set-mark", PROTECT_MARK],
        capture_output=True, text=True, timeout=5,
    )
    # Rule 2: Restore connection mark to packet mark on outgoing packets
    subprocess.run(
        ["iptables", "-t", "mangle", "-A", PROTECT_CHAIN,
         "-m", "connmark", "--mark", PROTECT_MARK,
         "-j", "MARK", "--set-mark", PROTECT_MARK],
        capture_output=True, text=True, timeout=5,
    )

    # Hook our chain into PREROUTING and OUTPUT (check first to avoid duplicates)
    for hook in ["PREROUTING", "OUTPUT"]:
        check = subprocess.run(
            ["iptables", "-t", "mangle", "-C", hook, "-j", PROTECT_CHAIN],
            capture_output=True, text=True, timeout=5,
        )
        if check.returncode != 0:
            subprocess.run(
                ["iptables", "-t", "mangle", "-I", hook, "1", "-j", PROTECT_CHAIN],
                capture_output=True, text=True, timeout=5,
            )

    logger.info(f"Connmark protection active on {gw_dev}")


def _teardown_iptables_connmark():
    """Remove all iptables connmark rules."""
    # Unhook from PREROUTING and OUTPUT
    for hook in ["PREROUTING", "OUTPUT"]:
        for _ in range(5):  # remove all references
            result = subprocess.run(
                ["iptables", "-t", "mangle", "-D", hook, "-j", PROTECT_CHAIN],
                capture_output=True, text=True, timeout=5,
            )
            if result.returncode != 0:
                break

    # Flush and delete our chain
    subprocess.run(
        ["iptables", "-t", "mangle", "-F", PROTECT_CHAIN],
        capture_output=True, text=True, timeout=5,
    )
    subprocess.run(
        ["iptables", "-t", "mangle", "-X", PROTECT_CHAIN],
        capture_output=True, text=True, timeout=5,
    )
    logger.info("Connmark protection removed")


def _setup_protection(gw_ip: str, gw_dev: str):
    """Set up full network protection before VPN starts.

    Three layers:
    1. rp_filter=2 — prevents kernel from dropping incoming packets
    2. Connmark — marks incoming connections, responses bypass VPN
    3. Policy routing — marked packets use protection table with original gateway
    """
    # Layer 1: Reverse path filter
    _set_rp_filter_loose()

    # Layer 2: Protection routing table with original gateway
    subprocess.run(
        ["ip", "route", "replace", "default", "via", gw_ip, "dev", gw_dev,
         "table", PROTECT_TABLE],
        capture_output=True, text=True, timeout=5,
    )
    for subnet, dev in _get_host_subnets():
        subprocess.run(
            ["ip", "route", "replace", subnet, "dev", dev, "table", PROTECT_TABLE],
            capture_output=True, text=True, timeout=5,
        )
    logger.info(f"Protection table {PROTECT_TABLE}: default via {gw_ip} dev {gw_dev}")

    # Layer 3: Connmark (marks incoming connections on physical interface)
    _setup_iptables_connmark(gw_dev)

    # Layer 4: Route marked packets via protection table
    # Delete any stale rule first
    subprocess.run(
        ["ip", "rule", "del", "fwmark", PROTECT_MARK_VALUE, "table", PROTECT_TABLE,
         "priority", "10"],
        capture_output=True, text=True, timeout=5,
    )
    result = subprocess.run(
        ["ip", "rule", "add", "fwmark", PROTECT_MARK_VALUE, "table", PROTECT_TABLE,
         "priority", "10"],
        capture_output=True, text=True, timeout=5,
    )
    if result.returncode == 0:
        logger.info(f"Policy routing: fwmark {PROTECT_MARK_VALUE} → table {PROTECT_TABLE}")
    else:
        logger.warning(f"Failed to add fwmark rule: {result.stderr}")

    # Persist gateway info for cleanup after restart
    _save_gateway_info(gw_ip, gw_dev)


def _teardown_protection():
    """Remove all protection (connmark, rules, routes)."""
    # Remove fwmark rule
    for _ in range(5):
        result = subprocess.run(
            ["ip", "rule", "del", "fwmark", PROTECT_MARK_VALUE, "table", PROTECT_TABLE,
             "priority", "10"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode != 0:
            break

    # Remove iptables connmark
    _teardown_iptables_connmark()

    # Flush protection routing table
    subprocess.run(
        ["ip", "route", "flush", "table", PROTECT_TABLE],
        capture_output=True, text=True, timeout=5,
    )
    logger.info("All protection removed")


def _setup_wg_routes(config: VPNConfig, iface: str, gw_ip: str, gw_dev: str):
    """Set up routing after WireGuard interface is created (Table=off mode).

    Since Table=off prevents wg-quick from managing routes, we add:
    - Endpoint route via original gateway (keeps VPN tunnel reachable)
    - 0.0.0.0/1 + 128.0.0.0/1 via VPN interface (catches all traffic)
    The /1 routes are more specific than the /0 default, so all non-protected
    traffic goes through VPN while the original default route stays intact.
    """
    # Route VPN endpoint through original gateway
    endpoint = _extract_wg_endpoint(config.config_content)
    if endpoint:
        subprocess.run(
            ["ip", "route", "replace", f"{endpoint}/32", "via", gw_ip, "dev", gw_dev],
            capture_output=True, text=True, timeout=5,
        )
        logger.info(f"Endpoint route: {endpoint} via {gw_ip} dev {gw_dev}")

    # Route all traffic through VPN using /1 routes (more specific than default)
    subprocess.run(
        ["ip", "route", "replace", "0.0.0.0/1", "dev", iface],
        capture_output=True, text=True, timeout=5,
    )
    subprocess.run(
        ["ip", "route", "replace", "128.0.0.0/1", "dev", iface],
        capture_output=True, text=True, timeout=5,
    )
    logger.info(f"VPN routes added: 0.0.0.0/1 + 128.0.0.0/1 dev {iface}")


def _teardown_wg_routes(config: VPNConfig, iface: str):
    """Remove VPN routes before WireGuard interface goes down."""
    subprocess.run(
        ["ip", "route", "del", "0.0.0.0/1", "dev", iface],
        capture_output=True, text=True, timeout=5,
    )
    subprocess.run(
        ["ip", "route", "del", "128.0.0.0/1", "dev", iface],
        capture_output=True, text=True, timeout=5,
    )
    endpoint = _extract_wg_endpoint(config.config_content)
    if endpoint:
        subprocess.run(
            ["ip", "route", "del", f"{endpoint}/32"],
            capture_output=True, text=True, timeout=5,
        )
    logger.info(f"VPN routes removed for {iface}")


async def connect_vpn(config: VPNConfig) -> dict:
    """Connect a VPN tunnel."""
    # Validate config content before writing to disk
    try:
        _validate_vpn_config(config)
    except ValueError as e:
        logger.error(f"VPN config rejected: {e}")
        return {"success": False, "error": str(e), "name": config.name}

    iface = _get_interface_name(config)

    # Save gateway BEFORE VPN changes anything
    gw_ip, gw_dev = _get_default_gateway()
    if gw_ip and gw_dev:
        _vpn_gateway_cache[config.id] = (gw_ip, gw_dev)
    else:
        logger.warning("No default gateway found — VPN may cause lockout")

    _write_config_file(config)

    # Set up protection BEFORE starting VPN
    if gw_ip and gw_dev:
        _setup_protection(gw_ip, gw_dev)

    if config.vpn_type == "wireguard":
        result = await _run(["wg-quick", "up", iface])
        # With Table=off, wg-quick brings up the interface but doesn't touch routing
        # We manage routes ourselves
        if result.returncode == 0 and gw_ip and gw_dev:
            _setup_wg_routes(config, iface, gw_ip, gw_dev)
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
        # Clean up protection on failure
        _teardown_protection()
        _vpn_gateway_cache.pop(config.id, None)
        return {"success": False, "error": result.stderr.strip(), "name": config.name}

    logger.info(f"VPN connected: {config.name} ({config.vpn_type})")
    return {"success": True, "name": config.name}


async def disconnect_vpn(config: VPNConfig) -> dict:
    """Disconnect a VPN tunnel."""
    iface = _get_interface_name(config)

    # For WireGuard: remove our manual routes BEFORE wg-quick down
    if config.vpn_type == "wireguard":
        _teardown_wg_routes(config, iface)
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

    # Remove protection AFTER VPN is down
    _teardown_protection()
    _vpn_gateway_cache.pop(config.id, None)

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


def cleanup_stale_route_protection():
    """Remove any stale protection from previous runs.

    Called on startup to ensure a clean routing/iptables state before any VPN
    connections are made. Handles container restarts while VPN was active.
    """
    # Remove fwmark rules
    removed = 0
    for _ in range(50):
        result = subprocess.run(
            ["ip", "rule", "del", "fwmark", PROTECT_MARK_VALUE, "table", PROTECT_TABLE,
             "priority", "10"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode != 0:
            break
        removed += 1

    # Also remove any old-style from-ip rules (from previous code versions)
    for _ in range(50):
        result = subprocess.run(
            ["ip", "rule", "del", "table", PROTECT_TABLE, "priority", "10"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode != 0:
            break
        removed += 1

    # Remove stale /1 VPN routes from main table
    subprocess.run(
        ["ip", "route", "del", "0.0.0.0/1"],
        capture_output=True, text=True, timeout=5,
    )
    subprocess.run(
        ["ip", "route", "del", "128.0.0.0/1"],
        capture_output=True, text=True, timeout=5,
    )

    # Flush protection routing table
    subprocess.run(
        ["ip", "route", "flush", "table", PROTECT_TABLE],
        capture_output=True, text=True, timeout=5,
    )

    # Clean up iptables
    _teardown_iptables_connmark()

    if removed > 0:
        logger.info(
            f"Cleaned up {removed} stale route protection rule(s) from previous run"
        )


async def auto_connect_vpn():
    """Auto-connect VPN tunnels on startup."""
    # Clean up stale protection rules from previous container run
    cleanup_stale_route_protection()

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
