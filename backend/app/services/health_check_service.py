"""
Background health-check for NFS mounts and MergerFS unions.

Runs periodically and sends notifications when a mount goes offline
or a check-file becomes unreachable.  Tracks previous state to avoid
spamming repeated alerts.
"""

import asyncio
import logging

from sqlalchemy import select

from ..database import async_session
from ..models.nfs_mount import NFSMount
from ..models.mergerfs_config import MergerFSConfig
from .nfs_service import is_mounted as nfs_is_mounted, validate_nfs, is_server_reachable
from .mergerfs_service import is_mounted as mergerfs_is_mounted
from .notification_service import send_alert

logger = logging.getLogger("nfs-manager.service.health")

# Check interval in seconds
CHECK_INTERVAL = 60

# Previous state tracking: key → bool (True = healthy last check)
_prev_state: dict[str, bool] = {}

_task: asyncio.Task | None = None


async def _check_nfs_mounts() -> None:
    """Check all enabled NFS mounts."""
    async with async_session() as db:
        result = await db.execute(
            select(NFSMount).where(NFSMount.enabled == True)  # noqa: E712
        )
        mounts = list(result.scalars().all())

    for mount in mounts:
        key = f"nfs:{mount.id}"
        mounted = nfs_is_mounted(mount.local_path)
        validated = validate_nfs(mount)
        reachable = is_server_reachable(mount.server_ip)
        healthy = mounted and validated

        prev = _prev_state.get(key)

        if prev is True and not healthy:
            # Was healthy, now failed → alert
            issues = []
            if not mounted:
                issues.append("not mounted")
            if not validated:
                issues.append(
                    f"check-file missing ({mount.check_file})"
                    if mount.check_file
                    else "mount validation failed"
                )
            if not reachable:
                issues.append(f"server {mount.server_ip} unreachable")

            logger.warning("NFS mount %s unhealthy: %s", mount.name, ", ".join(issues))
            await send_alert(
                "ERROR",
                f"NFS Mount **{mount.name}** is **offline**",
                {
                    "Server": mount.server_ip,
                    "Local Path": mount.local_path,
                    "Issues": ", ".join(issues),
                },
            )
        elif prev is False and healthy:
            # Was failed, now recovered → recovery alert
            logger.info("NFS mount %s recovered", mount.name)
            await send_alert(
                "SUCCESS",
                f"NFS Mount **{mount.name}** is back **online**",
                {
                    "Server": mount.server_ip,
                    "Local Path": mount.local_path,
                },
            )

        _prev_state[key] = healthy


async def _check_mergerfs_mounts() -> None:
    """Check all enabled MergerFS configs."""
    async with async_session() as db:
        result = await db.execute(
            select(MergerFSConfig).where(MergerFSConfig.enabled == True)  # noqa: E712
        )
        configs = list(result.scalars().all())

    for cfg in configs:
        key = f"mergerfs:{cfg.id}"
        healthy = mergerfs_is_mounted(cfg.mount_point)
        prev = _prev_state.get(key)

        if prev is True and not healthy:
            logger.warning("MergerFS %s unhealthy: not mounted", cfg.name)
            await send_alert(
                "ERROR",
                f"MergerFS **{cfg.name}** is **offline**",
                {
                    "Mount Point": cfg.mount_point,
                    "Issue": "not mounted",
                },
            )
        elif prev is False and healthy:
            logger.info("MergerFS %s recovered", cfg.name)
            await send_alert(
                "SUCCESS",
                f"MergerFS **{cfg.name}** is back **online**",
                {
                    "Mount Point": cfg.mount_point,
                },
            )

        _prev_state[key] = healthy


async def _health_loop() -> None:
    """Main health-check loop.  Runs forever until cancelled."""
    # Wait a bit after startup for mounts to settle
    await asyncio.sleep(30)
    logger.info("Health-check background task started (interval=%ds)", CHECK_INTERVAL)

    while True:
        try:
            await _check_nfs_mounts()
            await _check_mergerfs_mounts()
        except Exception:
            logger.exception("Health-check iteration failed")
        await asyncio.sleep(CHECK_INTERVAL)


def start_health_check() -> None:
    """Start the background health-check task.  Safe to call multiple times."""
    global _task
    if _task is not None and not _task.done():
        return
    _task = asyncio.create_task(_health_loop())


def stop_health_check() -> None:
    """Cancel the background task."""
    global _task
    if _task is not None and not _task.done():
        _task.cancel()
        _task = None
