import logging
import time

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import verify_api_key
from ..database import get_db
from ..schemas.system import KernelTuning, SystemStats, VPNStatus
from ..services import system_service

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


@router.post("/benchmark")
async def benchmark(body: dict):
    mount_path = body.get("mount_path", "")
    file_size_mb = body.get("file_size_mb", 256)
    if not mount_path:
        raise HTTPException(status_code=400, detail="mount_path is required")
    if file_size_mb < 1 or file_size_mb > 51200:
        raise HTTPException(status_code=400, detail="file_size_mb must be 1-51200")
    return await system_service.run_benchmark(mount_path, file_size_mb)
