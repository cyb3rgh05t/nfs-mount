import asyncio
import json
import logging
import os
import shutil
import subprocess

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import async_session
from ..models.mergerfs_config import MergerFSConfig
from .cache import cached, invalidate_prefix

logger = logging.getLogger("nfs-manager.service.mergerfs")


async def _run(cmd: list[str], timeout: int = 30) -> subprocess.CompletedProcess:
    loop = asyncio.get_event_loop()
    try:
        return await loop.run_in_executor(
            None,
            lambda: subprocess.run(
                cmd, capture_output=True, text=True, timeout=timeout
            ),
        )
    except subprocess.TimeoutExpired:
        return subprocess.CompletedProcess(
            cmd, returncode=-1, stdout="", stderr=f"Command timed out after {timeout}s"
        )


def is_mounted(path: str) -> bool:
    """Check if a path is a mountpoint (cached 15s)."""
    return cached(f"mergerfs_mounted:{path}", 15.0, lambda: _check_mounted(path))


def _check_mounted(path: str) -> bool:
    """Actually check if a path is a mountpoint."""
    try:
        result = subprocess.run(
            ["mountpoint", "-q", path], capture_output=True, timeout=5
        )
        return result.returncode == 0
    except Exception:
        return False


async def mount_mergerfs(config: MergerFSConfig) -> dict:
    """Mount a MergerFS union."""
    mount_point = config.mount_point
    sources = (
        json.loads(config.sources)
        if isinstance(config.sources, str)
        else config.sources
    )
    options = (
        config.options
        or "rw,use_ino,allow_other,statfs_ignore=nc,func.getattr=newest,category.action=all,category.create=ff,cache.files=partial,dropcacheonclose=true,kernel_cache,splice_move,splice_read,direct_io,fsname=mergerfs"
    )

    # Unmount if already mounted (do this BEFORE makedirs to avoid stale mount issues)
    if is_mounted(mount_point):
        logger.info(f"Unmounting existing MergerFS at {mount_point}")
        result = await _run(["fusermount", "-u", mount_point])
        if result.returncode != 0:
            await _run(["umount", "-l", mount_point])

    # Create directories (after unmounting stale mounts)
    try:
        os.makedirs(mount_point, exist_ok=True)
    except FileExistsError:
        # Path exists as a stale/broken mount point — try lazy unmount then create
        logger.warning(f"Stale mount detected at {mount_point}, force unmounting")
        await _run(["umount", "-l", mount_point])
        os.makedirs(mount_point, exist_ok=True)
    for src in sources:
        os.makedirs(src, exist_ok=True)

    source_str = ":".join(sources)
    logger.info(f"Mounting MergerFS {source_str} -> {mount_point}")

    result = await _run(["mergerfs", "-o", options, source_str, mount_point])

    if result.returncode != 0:
        logger.error(f"MergerFS mount failed: {result.stderr}")
        return {"success": False, "error": result.stderr.strip(), "name": config.name}

    # Invalidate cached status
    invalidate_prefix(f"mergerfs_mounted:{mount_point}")

    logger.info(f"MergerFS mount successful: {mount_point}")
    return {"success": True, "name": config.name}


async def unmount_mergerfs(mount_point: str) -> dict:
    """Unmount a MergerFS union."""
    if not _check_mounted(mount_point):
        return {"success": True, "message": "Not mounted"}

    result = await _run(["fusermount", "-u", mount_point])
    if result.returncode != 0:
        result = await _run(["umount", "-l", mount_point])
        if result.returncode != 0:
            return {"success": False, "error": result.stderr.strip()}

    # Invalidate cached status
    invalidate_prefix(f"mergerfs_mounted:{mount_point}")

    return {"success": True}


def _format_size(size_bytes: int | float) -> str:
    """Format bytes to human-readable size."""
    value = float(size_bytes)
    for unit in ["B", "KB", "MB", "GB", "TB", "PB"]:
        if abs(value) < 1024:
            return f"{value:.1f} {unit}"
        value /= 1024
    return f"{value:.1f} EB"


def _get_live_mergerfs_info() -> dict | None:
    """Read actual MergerFS options from /proc/{pid}/cmdline."""
    try:
        for pid in os.listdir("/proc"):
            if not pid.isdigit():
                continue
            try:
                with open(f"/proc/{pid}/comm") as f:
                    if f.read().strip() != "mergerfs":
                        continue
            except (OSError, PermissionError):
                continue
            with open(f"/proc/{pid}/cmdline", "rb") as f:
                raw = f.read()
            args = raw.decode("utf-8", errors="replace").split("\x00")
            options_str = ""
            branches = ""
            mount_point = ""
            for i, a in enumerate(args):
                if a == "-o" and i + 1 < len(args):
                    options_str = args[i + 1]
                elif ":" in a and a.startswith("/"):
                    branches = a
                elif a.startswith("/") and not a.startswith("/proc") and ":" not in a:
                    mount_point = a
            return {
                "options": options_str,
                "branches": branches,
                "mount_point": mount_point,
                "pid": int(pid),
            }
    except Exception:
        pass
    return None


async def get_mount_status(config: MergerFSConfig) -> dict:
    mounted = is_mounted(config.mount_point)
    status = {
        "id": config.id,
        "name": config.name,
        "mount_point": config.mount_point,
        "mounted": mounted,
        "auto_mount": config.auto_mount,
        "total_space": None,
        "used_space": None,
        "free_space": None,
        "live_options": None,
        "live_sources": None,
        "db_options": config.options or "",
    }
    if mounted:
        try:
            usage = shutil.disk_usage(config.mount_point)
            status["total_space"] = _format_size(usage.total)
            status["used_space"] = _format_size(usage.used)
            status["free_space"] = _format_size(usage.free)
            status["used_percent"] = (
                round(usage.used / usage.total * 100, 1) if usage.total > 0 else 0
            )
        except Exception:
            pass
        live = _get_live_mergerfs_info()
        if live and live["mount_point"] == config.mount_point:
            status["live_options"] = live["options"]
            status["live_sources"] = live["branches"]
    return status


async def auto_mount_mergerfs() -> list[dict]:
    """Auto-mount all enabled MergerFS configs with auto_mount=True."""
    results = []
    async with async_session() as session:
        query = select(MergerFSConfig).where(
            MergerFSConfig.enabled == True,  # noqa: E712
            MergerFSConfig.auto_mount == True,  # noqa: E712
        )
        rows = await session.execute(query)
        configs = rows.scalars().all()

        for c in configs:
            result = await mount_mergerfs(c)
            results.append(result)
    return results
