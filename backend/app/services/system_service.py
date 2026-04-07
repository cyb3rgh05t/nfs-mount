import asyncio
import glob
import os
import subprocess
import logging

import psutil
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.system_setting import SystemSetting

logger = logging.getLogger("nfs-manager.service.system")


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
        load = list(os.getloadavg())  # type: ignore[attr-defined]
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
        "net.core.default_qdisc",
        "net.ipv4.tcp_congestion_control",
        "net.ipv4.tcp_rmem",
        "net.ipv4.tcp_wmem",
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


async def apply_kernel_tuning(
    params: list[dict], db: AsyncSession | None = None
) -> list[dict]:
    """Apply kernel tuning parameters and optionally save to DB."""
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
        success = result.returncode == 0
        results.append(
            {
                "name": name,
                "success": success,
                "error": result.stderr.strip() if not success else None,
            }
        )

        # Save to DB if apply succeeded
        if success and db is not None:
            await _save_setting(db, "kernel", name, value)

    if db is not None:
        await db.commit()
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


def get_docker_info() -> dict:
    """Get Docker version and container info."""
    info: dict = {
        "docker_version": "N/A",
        "container_id": "N/A",
        "image": "N/A",
        "os": "N/A",
        "arch": "N/A",
        "running_in_docker": False,
    }

    # Check if running inside Docker
    info["running_in_docker"] = os.path.isfile("/.dockerenv") or os.path.isfile(
        "/run/.containerenv"
    )

    # Docker version — try docker CLI, fallback to Docker API via socket
    try:
        result = subprocess.run(
            ["docker", "--version"], capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            info["docker_version"] = result.stdout.strip()
    except Exception:
        # Fallback: read via Docker socket if mounted
        try:
            import urllib.request
            import json as _json

            req = urllib.request.Request("http://localhost/version")
            opener = urllib.request.build_opener(urllib.request.HTTPHandler())
            # Try Unix socket via curl
            r = subprocess.run(
                [
                    "curl",
                    "-s",
                    "--unix-socket",
                    "/var/run/docker.sock",
                    "http://localhost/version",
                ],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if r.returncode == 0:
                data = _json.loads(r.stdout)
                info["docker_version"] = f"Docker {data.get('Version', 'N/A')}"
        except Exception:
            pass

    # OS info
    try:
        import platform

        info["os"] = f"{platform.system()} {platform.release()}"
        info["arch"] = platform.machine()
    except Exception:
        pass

    # Container ID — try multiple methods
    # Method 1: /proc/self/cgroup (cgroup v1)
    try:
        with open("/proc/self/cgroup", "r") as f:
            for line in f:
                if "docker" in line or "containerd" in line:
                    parts = line.strip().split("/")
                    if parts:
                        cid = parts[-1][:12]
                        if len(cid) == 12:
                            info["container_id"] = cid
                    break
    except Exception:
        pass

    # Method 2: /proc/self/mountinfo (works with cgroup v2)
    if info["container_id"] == "N/A":
        try:
            with open("/proc/self/mountinfo", "r") as f:
                for line in f:
                    if "/docker/containers/" in line:
                        idx = line.index("/docker/containers/") + len(
                            "/docker/containers/"
                        )
                        cid = line[idx : idx + 12]
                        if len(cid) == 12:
                            info["container_id"] = cid
                        break
        except Exception:
            pass

    # Method 3: HOSTNAME env (Docker sets it to short container ID)
    if info["container_id"] == "N/A":
        try:
            hostname = os.environ.get("HOSTNAME", "")
            if hostname:
                info["container_id"] = hostname[:12]
        except Exception:
            pass

    # Image from env (set in Dockerfile via ENV or docker-compose)
    info["image"] = os.environ.get("DOCKER_IMAGE", "N/A")

    # Fallback: try Docker socket for image name
    if info["image"] == "N/A" and info["container_id"] != "N/A":
        try:
            r = subprocess.run(
                [
                    "curl",
                    "-s",
                    "--unix-socket",
                    "/var/run/docker.sock",
                    f"http://localhost/containers/{info['container_id']}/json",
                ],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if r.returncode == 0:
                import json as _json

                data = _json.loads(r.stdout)
                img = data.get("Config", {}).get("Image", "")
                if img:
                    info["image"] = img
        except Exception:
            pass

    return info


# ── Persistent Settings helpers ──────────────────────────────────────────────


async def _save_setting(db: AsyncSession, category: str, key: str, value: str):
    """Upsert a single system setting."""
    result = await db.execute(select(SystemSetting).where(SystemSetting.key == key))
    setting = result.scalar_one_or_none()
    if setting:
        setting.value = value
        setting.category = category
    else:
        db.add(SystemSetting(category=category, key=key, value=value))


async def load_saved_kernel_params(db: AsyncSession) -> list[dict]:
    """Load kernel params saved in DB."""
    result = await db.execute(
        select(SystemSetting).where(SystemSetting.category == "kernel")
    )
    return [{"name": s.key, "value": s.value} for s in result.scalars().all()]


async def load_saved_rpsxps(db: AsyncSession) -> dict:
    """Load RPS/XPS settings saved in DB."""
    result = await db.execute(
        select(SystemSetting).where(SystemSetting.category == "rpsxps")
    )
    return {s.key: s.value for s in result.scalars().all()}


async def auto_apply_saved_settings(db: AsyncSession):
    """Apply all saved kernel + RPS/XPS settings (called at startup)."""
    # Kernel params
    saved = await load_saved_kernel_params(db)
    if saved:
        logger.info("Auto-applying %d saved kernel parameters...", len(saved))
        results = await apply_kernel_tuning(saved)
        ok = sum(1 for r in results if r["success"])
        fail = sum(1 for r in results if not r["success"])
        logger.info("Kernel params: %d applied, %d failed", ok, fail)

    # RPS/XPS
    rpsxps = await load_saved_rpsxps(db)
    if rpsxps:
        logger.info("Auto-applying saved RPS/XPS settings...")
        rps_result = await apply_rps_xps(rpsxps)
        if rps_result.get("success"):
            logger.info("RPS/XPS settings applied successfully")
        else:
            logger.warning("RPS/XPS apply: %s", rps_result.get("error", "unknown"))


# ── RPS/XPS CPU Load Balancing ───────────────────────────────────────────────


def _detect_primary_interface() -> str | None:
    """Detect primary network interface (skip lo, docker, br-, veth, wg)."""
    try:
        result = subprocess.run(
            ["ip", "-o", "link", "show"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        for line in result.stdout.strip().split("\n"):
            parts = line.split(": ")
            if len(parts) < 2:
                continue
            iface = parts[1].strip().split("@")[0]
            if iface in ("lo",) or any(
                iface.startswith(p) for p in ("docker", "br-", "veth", "wg")
            ):
                continue
            return iface
    except Exception:
        pass
    return None


def get_rps_xps_info() -> dict:
    """Read current RPS/XPS settings from sysfs."""
    iface = _detect_primary_interface()
    if not iface:
        return {
            "interface": None,
            "cpu_count": os.cpu_count() or 1,
            "rps_cpus": "N/A",
            "xps_cpus": "N/A",
            "mtu": "N/A",
        }

    cpu_count = os.cpu_count() or 1

    # Read RPS mask from first rx queue
    rps_cpus = "N/A"
    rps_files = sorted(glob.glob(f"/sys/class/net/{iface}/queues/rx-*/rps_cpus"))
    if rps_files:
        try:
            with open(rps_files[0]) as f:
                rps_cpus = f.read().strip()
        except Exception:
            pass

    # Read XPS mask from first tx queue
    xps_cpus = "N/A"
    xps_files = sorted(glob.glob(f"/sys/class/net/{iface}/queues/tx-*/xps_cpus"))
    if xps_files:
        try:
            with open(xps_files[0]) as f:
                xps_cpus = f.read().strip()
        except Exception:
            pass

    # Read MTU
    mtu = "N/A"
    try:
        with open(f"/sys/class/net/{iface}/mtu") as f:
            mtu = f.read().strip()
    except Exception:
        pass

    return {
        "interface": iface,
        "cpu_count": cpu_count,
        "rps_cpus": rps_cpus,
        "xps_cpus": xps_cpus,
        "mtu": mtu,
    }


async def apply_rps_xps(settings: dict, db: AsyncSession | None = None) -> dict:
    """Apply RPS/XPS settings. settings keys: rps_cpus, xps_cpus, mtu."""
    iface = _detect_primary_interface()
    if not iface:
        return {"success": False, "error": "No primary network interface found"}

    errors = []

    # Apply RPS
    rps_mask = settings.get("rps_cpus")
    if rps_mask:
        rps_files = glob.glob(f"/sys/class/net/{iface}/queues/rx-*/rps_cpus")
        for path in rps_files:
            try:
                with open(path, "w") as f:
                    f.write(rps_mask)
            except Exception as e:
                errors.append(f"RPS {path}: {e}")

    # Apply XPS
    xps_mask = settings.get("xps_cpus")
    if xps_mask and xps_mask != "N/A":
        tx_dirs = glob.glob(f"/sys/class/net/{iface}/queues/tx-*")
        for tx_dir in tx_dirs:
            path = os.path.join(tx_dir, "xps_cpus")
            if not os.path.exists(path):
                continue
            try:
                with open(path, "w") as f:
                    f.write(xps_mask)
            except Exception as e:
                errors.append(f"XPS {path}: {e}")

    # Apply MTU
    mtu = settings.get("mtu")
    if mtu:
        result = await _run(["ip", "link", "set", "dev", iface, "mtu", str(mtu)])
        if result.returncode != 0:
            errors.append(f"MTU: {result.stderr.strip()}")

    # Save to DB
    if db is not None:
        for key in ("rps_cpus", "xps_cpus", "mtu"):
            val = settings.get(key)
            if val:
                await _save_setting(db, "rpsxps", key, str(val))
        await db.commit()

    if errors:
        return {"success": False, "error": "; ".join(errors)}
    return {"success": True}
