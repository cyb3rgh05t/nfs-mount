"""
Firewall service for NFS protection using iptables.

Manages iptables rules to restrict NFS-related ports (111, 2049, fixed mountd/nlockmgr)
so that only explicitly allowed hosts can reach the NFS server.

For NFS clients, outgoing NFS traffic is restricted to only configured server IPs.

VPN-Only mode: when enabled, NFS server ports are ONLY accessible via VPN interfaces
(wg*, ovpn*), blocking all access from public interfaces even for allowed hosts.

Chain layout:
  NFS_EXPORT_PROTECT  – INPUT chain: protect NFS server ports
  NFS_CLIENT_PROTECT  – OUTPUT chain: restrict outbound NFS traffic to known servers
"""

import asyncio
import glob
import ipaddress
import logging
import os
import subprocess

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import async_session
from ..models.nfs_export import NFSExport
from ..models.nfs_mount import NFSMount

logger = logging.getLogger("nfs-manager.service.firewall")

# Fixed ports for mountd and nlockmgr (set in entrypoint.sh)
MOUNTD_PORT = 32767
NLOCKMGR_PORT = 32768
STATD_PORT = 32769

# Persistent state file for VPN-only mode
_VPN_ONLY_STATE_FILE = "/data/firewall_vpn_only.flag"

# NFS server ports to protect
NFS_SERVER_PORTS = [
    (111, "tcp"),  # rpcbind
    (111, "udp"),  # rpcbind
    (2049, "tcp"),  # nfsd
    (2049, "udp"),  # nfsd
    (MOUNTD_PORT, "tcp"),  # mountd (fixed)
    (MOUNTD_PORT, "udp"),  # mountd (fixed)
    (NLOCKMGR_PORT, "tcp"),  # nlockmgr (fixed)
    (NLOCKMGR_PORT, "udp"),  # nlockmgr (fixed)
    (STATD_PORT, "tcp"),  # statd (fixed)
    (STATD_PORT, "udp"),  # statd (fixed)
]

# NFS client ports (outbound)
NFS_CLIENT_PORTS = [
    (111, "tcp"),
    (111, "udp"),
    (2049, "tcp"),
    (2049, "udp"),
]

EXPORT_CHAIN = "NFS_EXPORT_PROTECT"
CLIENT_CHAIN = "NFS_CLIENT_PROTECT"


def is_vpn_only_enabled() -> bool:
    """Check if VPN-only mode is enabled (persistent across restarts)."""
    return os.path.isfile(_VPN_ONLY_STATE_FILE)


def set_vpn_only(enabled: bool):
    """Enable or disable VPN-only mode persistently."""
    if enabled:
        os.makedirs(os.path.dirname(_VPN_ONLY_STATE_FILE), exist_ok=True)
        with open(_VPN_ONLY_STATE_FILE, "w") as f:
            f.write("1")
        logger.info("VPN-only mode enabled")
    else:
        try:
            os.remove(_VPN_ONLY_STATE_FILE)
        except FileNotFoundError:
            pass
        logger.info("VPN-only mode disabled")


def _get_vpn_interfaces() -> list[str]:
    """Detect active VPN interfaces (wg*, ovpn*, tun*)."""
    interfaces = []
    try:
        for path in glob.glob("/sys/class/net/*"):
            iface = os.path.basename(path)
            if iface.startswith(("wg", "ovpn", "tun")):
                interfaces.append(iface)
    except Exception:
        pass
    return interfaces


def _run_ipt(args: list[str], timeout: int = 10) -> subprocess.CompletedProcess:
    """Run an iptables command synchronously."""
    cmd = ["iptables"] + args
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


def _chain_exists(chain: str, table: str = "filter") -> bool:
    """Check if an iptables chain exists."""
    r = _run_ipt(["-t", table, "-L", chain, "-n"], timeout=5)
    return r.returncode == 0


def _ensure_chain(chain: str, table: str = "filter"):
    """Create chain if it doesn't exist."""
    if not _chain_exists(chain, table):
        _run_ipt(["-t", table, "-N", chain])
        logger.info(f"Created iptables chain {chain}")


def _flush_chain(chain: str, table: str = "filter"):
    """Flush all rules from a chain."""
    if _chain_exists(chain, table):
        _run_ipt(["-t", table, "-F", chain])


def _remove_jump(hook: str, chain: str, table: str = "filter"):
    """Remove all jump rules from hook to chain."""
    for _ in range(10):
        r = _run_ipt(["-t", table, "-D", hook, "-j", chain])
        if r.returncode != 0:
            break


def _add_jump(hook: str, chain: str, table: str = "filter"):
    """Add a jump rule from hook to chain (if not already present)."""
    # Check if already exists
    r = _run_ipt(["-t", table, "-C", hook, "-j", chain])
    if r.returncode != 0:
        _run_ipt(["-t", table, "-I", hook, "1", "-j", chain])


def _parse_allowed_hosts(hosts_str: str) -> list[str]:
    """
    Parse allowed_hosts string into list of IP/CIDR entries.
    Handles: single IP, CIDR, comma-separated, '*' (means all = no restriction).
    """
    hosts_str = hosts_str.strip()
    if not hosts_str or hosts_str == "*":
        return ["0.0.0.0/0"]

    results = []
    for part in hosts_str.replace(";", ",").split(","):
        part = part.strip()
        if not part:
            continue
        # Strip optional NFS export parentheses like "192.168.1.0/24(rw,sync)"
        if "(" in part:
            part = part.split("(")[0].strip()
        try:
            # Validate as IP or network
            if "/" in part:
                ipaddress.ip_network(part, strict=False)
            else:
                ipaddress.ip_address(part)
                part = part + "/32"
            results.append(part)
        except ValueError:
            logger.warning(f"Skipping invalid host entry: {part}")
    return results if results else ["0.0.0.0/0"]


async def apply_export_firewall(db: AsyncSession | None = None) -> dict:
    """
    Rebuild NFS export (server) firewall rules.
    Allows only IPs from enabled exports to reach NFS server ports.
    If no exports are configured, removes the firewall chain entirely
    to avoid blocking NFS traffic on a fresh/unconfigured system.
    """
    try:
        close_session = False
        if db is None:
            db = async_session()
            close_session = True

        try:
            result = await db.execute(
                select(NFSExport).where(NFSExport.enabled == True)  # noqa: E712
            )
            exports = result.scalars().all()
        finally:
            if close_session:
                await db.close()

        # No exports configured — remove firewall chain to avoid blocking
        if not exports:
            logger.info(
                "No NFS exports configured — skipping export firewall "
                "(removing chain if present)"
            )
            await remove_export_firewall()
            return {
                "success": True,
                "exports_count": 0,
                "allowed_hosts": [],
                "vpn_only": False,
                "vpn_interfaces": [],
                "skipped": True,
            }

        # Collect unique allowed hosts
        allowed_cidrs = set()
        for exp in exports:
            for cidr in _parse_allowed_hosts(exp.allowed_hosts):
                allowed_cidrs.add(cidr)

        # Always allow loopback
        allowed_cidrs.add("127.0.0.0/8")

        loop = asyncio.get_event_loop()
        vpn_only = is_vpn_only_enabled()
        vpn_ifaces = _get_vpn_interfaces() if vpn_only else []
        await loop.run_in_executor(
            None, lambda: _apply_export_rules(allowed_cidrs, vpn_only, vpn_ifaces)
        )

        logger.info(
            f"Export firewall applied: {len(exports)} exports, "
            f"{len(allowed_cidrs)} allowed CIDRs"
            f"{', VPN-only mode (' + ','.join(vpn_ifaces) + ')' if vpn_only and vpn_ifaces else ''}"
        )
        return {
            "success": True,
            "exports_count": len(exports),
            "allowed_hosts": sorted(allowed_cidrs),
            "vpn_only": vpn_only,
            "vpn_interfaces": vpn_ifaces,
        }

    except Exception as e:
        logger.error(f"Failed to apply export firewall: {e}")
        return {"success": False, "error": str(e)}


def _apply_export_rules(
    allowed_cidrs: set[str], vpn_only: bool = False, vpn_ifaces: list[str] | None = None
):
    """Synchronous iptables rule application for export protection."""
    _ensure_chain(EXPORT_CHAIN)
    _flush_chain(EXPORT_CHAIN)

    # Allow established/related connections
    _run_ipt(
        [
            "-A",
            EXPORT_CHAIN,
            "-m",
            "state",
            "--state",
            "ESTABLISHED,RELATED",
            "-j",
            "RETURN",
        ]
    )

    # Always allow loopback interface
    for port, proto in NFS_SERVER_PORTS:
        _run_ipt(
            [
                "-A",
                EXPORT_CHAIN,
                "-i",
                "lo",
                "-p",
                proto,
                "--dport",
                str(port),
                "-j",
                "ACCEPT",
            ]
        )

    if vpn_only and vpn_ifaces:
        # VPN-ONLY MODE: only allow NFS access via VPN interfaces
        for iface in vpn_ifaces:
            for cidr in sorted(allowed_cidrs):
                if cidr == "127.0.0.0/8":
                    continue  # already handled via lo above
                for port, proto in NFS_SERVER_PORTS:
                    _run_ipt(
                        [
                            "-A",
                            EXPORT_CHAIN,
                            "-i",
                            iface,
                            "-p",
                            proto,
                            "-s",
                            cidr,
                            "--dport",
                            str(port),
                            "-j",
                            "ACCEPT",
                        ]
                    )
    else:
        # STANDARD MODE: allow by IP regardless of interface
        for cidr in sorted(allowed_cidrs):
            if cidr == "127.0.0.0/8":
                continue  # already handled via lo above
            for port, proto in NFS_SERVER_PORTS:
                _run_ipt(
                    [
                        "-A",
                        EXPORT_CHAIN,
                        "-p",
                        proto,
                        "-s",
                        cidr,
                        "--dport",
                        str(port),
                        "-j",
                        "ACCEPT",
                    ]
                )

    # Drop everything else on NFS ports
    for port, proto in NFS_SERVER_PORTS:
        _run_ipt(
            [
                "-A",
                EXPORT_CHAIN,
                "-p",
                proto,
                "--dport",
                str(port),
                "-j",
                "DROP",
            ]
        )

    # Hook into INPUT
    _remove_jump("INPUT", EXPORT_CHAIN)
    _add_jump("INPUT", EXPORT_CHAIN)


def _get_system_nfs_server_ips() -> set[str]:
    """
    Detect NFS server IPs from currently active system mounts (/proc/mounts).
    This prevents the client firewall from making existing non-DB mounts stale.
    """
    ips = set()
    try:
        with open("/proc/mounts", "r") as f:
            for line in f:
                parts = line.split()
                if len(parts) >= 3 and "nfs" in parts[2]:
                    # device is like "192.168.1.10:/share"
                    device = parts[0]
                    if ":" in device:
                        host = device.split(":")[0]
                        try:
                            ipaddress.ip_address(host)
                            ips.add(host + "/32")
                        except ValueError:
                            pass
    except Exception:
        pass
    return ips


async def apply_client_firewall(db: AsyncSession | None = None) -> dict:
    """
    Rebuild NFS client firewall rules.
    Restricts outbound NFS traffic to only configured server IPs.
    Also includes IPs from existing system NFS mounts to avoid making them stale.
    If no DB mounts and no system mounts exist, removes the chain entirely.
    """
    try:
        close_session = False
        if db is None:
            db = async_session()
            close_session = True

        try:
            result = await db.execute(
                select(NFSMount).where(NFSMount.enabled == True)  # noqa: E712
            )
            mounts = result.scalars().all()
        finally:
            if close_session:
                await db.close()

        # Collect unique server IPs from DB
        server_ips = set()
        for m in mounts:
            ip = m.server_ip.strip()
            try:
                ipaddress.ip_address(ip)
                server_ips.add(ip + "/32")
            except ValueError:
                logger.warning(f"Skipping invalid server IP: {ip}")

        # Also include IPs from existing system NFS mounts
        system_ips = _get_system_nfs_server_ips()
        if system_ips:
            logger.info(
                f"Detected {len(system_ips)} existing system NFS mount(s), "
                f"adding to allowed servers: {sorted(system_ips)}"
            )
            server_ips.update(system_ips)

        # No mounts at all — remove firewall chain to avoid blocking
        if not mounts and not system_ips:
            logger.info(
                "No NFS mounts configured or active — skipping client firewall "
                "(removing chain if present)"
            )
            await remove_client_firewall()
            return {
                "success": True,
                "mounts_count": 0,
                "allowed_servers": [],
                "skipped": True,
            }

        # Always allow loopback
        server_ips.add("127.0.0.0/8")

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: _apply_client_rules(server_ips))

        logger.info(
            f"Client firewall applied: {len(mounts)} DB mounts + "
            f"{len(system_ips)} system mounts, "
            f"{len(server_ips)} allowed servers"
        )
        return {
            "success": True,
            "mounts_count": len(mounts),
            "allowed_servers": sorted(server_ips),
        }

    except Exception as e:
        logger.error(f"Failed to apply client firewall: {e}")
        return {"success": False, "error": str(e)}


def _apply_client_rules(server_ips: set[str]):
    """Synchronous iptables rule application for client protection."""
    _ensure_chain(CLIENT_CHAIN)
    _flush_chain(CLIENT_CHAIN)

    # Allow established/related connections
    _run_ipt(
        [
            "-A",
            CLIENT_CHAIN,
            "-m",
            "state",
            "--state",
            "ESTABLISHED,RELATED",
            "-j",
            "RETURN",
        ]
    )

    # For each allowed server, allow outbound NFS traffic
    for ip in sorted(server_ips):
        for port, proto in NFS_CLIENT_PORTS:
            _run_ipt(
                [
                    "-A",
                    CLIENT_CHAIN,
                    "-p",
                    proto,
                    "-d",
                    ip,
                    "--dport",
                    str(port),
                    "-j",
                    "ACCEPT",
                ]
            )

    # Drop all other outbound NFS traffic
    for port, proto in NFS_CLIENT_PORTS:
        _run_ipt(
            [
                "-A",
                CLIENT_CHAIN,
                "-p",
                proto,
                "--dport",
                str(port),
                "-j",
                "DROP",
            ]
        )

    # Hook into OUTPUT
    _remove_jump("OUTPUT", CLIENT_CHAIN)
    _add_jump("OUTPUT", CLIENT_CHAIN)


async def apply_all_firewall_rules(db: AsyncSession | None = None) -> dict:
    """Apply both export and client firewall rules."""
    export_result = await apply_export_firewall(db)
    client_result = await apply_client_firewall(db)
    return {
        "success": export_result["success"] and client_result["success"],
        "export": export_result,
        "client": client_result,
    }


async def remove_export_firewall() -> dict:
    """Remove all export firewall rules (disable protection)."""
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _remove_export_rules)
        logger.info("Export firewall rules removed")
        return {"success": True}
    except Exception as e:
        logger.error(f"Failed to remove export firewall: {e}")
        return {"success": False, "error": str(e)}


def _remove_export_rules():
    """Synchronous removal of export firewall rules."""
    _remove_jump("INPUT", EXPORT_CHAIN)
    _flush_chain(EXPORT_CHAIN)
    if _chain_exists(EXPORT_CHAIN):
        _run_ipt(["-X", EXPORT_CHAIN])


async def remove_client_firewall() -> dict:
    """Remove all client firewall rules (disable protection)."""
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _remove_client_rules)
        logger.info("Client firewall rules removed")
        return {"success": True}
    except Exception as e:
        logger.error(f"Failed to remove client firewall: {e}")
        return {"success": False, "error": str(e)}


def _remove_client_rules():
    """Synchronous removal of client firewall rules."""
    _remove_jump("OUTPUT", CLIENT_CHAIN)
    _flush_chain(CLIENT_CHAIN)
    if _chain_exists(CLIENT_CHAIN):
        _run_ipt(["-X", CLIENT_CHAIN])


async def remove_all_firewall_rules() -> dict:
    """Remove all NFS firewall rules."""
    export_result = await remove_export_firewall()
    client_result = await remove_client_firewall()
    return {
        "success": export_result["success"] and client_result["success"],
        "export": export_result,
        "client": client_result,
    }


async def get_firewall_status() -> dict:
    """Get current firewall status and active rules."""
    loop = asyncio.get_event_loop()
    status = await loop.run_in_executor(None, _get_status)
    return status


def _get_status() -> dict:
    """Synchronous firewall status check."""
    export_active = _chain_exists(EXPORT_CHAIN)
    client_active = _chain_exists(CLIENT_CHAIN)

    export_rules = []
    client_rules = []

    if export_active:
        r = _run_ipt(["-L", EXPORT_CHAIN, "-n", "--line-numbers"])
        if r.returncode == 0:
            export_rules = [
                line.strip()
                for line in r.stdout.strip().split("\n")[2:]
                if line.strip()
            ]

    if client_active:
        r = _run_ipt(["-L", CLIENT_CHAIN, "-n", "--line-numbers"])
        if r.returncode == 0:
            client_rules = [
                line.strip()
                for line in r.stdout.strip().split("\n")[2:]
                if line.strip()
            ]

    return {
        "export_protection": {
            "active": export_active and len(export_rules) > 0,
            "chain": EXPORT_CHAIN,
            "rules_count": len(export_rules),
            "rules": export_rules,
        },
        "client_protection": {
            "active": client_active and len(client_rules) > 0,
            "chain": CLIENT_CHAIN,
            "rules_count": len(client_rules),
            "rules": client_rules,
        },
        "vpn_only": is_vpn_only_enabled(),
        "vpn_interfaces": _get_vpn_interfaces(),
        "fixed_ports": {
            "mountd": MOUNTD_PORT,
            "nlockmgr": NLOCKMGR_PORT,
            "statd": STATD_PORT,
        },
    }
