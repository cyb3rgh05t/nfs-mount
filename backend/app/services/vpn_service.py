import asyncio
import logging
import os
import subprocess

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import async_session
from ..models.vpn_config import VPNConfig

logger = logging.getLogger("nfs-manager")

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


async def connect_vpn(config: VPNConfig) -> dict:
    """Connect a VPN tunnel."""
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
                f"--log",
                f"/var/log/openvpn-{iface}.log",
                "--writepid",
                f"/run/openvpn-{iface}.pid",
            ]
        )

    if result.returncode != 0:
        logger.error(f"VPN connect failed ({config.vpn_type}): {result.stderr}")
        return {"success": False, "error": result.stderr.strip(), "name": config.name}

    logger.info(f"VPN connected: {config.name} ({config.vpn_type})")
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
