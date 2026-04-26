import logging
import time
import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import verify_api_key
from ..database import get_db
from ..models.nfs_mount import NFSMount
from ..models.nfs_export import NFSExport
from ..models.mergerfs_config import MergerFSConfig
from ..models.vpn_config import VPNConfig
from ..schemas.system import KernelTuning, SystemStats, VPNStatus
from ..services import (
    firewall_service,
    mergerfs_service,
    nfs_export_service,
    nfs_service,
    system_service,
    vpn_service,
)

logger = logging.getLogger("nfs-manager.router.system")

router = APIRouter(dependencies=[Depends(verify_api_key)])

_start_time = time.time()


@router.get("/status")
async def system_status():
    uptime = time.time() - _start_time
    nfs_active = system_service.count_active_mounts("nfs")
    mergerfs_active = system_service.count_active_mounts("mergerfs")
    vpn = await system_service.get_vpn_status()
    return {
        "status": "running",
        "uptime": round(uptime, 1),
        "nfs_mounts_active": nfs_active,
        "mergerfs_mounts_active": mergerfs_active,
        "vpn_active": vpn["active"],
    }


@router.get("/stats", response_model=SystemStats)
async def system_stats():
    return system_service.get_system_stats()


@router.get("/vpn", response_model=VPNStatus)
async def vpn_status():
    return await system_service.get_vpn_status()


@router.get("/kernel-params")
async def kernel_params():
    return system_service.get_kernel_params()


@router.post("/kernel-tuning")
async def apply_kernel_tuning(data: KernelTuning, db: AsyncSession = Depends(get_db)):
    logger.info("Applying kernel tuning: %d params", len(data.params))
    return await system_service.apply_kernel_tuning(
        [p.model_dump() for p in data.params], db=db
    )


@router.get("/rps-xps")
async def rps_xps_info():
    return system_service.get_rps_xps_info()


@router.post("/rps-xps")
async def apply_rps_xps(data: dict, db: AsyncSession = Depends(get_db)):
    logger.info("Applying RPS/XPS settings")
    return await system_service.apply_rps_xps(data, db=db)


@router.get("/logs")
async def get_logs(
    lines: int = Query(100, ge=1, le=5000),
    level: str | None = Query(None),
):
    return system_service.get_logs(lines, level)


@router.get("/docker-info")
async def docker_info():
    return system_service.get_docker_info()


@router.get("/nfs-threads")
async def get_nfs_threads():
    return system_service.get_nfs_threads()


@router.post("/nfs-threads")
async def set_nfs_threads(data: dict):
    count = data.get("threads", 512)
    logger.info("Setting NFS threads to %d", count)
    return await system_service.set_nfs_threads(count)


@router.get("/diagnostics")
async def diagnostics():
    return await system_service.get_diagnostics()


@router.get("/zfs-tuning")
async def get_zfs_tuning():
    return system_service.get_zfs_params()


@router.post("/zfs-tuning")
async def apply_zfs_tuning(data: dict, db: AsyncSession = Depends(get_db)):
    params = data.get("params", [])
    persist = data.get("persist", True)
    logger.info("Applying ZFS tuning: %d params (persist=%s)", len(params), persist)
    return await system_service.apply_zfs_tuning(params, persist=persist, db=db)


@router.get("/app-settings")
async def get_app_settings(db: AsyncSession = Depends(get_db)):
    return await system_service.get_app_settings(db)


@router.post("/app-settings")
async def update_app_settings(data: dict, db: AsyncSession = Depends(get_db)):
    logger.info("Updating app settings: %s", list(data.keys()))
    return await system_service.update_app_settings(data, db)


@router.get("/health-check")
async def health_check():
    return await system_service.get_health_check()


async def _safe(coro, fallback):
    """Await a coroutine, returning ``fallback`` (and logging) on any error."""
    try:
        return await coro
    except Exception as exc:  # pragma: no cover - defensive aggregation
        logger.warning("dashboard-summary section failed: %s", exc)
        return fallback


def _safe_sync(fn, fallback):
    try:
        return fn()
    except Exception as exc:  # pragma: no cover - defensive aggregation
        logger.warning("dashboard-summary section failed: %s", exc)
        return fallback


@router.get("/dashboard-summary")
async def dashboard_summary(db: AsyncSession = Depends(get_db)):
    """
    Aggregated payload for the dashboard view.

    Replaces 13 separate polling requests with a single call. Every section is
    isolated: a failure in one service still returns the rest of the data.
    """

    # Load all DB rows once.
    nfs_mounts_q = await db.execute(select(NFSMount))
    nfs_mounts = nfs_mounts_q.scalars().all()
    merger_configs_q = await db.execute(select(MergerFSConfig))
    merger_configs = merger_configs_q.scalars().all()
    nfs_exports_q = await db.execute(select(NFSExport))
    nfs_exports = nfs_exports_q.scalars().all()
    vpn_configs_q = await db.execute(select(VPNConfig))
    vpn_configs = vpn_configs_q.scalars().all()

    async def _nfs_statuses():
        return [await nfs_service.get_mount_status(m) for m in nfs_mounts]

    async def _merger_statuses():
        return [await mergerfs_service.get_mount_status(c) for c in merger_configs]

    async def _export_statuses():
        active_lines = await nfs_export_service.get_active_exports()
        return [
            {
                "id": exp.id,
                "name": exp.name,
                "export_path": exp.export_path,
                "allowed_hosts": exp.allowed_hosts,
                "nfs_version": exp.nfs_version,
                "is_active": any(
                    exp.export_path in line and exp.allowed_hosts in line
                    for line in active_lines
                ),
                "auto_enable": exp.auto_enable,
            }
            for exp in nfs_exports
        ]

    async def _vpn_statuses():
        return [await vpn_service.get_vpn_status(c) for c in vpn_configs]

    async def _status():
        uptime = time.time() - _start_time
        vpn = await system_service.get_vpn_status()
        return {
            "status": "running",
            "uptime": round(uptime, 1),
            "nfs_mounts_active": system_service.count_active_mounts("nfs"),
            "mergerfs_mounts_active": system_service.count_active_mounts("mergerfs"),
            "vpn_active": vpn["active"],
        }

    (
        status,
        nfs_status,
        merger_status,
        export_status,
        vpn_status,
        firewall_status,
    ) = await asyncio.gather(
        _safe(_status(), {}),
        _safe(_nfs_statuses(), []),
        _safe(_merger_statuses(), []),
        _safe(_export_statuses(), []),
        _safe(_vpn_statuses(), []),
        _safe(firewall_service.get_firewall_status(), None),
    )

    return {
        "status": status,
        "stats": _safe_sync(system_service.get_system_stats, {}),
        "nfs_mounts": [
            {c.name: getattr(m, c.name) for c in m.__table__.columns}
            for m in nfs_mounts
        ],
        "nfs_status": nfs_status,
        "mergerfs_configs": [
            {c.name: getattr(m, c.name) for c in m.__table__.columns}
            for m in merger_configs
        ],
        "mergerfs_status": merger_status,
        "nfs_exports": [
            {c.name: getattr(m, c.name) for c in m.__table__.columns}
            for m in nfs_exports
        ],
        "nfs_exports_status": export_status,
        "vpn_status": vpn_status,
        "kernel_params": _safe_sync(system_service.get_kernel_params, []),
        "rps_xps": _safe_sync(system_service.get_rps_xps_info, None),
        "firewall_status": firewall_status,
        "logs": _safe_sync(lambda: system_service.get_logs(20), []),
    }


@router.post("/benchmark")
async def benchmark(body: dict):
    mount_path = body.get("mount_path", "")
    file_size_mb = body.get("file_size_mb", 256)
    if not mount_path:
        raise HTTPException(status_code=400, detail="mount_path is required")
    if file_size_mb < 1 or file_size_mb > 51200:
        raise HTTPException(status_code=400, detail="file_size_mb must be 1-51200")
    return await system_service.run_benchmark(mount_path, file_size_mb)
