import asyncio
import os
import subprocess
import logging

import psutil

logger = logging.getLogger("nfs-manager")


async def _run(cmd: list[str], timeout: int = 10) -> subprocess.CompletedProcess:
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


def get_system_stats() -> dict:
    """Get current system resource statistics."""
    mem = psutil.virtual_memory()

    try:
        load = list(os.getloadavg())
    except (AttributeError, OSError):
        # os.getloadavg() not available on Windows
        cpu = psutil.cpu_percent(interval=0.1)
        load = [cpu, cpu, cpu]

    disks = []
    for part in psutil.disk_partitions():
        try:
            usage = psutil.disk_usage(part.mountpoint)
            disks.append(
                {
                    "device": part.device,
                    "mountpoint": part.mountpoint,
                    "fstype": part.fstype,
                    "total": usage.total,
                    "used": usage.used,
                    "free": usage.free,
                    "percent": usage.percent,
                }
            )
        except PermissionError:
            continue

    net = psutil.net_io_counters()

    return {
        "cpu_percent": psutil.cpu_percent(interval=0.5),
        "memory_total": mem.total,
        "memory_used": mem.used,
        "memory_percent": mem.percent,
        "disk_stats": disks,
        "network_io": {
            "bytes_sent": net.bytes_sent,
            "bytes_recv": net.bytes_recv,
            "packets_sent": net.packets_sent,
            "packets_recv": net.packets_recv,
        },
        "load_avg": load,
    }


async def get_vpn_status() -> dict:
    """Get WireGuard VPN status."""
    try:
        result = await _run(["wg", "show", "wg0"])
    except Exception:
        return {
            "active": False,
            "interface": "wg0",
            "peers": [],
            "transfer": {},
        }
    if result.returncode != 0:
        return {
            "active": False,
            "interface": "wg0",
            "peers": [],
            "transfer": {},
        }

    # Parse wg show output
    lines = result.stdout.strip().split("\n")
    peers = []
    transfer = {}
    current_peer = {}

    for line in lines:
        line = line.strip()
        if line.startswith("peer:"):
            if current_peer:
                peers.append(current_peer)
            current_peer = {"public_key": line.split(": ", 1)[1]}
        elif line.startswith("endpoint:"):
            current_peer["endpoint"] = line.split(": ", 1)[1]
        elif line.startswith("transfer:"):
            parts = line.split(": ", 1)[1]
            transfer["raw"] = parts
        elif line.startswith("latest handshake:"):
            current_peer["latest_handshake"] = line.split(": ", 1)[1]

    if current_peer:
        peers.append(current_peer)

    return {
        "active": True,
        "interface": "wg0",
        "peers": peers,
        "transfer": transfer,
    }


def get_kernel_params() -> list[dict]:
    """Read current kernel tuning parameters relevant to NFS."""
    params = [
        "sunrpc.tcp_max_slot_table_entries",
        "net.core.rmem_max",
        "net.core.wmem_max",
        "net.core.rmem_default",
        "net.core.wmem_default",
        "vm.dirty_ratio",
        "vm.dirty_background_ratio",
        "vm.vfs_cache_pressure",
    ]
    result = []
    for param in params:
        try:
            val = subprocess.run(
                ["sysctl", "-n", param], capture_output=True, text=True, timeout=5
            )
            result.append({"name": param, "value": val.stdout.strip()})
        except Exception:
            result.append({"name": param, "value": "N/A"})
    return result


async def apply_kernel_tuning(params: list[dict]) -> list[dict]:
    """Apply kernel tuning parameters."""
    results = []
    for p in params:
        name = p["name"]
        value = p["value"]
        # Basic validation – only allow known sysctl paths
        allowed_prefixes = ("sunrpc.", "net.core.", "net.ipv4.", "vm.")
        if not any(name.startswith(pfx) for pfx in allowed_prefixes):
            results.append(
                {"name": name, "success": False, "error": "Parameter not allowed"}
            )
            continue

        result = await _run(["sysctl", "-w", f"{name}={value}"])
        results.append(
            {
                "name": name,
                "success": result.returncode == 0,
                "error": result.stderr.strip() if result.returncode != 0 else None,
            }
        )
    return results


def get_logs(lines: int = 100) -> list[dict]:
    """Read last N lines from the log file."""
    log_file = "/var/log/nfs-manager/nfs-manager.log"
    entries = []
    if not os.path.isfile(log_file):
        return entries

    try:
        with open(log_file, "r") as f:
            all_lines = f.readlines()
            for line in all_lines[-lines:]:
                line = line.strip()
                if not line:
                    continue
                entries.append({"timestamp": "", "level": "INFO", "message": line})
    except Exception:
        pass
    return entries


def count_active_mounts(mount_type: str = "nfs") -> int:
    """Count active mounts of a given type."""
    count = 0
    try:
        with open("/proc/mounts", "r") as f:
            for line in f:
                parts = line.split()
                if mount_type == "nfs" and (
                    "nfs" in parts[2] if len(parts) > 2 else False
                ):
                    count += 1
                elif mount_type == "mergerfs" and (
                    "fuse.mergerfs" in parts[2] if len(parts) > 2 else False
                ):
                    count += 1
    except Exception:
        pass
    return count
