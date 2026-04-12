import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import verify_api_key
from ..database import get_db
from ..models.mergerfs_config import MergerFSConfig
from ..schemas.mergerfs import (
    MergerFSCreate,
    MergerFSResponse,
    MergerFSStatus,
    MergerFSUpdate,
)
from ..services import mergerfs_service
from ..services.notification_service import send_alert

logger = logging.getLogger("nfs-manager.router.mergerfs")

router = APIRouter(dependencies=[Depends(verify_api_key)])


def _serialize_sources(sources: list[str]) -> str:
    return json.dumps(sources)


def _deserialize_sources(config: MergerFSConfig) -> list[str]:
    if isinstance(config.sources, str):
        return json.loads(config.sources)
    return config.sources


def _to_response(config: MergerFSConfig) -> dict:
    data = {
        "id": config.id,
        "name": config.name,
        "mount_point": config.mount_point,
        "sources": _deserialize_sources(config),
        "options": config.options,
        "auto_mount": config.auto_mount,
        "enabled": config.enabled,
        "created_at": config.created_at,
        "updated_at": config.updated_at,
    }
    return data


@router.get("/configs", response_model=list[MergerFSResponse])
async def list_mergerfs_configs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MergerFSConfig))
    configs = result.scalars().all()
    return [_to_response(c) for c in configs]


@router.post("/configs", response_model=MergerFSResponse, status_code=201)
async def create_mergerfs_config(
    data: MergerFSCreate, db: AsyncSession = Depends(get_db)
):
    config = MergerFSConfig(
        name=data.name,
        mount_point=data.mount_point,
        sources=_serialize_sources(data.sources),
        options=data.options,
        auto_mount=data.auto_mount,
        enabled=data.enabled,
    )
    db.add(config)
    await db.commit()
    await db.refresh(config)
    logger.info(
        "MergerFS config created: %s (mount=%s)", config.name, config.mount_point
    )
    return _to_response(config)


@router.get("/configs/{config_id}", response_model=MergerFSResponse)
async def get_mergerfs_config(config_id: int, db: AsyncSession = Depends(get_db)):
    config = await db.get(MergerFSConfig, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="MergerFS config not found")
    return _to_response(config)


@router.put("/configs/{config_id}", response_model=MergerFSResponse)
async def update_mergerfs_config(
    config_id: int, data: MergerFSUpdate, db: AsyncSession = Depends(get_db)
):
    config = await db.get(MergerFSConfig, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="MergerFS config not found")

    update_data = data.model_dump(exclude_unset=True)
    if "sources" in update_data:
        update_data["sources"] = _serialize_sources(update_data["sources"])

    for key, value in update_data.items():
        setattr(config, key, value)

    await db.commit()
    await db.refresh(config)
    logger.info("MergerFS config updated: %s (id=%d)", config.name, config.id)
    return _to_response(config)


@router.delete("/configs/{config_id}")
async def delete_mergerfs_config(config_id: int, db: AsyncSession = Depends(get_db)):
    config = await db.get(MergerFSConfig, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="MergerFS config not found")
    if mergerfs_service.is_mounted(config.mount_point):
        await mergerfs_service.unmount_mergerfs(config.mount_point)
    await db.delete(config)
    await db.commit()
    logger.info("MergerFS config deleted: %s (id=%d)", config.name, config_id)
    return {"detail": "Deleted"}


@router.post("/configs/{config_id}/mount")
async def mount_mergerfs(config_id: int, db: AsyncSession = Depends(get_db)):
    config = await db.get(MergerFSConfig, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="MergerFS config not found")
    logger.info("Mounting MergerFS: %s (id=%d)", config.name, config.id)
    result = await mergerfs_service.mount_mergerfs(config)
    try:
        sources_list = json.loads(config.sources)
    except Exception:
        sources_list = [config.sources]
    mergerfs_details = {
        "Mount Point": config.mount_point,
        "Sources": ", ".join(sources_list),
    }
    if result["success"]:
        logger.info("MergerFS mount successful: %s", config.name)
        await send_alert(
            "SUCCESS",
            f"MergerFS **{config.name}** mounted successfully",
            mergerfs_details,
        )
    else:
        logger.error(
            "MergerFS mount failed: %s – %s",
            config.name,
            result.get("error", "Unknown"),
        )
        await send_alert(
            "ERROR",
            f"MergerFS **{config.name}** failed: {result.get('error', 'Unknown')}",
            mergerfs_details,
        )
    return result


@router.post("/configs/{config_id}/unmount")
async def unmount_mergerfs(config_id: int, db: AsyncSession = Depends(get_db)):
    config = await db.get(MergerFSConfig, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="MergerFS config not found")
    logger.info("Unmounting MergerFS: %s (id=%d)", config.name, config.id)
    result = await mergerfs_service.unmount_mergerfs(config.mount_point)
    if result["success"]:
        logger.info("MergerFS unmount successful: %s", config.name)
        await send_alert(
            "INFO",
            f"MergerFS **{config.name}** unmounted",
            {"Mount Point": config.mount_point},
        )
    return result


@router.get("/configs/{config_id}/status", response_model=MergerFSStatus)
async def get_config_status(config_id: int, db: AsyncSession = Depends(get_db)):
    config = await db.get(MergerFSConfig, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="MergerFS config not found")
    return await mergerfs_service.get_mount_status(config)


@router.get("/status", response_model=list[MergerFSStatus])
async def get_all_statuses(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MergerFSConfig))
    configs = result.scalars().all()
    return [await mergerfs_service.get_mount_status(c) for c in configs]


@router.post("/mount-all")
async def mount_all(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(MergerFSConfig).where(MergerFSConfig.enabled == True)  # noqa: E712
    )
    configs = result.scalars().all()
    logger.info("Mount-all requested for %d enabled MergerFS configs", len(configs))
    results = []
    for c in configs:
        r = await mergerfs_service.mount_mergerfs(c)
        results.append(r)
    return results


@router.post("/unmount-all")
async def unmount_all(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MergerFSConfig))
    configs = result.scalars().all()
    logger.info("Unmount-all requested for %d MergerFS configs", len(configs))
    results = []
    for c in configs:
        r = await mergerfs_service.unmount_mergerfs(c.mount_point)
        results.append({"name": c.name, **r})
    return results
