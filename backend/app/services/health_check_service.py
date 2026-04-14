"""
Background health-check for NFS mounts, MergerFS unions, and NFS exports.

Runs periodically and sends notifications when a mount/export goes offline
or a check-file becomes unreachable.  Tracks previous state to avoid
spamming repeated alerts.  Attempts auto-recovery for items with
auto_mount / auto_enable enabled.
"""

import asyncio
import json
import logging
from pathlib import Path

from sqlalchemy import select

from ..database import async_session
from ..models.nfs_mount import NFSMount
from ..models.nfs_export import NFSExport
from ..models.mergerfs_config import MergerFSConfig
from .nfs_service import (
    is_mounted as nfs_is_mounted,
    validate_nfs,
    is_server_reachable,
    mount_nfs,
    ensure_read_ahead,
)
from .mergerfs_service import is_mounted as mergerfs_is_mounted, mount_mergerfs
from . import nfs_export_service
from .notification_service import send_alert

logger = logging.getLogger("nfs-manager.service.health")

# Check interval in seconds
CHECK_INTERVAL = 120

# Persist state across restarts
_STATE_FILE = Path("/data/health_state.json")

# Previous state tracking: key → bool (True = healthy last check)
# None means never checked before
_prev_state: dict[str, bool | None] = {}

_task: asyncio.Task | None = None
_first_run: bool = True


def _load_state() -> None:
    """Load persisted health state from disk."""
    global _prev_state
    try:
        if _STATE_FILE.exists():
            data = json.loads(_STATE_FILE.read_text())
            _prev_state = {k: v for k, v in data.items()}
            logger.info("Loaded health state: %d entries", len(_prev_state))
    except Exception:
        logger.warning("Could not load health state file, starting fresh")
        _prev_state = {}


def _save_state() -> None:
    """Persist current health state to disk."""
    try:
        _STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        _STATE_FILE.write_text(json.dumps(_prev_state))
    except Exception:
        logger.warning("Could not save health state file")


async def _check_nfs_mounts() -> None:
    """Check all enabled NFS mounts and auto-recover if possible.

    NFS client mount notifications are suppressed — brief disconnects
    are normal and long outages surface through MergerFS alerts instead.
    """
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

        if _first_run and healthy:
            logger.info("NFS mount %s is online (startup check)", mount.name)

        elif not healthy and (_first_run or prev is not False):
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

            # Auto-recovery attempt (silent — no notification)
            if mount.auto_mount and reachable:
                logger.info("Auto-recovery: attempting to remount %s", mount.name)
                try:
                    r = await mount_nfs(mount)
                    if r.get("success"):
                        logger.info(
                            "Auto-recovery: %s remounted successfully", mount.name
                        )
                        healthy = True
                    else:
                        logger.warning(
                            "Auto-recovery: remount %s failed: %s",
                            mount.name,
                            r.get("error", "unknown"),
                        )
                except Exception:
                    logger.exception("Auto-recovery: remount %s exception", mount.name)

        elif not _first_run and prev is False and healthy:
            logger.info("NFS mount %s recovered", mount.name)

        _prev_state[key] = healthy

    # Ensure read-ahead is set for all NFS BDI devices every cycle
    ensure_read_ahead()


async def _check_mergerfs_mounts() -> None:
    """Check all enabled MergerFS configs and auto-recover if possible."""
    async with async_session() as db:
        result = await db.execute(
            select(MergerFSConfig).where(MergerFSConfig.enabled == True)  # noqa: E712
        )
        configs = list(result.scalars().all())

    for cfg in configs:
        key = f"mergerfs:{cfg.id}"
        healthy = mergerfs_is_mounted(cfg.mount_point)
        prev = _prev_state.get(key)

        if _first_run and healthy:
            logger.info("MergerFS %s is online (startup check)", cfg.name)
            await send_alert(
                "SUCCESS",
                f"MergerFS **{cfg.name}** is **online**",
                {
                    "Mount Point": cfg.mount_point,
                    "Event": "Startup check",
                },
            )

        elif not healthy and (_first_run or prev is not False):
            logger.warning("MergerFS %s unhealthy: not mounted", cfg.name)
            await send_alert(
                "ERROR",
                f"MergerFS **{cfg.name}** is **offline**",
                {
                    "Mount Point": cfg.mount_point,
                    "Issue": "not mounted",
                },
            )

            # Auto-recovery attempt
            if cfg.auto_mount:
                logger.info("Auto-recovery: attempting to remount %s", cfg.name)
                try:
                    r = await mount_mergerfs(cfg)
                    if r.get("success"):
                        logger.info(
                            "Auto-recovery: %s remounted successfully", cfg.name
                        )
                        await send_alert(
                            "SUCCESS",
                            f"MergerFS **{cfg.name}** auto-recovered",
                            {
                                "Mount Point": cfg.mount_point,
                                "Action": "Automatic remount",
                            },
                        )
                        healthy = True
                    else:
                        logger.warning(
                            "Auto-recovery: remount %s failed: %s",
                            cfg.name,
                            r.get("error", "unknown"),
                        )
                except Exception:
                    logger.exception("Auto-recovery: remount %s exception", cfg.name)

        elif not _first_run and prev is False and healthy:
            logger.info("MergerFS %s recovered", cfg.name)
            await send_alert(
                "SUCCESS",
                f"MergerFS **{cfg.name}** is back **online**",
                {
                    "Mount Point": cfg.mount_point,
                },
            )

        _prev_state[key] = healthy


async def _check_nfs_exports() -> None:
    """Check all enabled NFS exports and auto-recover if possible."""
    active_lines = await nfs_export_service.get_active_exports()

    async with async_session() as db:
        result = await db.execute(
            select(NFSExport).where(NFSExport.enabled == True)  # noqa: E712
        )
        exports = list(result.scalars().all())

    for exp in exports:
        key = f"export:{exp.id}"
        is_active = any(
            exp.export_path in line and exp.allowed_hosts in line
            for line in active_lines
        )
        prev = _prev_state.get(key)

        if _first_run and is_active:
            logger.info("NFS export %s is active (startup check)", exp.name)
            await send_alert(
                "SUCCESS",
                f"NFS Export **{exp.name}** is **active**",
                {
                    "Export Path": exp.export_path,
                    "Allowed Hosts": exp.allowed_hosts,
                    "Event": "Startup check",
                },
            )

        elif not is_active and (_first_run or prev is not False):
            logger.warning("NFS export %s not active", exp.name)
            await send_alert(
                "ERROR",
                f"NFS Export **{exp.name}** is **not active**",
                {
                    "Export Path": exp.export_path,
                    "Allowed Hosts": exp.allowed_hosts,
                    "Issue": "export not found in active exports",
                },
            )

            # Auto-recovery attempt
            if exp.auto_enable:
                logger.info(
                    "Auto-recovery: attempting to re-enable export %s", exp.name
                )
                try:
                    async with async_session() as rdb:
                        rdb_exp = await rdb.get(NFSExport, exp.id)
                        if rdb_exp:
                            r = await nfs_export_service.enable_export(rdb_exp, rdb)
                            if r.get("success"):
                                logger.info(
                                    "Auto-recovery: export %s re-enabled", exp.name
                                )
                                await send_alert(
                                    "SUCCESS",
                                    f"NFS Export **{exp.name}** auto-recovered",
                                    {
                                        "Export Path": exp.export_path,
                                        "Action": "Automatic re-enable",
                                    },
                                )
                                is_active = True
                            else:
                                logger.warning(
                                    "Auto-recovery: re-enable %s failed: %s",
                                    exp.name,
                                    r.get("error", "unknown"),
                                )
                except Exception:
                    logger.exception("Auto-recovery: re-enable %s exception", exp.name)

        elif not _first_run and prev is False and is_active:
            logger.info("NFS export %s recovered", exp.name)
            await send_alert(
                "SUCCESS",
                f"NFS Export **{exp.name}** is back **active**",
                {
                    "Export Path": exp.export_path,
                },
            )

        _prev_state[key] = is_active


async def _health_loop() -> None:
    """Main health-check loop.  Runs forever until cancelled."""
    # Load persisted state from previous run
    _load_state()
    # Wait a bit after startup for mounts to settle
    await asyncio.sleep(30)
    logger.info("Health-check background task started (interval=%ds)", CHECK_INTERVAL)

    global _first_run
    while True:
        try:
            await _check_nfs_mounts()
            await _check_mergerfs_mounts()
            await _check_nfs_exports()
            _first_run = False
            _save_state()
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
