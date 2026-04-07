import asyncio
import json
import logging
import os
import subprocess

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import async_session
from ..models.nfs_mount import NFSMount

logger = logging.getLogger("nfs-manager.service.nfs")


async def _run(cmd: list[str], timeout: int = 30) -> subprocess.CompletedProcess:
    """Run a shell command asynchronously."""
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


def is_server_reachable(ip: str) -> bool:
    """Quick ping check."""
    try:
        result = subprocess.run(
            ["ping", "-c", "1", "-W", "2", ip], capture_output=True, timeout=5
        )
        return result.returncode == 0
    except Exception:
        return False


async def mount_nfs(mount: NFSMount) -> dict:
    """Mount a single NFS share."""
    local = mount.local_path
    remote = f"{mount.server_ip}:{mount.remote_path}"
    options = mount.options or "vers=4.2,proto=tcp,hard"

    # Unmount first if already mounted (clean remount)
    if is_mounted(local):
        logger.info(f"Unmounting existing NFS at {local}")
        await _run(["umount", "-l", local])

    # Create directory (after unmounting stale mounts)
    try:
        os.makedirs(local, exist_ok=True)
    except FileExistsError:
        logger.warning(f"Stale mount detected at {local}, force unmounting")
        await _run(["umount", "-l", local])
        os.makedirs(local, exist_ok=True)

    logger.info(f"Mounting NFS {remote} -> {local}")
    result = await _run(["mount", "-t", "nfs", "-o", options, remote, local])

    if result.returncode != 0:
        logger.error(f"NFS mount failed: {result.stderr}")
        return {"success": False, "error": result.stderr.strip(), "name": mount.name}

    logger.info(f"NFS mount successful: {local}")
    return {"success": True, "name": mount.name}


async def unmount_nfs(local_path: str) -> dict:
    """Unmount an NFS share."""
    if not is_mounted(local_path):
        return {"success": True, "message": "Not mounted"}

    result = await _run(["umount", "-l", local_path])
    if result.returncode != 0:
        return {"success": False, "error": result.stderr.strip()}
    return {"success": True}


def validate_nfs(mount: NFSMount) -> bool:
    """Validate NFS mount by checking for a validation file."""
    if not mount.check_file:
        return is_mounted(mount.local_path)
    return os.path.isfile(mount.check_file)


async def get_mount_status(mount: NFSMount) -> dict:
    """Get comprehensive status for an NFS mount."""
    return {
        "id": mount.id,
        "name": mount.name,
        "local_path": mount.local_path,
        "mounted": is_mounted(mount.local_path),
        "validated": validate_nfs(mount),
        "server_reachable": is_server_reachable(mount.server_ip),
    }


async def auto_mount_nfs() -> list[dict]:
    """Auto-mount all enabled NFS mounts with auto_mount=True."""
    results = []
    async with async_session() as session:
        query = select(NFSMount).where(
            NFSMount.enabled == True,  # noqa: E712
            NFSMount.auto_mount == True,  # noqa: E712
        )
        rows = await session.execute(query)
        mounts = rows.scalars().all()

        for m in mounts:
            result = await mount_nfs(m)
            results.append(result)
    return results
