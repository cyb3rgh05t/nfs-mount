import time

from fastapi import APIRouter, Depends, Query

from ..auth import verify_api_key
from ..schemas.system import KernelTuning, SystemStats, VPNStatus
from ..services import system_service

router = APIRouter(dependencies=[Depends(verify_api_key)])

_start_time = time.time()


@router.get("/health")
async def health():
    """Health check endpoint (no auth required for Docker healthcheck)."""
    return {"status": "ok"}


# Override the health endpoint without auth
router.routes = [r for r in router.routes if r.path != "/health"]  # type: ignore


@router.get("/health", include_in_schema=False)
async def health_no_auth():
    return {"status": "ok"}


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
async def apply_kernel_tuning(data: KernelTuning):
    return await system_service.apply_kernel_tuning(
        [p.model_dump() for p in data.params]
    )


@router.get("/logs")
async def get_logs(lines: int = Query(100, ge=1, le=1000)):
    return system_service.get_logs(lines)
