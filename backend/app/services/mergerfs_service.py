import asyncio
import json
import logging
import os
import subprocess

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import async_session
from ..models.mergerfs_config import MergerFSConfig

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
    """Check if a path is a mountpoint."""
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
    options = config.options or "rw,use_ino,allow_other"

    os.makedirs(mount_point, exist_ok=True)
    for src in sources:
        os.makedirs(src, exist_ok=True)

    # Unmount if already mounted
    if is_mounted(mount_point):
        logger.info(f"Unmounting existing MergerFS at {mount_point}")
        result = await _run(["fusermount", "-u", mount_point])
        if result.returncode != 0:
            await _run(["umount", "-l", mount_point])

    source_str = ":".join(sources)
    logger.info(f"Mounting MergerFS {source_str} -> {mount_point}")

    result = await _run(["mergerfs", "-o", options, source_str, mount_point])

    if result.returncode != 0:
        logger.error(f"MergerFS mount failed: {result.stderr}")
        return {"success": False, "error": result.stderr.strip(), "name": config.name}

    logger.info(f"MergerFS mount successful: {mount_point}")
    return {"success": True, "name": config.name}


async def unmount_mergerfs(mount_point: str) -> dict:
    """Unmount a MergerFS union."""
    if not is_mounted(mount_point):
        return {"success": True, "message": "Not mounted"}

    result = await _run(["fusermount", "-u", mount_point])
    if result.returncode != 0:
        result = await _run(["umount", "-l", mount_point])
        if result.returncode != 0:
            return {"success": False, "error": result.stderr.strip()}
    return {"success": True}


async def get_mount_status(config: MergerFSConfig) -> dict:
    return {
        "id": config.id,
        "name": config.name,
        "mount_point": config.mount_point,
        "mounted": is_mounted(config.mount_point),
    }


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
