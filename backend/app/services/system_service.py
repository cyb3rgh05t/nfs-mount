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
        "sunrpc.udp_slot_table_entries",
        "net.core.rmem_max",
        "net.core.wmem_max",
        "net.core.rmem_default",
        "net.core.wmem_default",
        "net.core.default_qdisc",
        "net.core.netdev_budget",
        "net.core.optmem_max",
        "net.ipv4.tcp_congestion_control",
        "net.ipv4.tcp_rmem",
        "net.ipv4.tcp_wmem",
        "net.netfilter.nf_conntrack_max",
        "net.netfilter.nf_conntrack_tcp_timeout_established",
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
        allowed_prefixes = (
            "sunrpc.",
            "net.core.",
            "net.ipv4.",
            "net.netfilter.",
            "vm.",
        )
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
                if len(parts) < 3:
                    continue
                fs_type = parts[2]
                if mount_type == "nfs" and fs_type in ("nfs", "nfs4"):
                    count += 1
                elif mount_type == "mergerfs" and fs_type == "fuse.mergerfs":
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


def get_nfs_threads() -> dict:
    """Get current NFS server thread count."""
    current = 0
    try:
        with open("/proc/fs/nfsd/threads", "r") as f:
            current = int(f.read().strip())
    except Exception:
        pass
    return {"current": current}


async def set_nfs_threads(count: int) -> dict:
    """Set NFS server thread count at runtime."""
    if count < 1 or count > 4096:
        return {"success": False, "error": "Thread count must be between 1 and 4096"}
    try:
        with open("/proc/fs/nfsd/threads", "w") as f:
            f.write(str(count))
        logger.info(f"NFS threads set to {count}")
        return {"success": True, "threads": count}
    except Exception as e:
        logger.error(f"Failed to set NFS threads: {e}")
        return {"success": False, "error": str(e)}


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


async def get_diagnostics() -> dict:
    """Collect full performance diagnostics for NFS, MergerFS, kernel params."""
    diag = {
        "nfs_mounts": [],
        "mergerfs_mounts": [],
        "nfs_exports": [],
        "nfs_threads": None,
        "read_ahead": [],
        "kernel_params": {},
        "rps_xps": {},
        "nfs_connections": 0,
    }

    # NFS Mounts with options
    r = await _run(["mount", "-t", "nfs,nfs4"])
    if r.returncode == 0 and r.stdout.strip():
        for line in r.stdout.strip().split("\n"):
            if not line:
                continue
            parts = line.split()
            if len(parts) >= 6:
                opts = line.split("(")[-1].rstrip(")") if "(" in line else ""
                opts_list = opts.split(",")
                entry = {
                    "device": parts[0],
                    "mount_point": parts[2],
                    "options": opts,
                    "checks": {
                        "nconnect": "nconnect=" in opts,
                        "rsize": "rsize=" in opts,
                        "wsize": "wsize=" in opts,
                        "async": "sync" not in opts_list,
                        "noatime": "noatime" in opts,
                    },
                }
                diag["nfs_mounts"].append(entry)

    # MergerFS mounts
    r = await _run(["mount", "-t", "fuse.mergerfs"])
    if r.returncode == 0 and r.stdout.strip():
        for line in r.stdout.strip().split("\n"):
            if not line:
                continue
            parts = line.split()
            if len(parts) >= 6:
                opts = line.split("(")[-1].rstrip(")") if "(" in line else ""
                mount_point = parts[2]
                # Try reading mergerfs runtime config via xattr for accurate option detection
                full_opts = opts
                try:
                    xr = await _run(["getfattr", "-n", "user.mergerfs.options", "--only-values", mount_point], timeout=5)
                    if xr.returncode == 0 and xr.stdout.strip():
                        full_opts = xr.stdout.strip()
                except Exception:
                    pass
                entry = {
                    "device": parts[0],
                    "mount_point": mount_point,
                    "options": opts,
                    "checks": {
                        "kernel_cache": "kernel_cache" in full_opts,
                        "splice_move": "splice_move" in full_opts,
                        "splice_read": "splice_read" in full_opts,
                        "direct_io": "direct_io" in full_opts,
                        "dropcacheonclose": "dropcacheonclose" in full_opts,
                    },
                }
                diag["mergerfs_mounts"].append(entry)

    # NFS exports
    try:
        cmd = ["exportfs", "-v"]
        if os.path.isfile("/proc/1/root/etc/exports"):
            cmd = ["nsenter", "-t", "1", "-m", "-p", "-n", "-i", "--", "exportfs", "-v"]
        r = await _run(cmd, timeout=15)
        if r.returncode == 0 and r.stdout.strip():
            lines = []
            for raw in r.stdout.strip().split("\n"):
                if not raw.strip():
                    continue
                if raw[0] in (" ", "\t") and lines:
                    lines[-1] += " " + raw.strip()
                else:
                    lines.append(raw.strip())
            for line in lines:
                has_async = "async" in line
                diag["nfs_exports"].append({"line": line, "async": has_async})
    except Exception:
        pass

    # NFS threads
    try:
        with open("/proc/fs/nfsd/threads") as f:
            diag["nfs_threads"] = int(f.read().strip())
    except Exception:
        pass

    # Read-ahead for NFS BDIs
    try:
        for bdi in os.listdir("/sys/class/bdi"):
            ra_path = f"/sys/class/bdi/{bdi}/read_ahead_kb"
            if os.path.isfile(ra_path) and bdi.startswith("0:"):
                with open(ra_path) as f:
                    val = int(f.read().strip())
                diag["read_ahead"].append(
                    {"device": bdi, "read_ahead_kb": val, "ok": val >= 16384}
                )
    except Exception:
        pass

    # Kernel params
    params = {
        "sunrpc.tcp_max_slot_table_entries": {"min": 128},
        "net.core.rmem_max": {"min": 134217728},
        "net.core.wmem_max": {"min": 134217728},
        "net.ipv4.tcp_congestion_control": {"expected": "bbr"},
        "net.core.default_qdisc": {"expected": "fq"},
        "vm.dirty_ratio": {"min": 30},
        "vm.dirty_background_ratio": {"min": 5},
        "net.core.netdev_budget": {"min": 300},
        "net.core.optmem_max": {"min": 262144},
    }
    for param, check in params.items():
        try:
            r = await _run(["sysctl", "-n", param], timeout=3)
            val = r.stdout.strip() if r.returncode == 0 else None
            ok = False
            if val is not None:
                if "expected" in check:
                    ok = val == check["expected"]
                elif "min" in check:
                    try:
                        ok = int(val) >= check["min"]
                    except ValueError:
                        ok = False
            diag["kernel_params"][param] = {"value": val, "ok": ok}
        except Exception:
            diag["kernel_params"][param] = {"value": None, "ok": False}

    # RPS/XPS
    try:
        eth = None
        r = await _run(["ip", "-o", "link", "show"])
        if r.returncode == 0:
            for line in r.stdout.split("\n"):
                if line and not any(
                    x in line for x in ["lo:", "docker", "br-", "veth", "wg"]
                ):
                    eth = line.split(":")[1].strip().split("@")[0]
                    break
        if eth:
            diag["rps_xps"]["interface"] = eth
            rps_path = f"/sys/class/net/{eth}/queues/rx-0/rps_cpus"
            xps_path = f"/sys/class/net/{eth}/queues/tx-0/xps_cpus"
            if os.path.isfile(rps_path):
                with open(rps_path) as f:
                    rps = f.read().strip()
                diag["rps_xps"]["rps"] = rps
                diag["rps_xps"]["rps_ok"] = rps not in (
                    "0",
                    "00000000",
                    "00000000,00000000",
                )
            if os.path.isfile(xps_path):
                with open(xps_path) as f:
                    xps = f.read().strip()
                diag["rps_xps"]["xps"] = xps
                diag["rps_xps"]["xps_ok"] = xps not in (
                    "0",
                    "00000000",
                    "00000000,00000000",
                )
    except Exception:
        pass

    # NFS TCP connections
    try:
        r = await _run(["ss", "-ant"])
        if r.returncode == 0:
            diag["nfs_connections"] = sum(
                1 for l in r.stdout.split("\n") if ":2049" in l
            )
    except Exception:
        pass

    return diag
