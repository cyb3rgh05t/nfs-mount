import logging
import asyncio
from typing import Optional

import paramiko

logger = logging.getLogger("nfs-manager.service.monitor")


def _ssh_exec(
    host: str, port: int, username: str, key_path: str, command: str, timeout: int = 10
) -> Optional[str]:
    """Execute a command via SSH and return stdout."""
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        pkey = paramiko.RSAKey.from_private_key_file(key_path)
    except Exception:
        try:
            pkey = paramiko.Ed25519Key.from_private_key_file(key_path)
        except Exception:
            pkey = paramiko.ECDSAKey.from_private_key_file(key_path)

    try:
        client.connect(
            hostname=host, port=port, username=username, pkey=pkey, timeout=timeout
        )
        _, stdout, stderr = client.exec_command(command, timeout=timeout)
        return stdout.read().decode("utf-8", errors="replace").strip()
    finally:
        client.close()


async def _async_ssh_exec(
    host: str, port: int, username: str, key_path: str, command: str
) -> Optional[str]:
    """Run SSH command in a thread pool to avoid blocking."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, _ssh_exec, host, port, username, key_path, command
    )


def _parse_uptime(seconds: int) -> str:
    days = seconds // 86400
    hours = (seconds % 86400) // 3600
    mins = (seconds % 3600) // 60
    parts = []
    if days > 0:
        parts.append(f"{days}d")
    if hours > 0:
        parts.append(f"{hours}h")
    parts.append(f"{mins}m")
    return " ".join(parts)


async def collect_metrics(
    host: str, port: int, username: str, key_path: str, server_id: int
) -> dict:
    """Collect system metrics from a remote server via SSH."""
    result = {
        "server_id": server_id,
        "hostname": host,
        "online": False,
        "error": None,
    }

    try:
        # Collect all metrics in one SSH session via a combined command
        combined_cmd = (
            "echo '===HOSTNAME==='; hostname; "
            "echo '===UPTIME==='; cat /proc/uptime; "
            "echo '===LOADAVG==='; cat /proc/loadavg; "
            "echo '===CPU==='; grep -c ^processor /proc/cpuinfo; "
            "echo '===CPUSTAT==='; head -1 /proc/stat; "
            "echo '===MEMINFO==='; head -5 /proc/meminfo; "
            "echo '===DISK==='; df -BM --output=target,size,used,avail,pcent -x tmpfs -x devtmpfs -x squashfs 2>/dev/null | tail -n +2; "
            "echo '===NET==='; cat /proc/net/dev | grep -v 'lo:' | tail -n +3; "
            "echo '===ARC==='; cat /proc/spl/kstat/zfs/arcstats 2>/dev/null || echo 'NO_ARC'; "
            "echo '===ZPOOL==='; zpool list -H -o name,size,alloc,free,cap,health 2>/dev/null || echo 'NO_ZPOOL'; "
            "echo '===ZPOOLSTATUS==='; zpool status 2>/dev/null || echo 'NO_ZPOOLSTATUS'; "
            "echo '===MDSTAT==='; cat /proc/mdstat 2>/dev/null || echo 'NO_MDSTAT'; "
            "echo '===UNIONFS==='; grep -E 'fuse\\.mergerfs|unionfs|overlay' /proc/mounts 2>/dev/null || echo 'NO_UNIONFS'"
        )

        output = await _async_ssh_exec(host, port, username, key_path, combined_cmd)
        if output is None:
            result["error"] = "SSH connection failed"
            return result

        result["online"] = True
        sections = {}
        current_section = None
        for line in output.split("\n"):
            if line.startswith("===") and line.endswith("==="):
                current_section = line.strip("=")
                sections[current_section] = []
            elif current_section:
                sections[current_section].append(line)

        # Hostname
        if "HOSTNAME" in sections and sections["HOSTNAME"]:
            result["hostname"] = sections["HOSTNAME"][0].strip()

        # Uptime
        if "UPTIME" in sections and sections["UPTIME"]:
            try:
                uptime_secs = int(float(sections["UPTIME"][0].split()[0]))
                result["uptime_seconds"] = uptime_secs
                result["uptime_human"] = _parse_uptime(uptime_secs)
            except (ValueError, IndexError):
                pass

        # Load Average
        if "LOADAVG" in sections and sections["LOADAVG"]:
            try:
                parts = sections["LOADAVG"][0].split()
                result["load_1"] = float(parts[0])
                result["load_5"] = float(parts[1])
                result["load_15"] = float(parts[2])
            except (ValueError, IndexError):
                pass

        # CPU cores
        if "CPU" in sections and sections["CPU"]:
            try:
                result["cpu_cores"] = int(sections["CPU"][0].strip())
            except ValueError:
                pass

        # CPU usage from /proc/stat (rough estimate)
        if "CPUSTAT" in sections and sections["CPUSTAT"]:
            try:
                vals = sections["CPUSTAT"][0].split()[1:]  # skip 'cpu'
                vals = [int(v) for v in vals]
                total = sum(vals)
                idle = vals[3] if len(vals) > 3 else 0
                if total > 0:
                    result["cpu_usage"] = round((1 - idle / total) * 100, 1)
            except (ValueError, IndexError):
                pass

        # Memory
        if "MEMINFO" in sections:
            mem = {}
            for line in sections["MEMINFO"]:
                if ":" in line:
                    key, val = line.split(":", 1)
                    try:
                        mem[key.strip()] = int(val.strip().split()[0])  # kB
                    except (ValueError, IndexError):
                        pass
            total = mem.get("MemTotal", 0)
            free = mem.get("MemFree", 0)
            available = mem.get("MemAvailable", free)
            buffers = mem.get("Buffers", 0)
            cached = mem.get("Cached", 0)
            used = total - available
            if total > 0:
                result["mem_total_mb"] = round(total / 1024, 1)
                result["mem_used_mb"] = round(used / 1024, 1)
                result["mem_free_mb"] = round(available / 1024, 1)
                result["mem_usage_pct"] = round((used / total) * 100, 1)

        # Disk
        if "DISK" in sections:
            disks = []
            for line in sections["DISK"]:
                line = line.strip()
                if not line:
                    continue
                parts = line.split()
                if len(parts) >= 5:
                    disks.append(
                        {
                            "mount": parts[0],
                            "total": parts[1],
                            "used": parts[2],
                            "available": parts[3],
                            "usage_pct": parts[4],
                        }
                    )
            result["disks"] = disks

        # Network (sum all interfaces)
        if "NET" in sections:
            total_rx = 0
            total_tx = 0
            for line in sections["NET"]:
                line = line.strip()
                if not line:
                    continue
                parts = line.split()
                if len(parts) >= 10:
                    try:
                        total_rx += int(parts[1])
                        total_tx += int(parts[9])
                    except (ValueError, IndexError):
                        pass
            result["net_rx_bytes"] = total_rx
            result["net_tx_bytes"] = total_tx

        # ARC (ZFS)
        if "ARC" in sections:
            arc_data = "\n".join(sections["ARC"])
            if "NO_ARC" not in arc_data:
                arc_vals = {}
                for line in sections["ARC"]:
                    parts = line.split()
                    if len(parts) >= 3:
                        try:
                            arc_vals[parts[0]] = int(parts[2])
                        except ValueError:
                            pass
                if "size" in arc_vals:
                    result["arc_size_mb"] = round(arc_vals["size"] / (1024 * 1024), 1)
                hits = arc_vals.get("hits", 0)
                misses = arc_vals.get("misses", 0)
                if hits + misses > 0:
                    result["arc_hit_pct"] = round((hits / (hits + misses)) * 100, 1)

        # ZFS Pools
        if "ZPOOL" in sections:
            zpool_data = "\n".join(sections["ZPOOL"])
            if "NO_ZPOOL" not in zpool_data:
                pools = []
                for line in sections["ZPOOL"]:
                    line = line.strip()
                    if not line:
                        continue
                    parts = line.split("\t")
                    if len(parts) >= 6:
                        pools.append(
                            {
                                "name": parts[0],
                                "size": parts[1],
                                "allocated": parts[2],
                                "free": parts[3],
                                "capacity_pct": parts[4].rstrip("%"),
                                "health": parts[5],
                            }
                        )
                if pools:
                    result["zfs_pools"] = pools

        # ZFS Pool disk details from zpool status
        if "ZPOOLSTATUS" in sections:
            zpoolstatus_data = "\n".join(sections["ZPOOLSTATUS"])
            if "NO_ZPOOLSTATUS" not in zpoolstatus_data:
                pool_disks = {}
                current_pool = None
                in_config = False
                import re as _re

                for line in sections["ZPOOLSTATUS"]:
                    # Pool name
                    pool_match = _re.match(r"\s*pool:\s+(\S+)", line)
                    if pool_match:
                        current_pool = pool_match.group(1)
                        pool_disks[current_pool] = []
                        in_config = False
                        continue
                    if "config:" in line.lower():
                        in_config = True
                        continue
                    if "errors:" in line.lower():
                        in_config = False
                        continue
                    if in_config and current_pool:
                        stripped = line.strip()
                        if not stripped or "NAME" in stripped:
                            continue
                        parts = stripped.split()
                        if len(parts) >= 2:
                            name = parts[0]
                            state = parts[1]
                            # Skip pool name row and vdev type rows
                            if name == current_pool:
                                continue
                            pool_disks[current_pool].append(
                                {
                                    "name": name,
                                    "state": state.lower(),
                                }
                            )
                if pool_disks:
                    result["zfs_pool_disks"] = pool_disks

        # RAID (mdstat)
        if "MDSTAT" in sections:
            mdstat_data = "\n".join(sections["MDSTAT"])
            if "NO_MDSTAT" not in mdstat_data:
                raids = []
                current_raid = None
                for line in sections["MDSTAT"]:
                    line = line.strip()
                    if not line or line.startswith("Personalities"):
                        continue
                    if line.startswith("unused"):
                        continue
                    import re as _re

                    # Match "md0 : active raid1 sda1[0] sdb1[1]"
                    md_match = _re.match(r"(md\d+)\s*:\s*(\w+)\s+(\w+)\s+(.*)", line)
                    if md_match:
                        disks = []
                        disk_str = md_match.group(4)
                        for d in _re.findall(r"(\w+)\[\d+\](?:\((\w)\))?", disk_str):
                            disks.append(
                                {
                                    "name": d[0],
                                    "state": (
                                        "spare"
                                        if d[1] == "S"
                                        else "failed" if d[1] == "F" else "active"
                                    ),
                                }
                            )
                        current_raid = {
                            "device": md_match.group(1),
                            "status": md_match.group(2),
                            "level": md_match.group(3),
                            "disks": disks,
                        }
                        raids.append(current_raid)
                    elif current_raid and "[" in line and "]" in line:
                        # Parse status line like "20971456 blocks [2/2] [UU]"
                        uu_match = _re.search(r"\[([U_]+)\]", line)
                        if uu_match:
                            pattern = uu_match.group(1)
                            current_raid["active_disks"] = pattern.count("U")
                            current_raid["total_disks"] = len(pattern)
                            current_raid["health"] = (
                                "healthy" if "_" not in pattern else "degraded"
                            )
                        size_match = _re.search(r"(\d+)\s+blocks", line)
                        if size_match:
                            blocks = int(size_match.group(1))
                            current_raid["size_gb"] = round(blocks / (1024 * 1024), 1)
                    elif current_raid and "recovery" in line.lower():
                        current_raid["health"] = "recovering"
                        pct_match = _re.search(r"(\d+\.?\d*)%", line)
                        if pct_match:
                            current_raid["recovery_pct"] = float(pct_match.group(1))
                if raids:
                    result["raid_arrays"] = raids

        # UnionFS / MergerFS / Overlay mounts
        if "UNIONFS" in sections:
            union_data = "\n".join(sections["UNIONFS"])
            if "NO_UNIONFS" not in union_data:
                mounts = []
                for line in sections["UNIONFS"]:
                    line = line.strip()
                    if not line:
                        continue
                    parts = line.split()
                    if len(parts) >= 3:
                        fs_type = parts[2]
                        if "mergerfs" in fs_type:
                            mount_type = "mergerfs"
                        elif "unionfs" in fs_type:
                            mount_type = "unionfs"
                        elif "overlay" in fs_type:
                            mount_type = "overlay"
                        else:
                            mount_type = fs_type
                        mount_point = parts[1]
                        # Source paths from field 0
                        sources = parts[0]
                        mounts.append(
                            {
                                "mount": mount_point,
                                "type": mount_type,
                                "sources": sources,
                            }
                        )
                if mounts:
                    result["union_mounts"] = mounts

    except Exception as e:
        result["error"] = str(e)
        logger.warning(f"Failed to collect metrics from {host}: {e}")

    return result


async def test_connection(host: str, port: int, username: str, key_path: str) -> dict:
    """Test SSH connection to a server."""
    try:
        output = await _async_ssh_exec(host, port, username, key_path, "hostname")
        if output:
            return {"success": True, "hostname": output.strip()}
        return {"success": False, "error": "No response"}
    except Exception as e:
        return {"success": False, "error": str(e)}
