import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import verify_api_key
from ..database import get_db
from ..models.vpn_config import VPNConfig
from ..schemas.vpn import (
    VPNConfigCreate,
    VPNConfigResponse,
    VPNConfigUpdate,
    VPNStatus,
)
from ..services import vpn_service
from ..services.notification_service import send_alert

logger = logging.getLogger("nfs-manager.router.vpn")

router = APIRouter(dependencies=[Depends(verify_api_key)])


@router.get("/configs", response_model=list[VPNConfigResponse])
async def list_vpn_configs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(VPNConfig).order_by(VPNConfig.id))
    return result.scalars().all()


@router.post("/configs", response_model=VPNConfigResponse, status_code=201)
async def create_vpn_config(data: VPNConfigCreate, db: AsyncSession = Depends(get_db)):
    config = VPNConfig(**data.model_dump())
    db.add(config)
    await db.commit()
    await db.refresh(config)
    logger.info("VPN config created: %s (type=%s)", config.name, config.vpn_type)
    return config


@router.get("/configs/{config_id}", response_model=VPNConfigResponse)
async def get_vpn_config(config_id: int, db: AsyncSession = Depends(get_db)):
    config = await db.get(VPNConfig, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="VPN Config not found")
    return config


@router.put("/configs/{config_id}", response_model=VPNConfigResponse)
async def update_vpn_config(
    config_id: int, data: VPNConfigUpdate, db: AsyncSession = Depends(get_db)
):
    config = await db.get(VPNConfig, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="VPN Config not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(config, key, value)
    await db.commit()
    await db.refresh(config)
    logger.info("VPN config updated: %s (id=%d)", config.name, config.id)
    return config


@router.delete("/configs/{config_id}")
async def delete_vpn_config(config_id: int, db: AsyncSession = Depends(get_db)):
    config = await db.get(VPNConfig, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="VPN Config not found")
    # Disconnect first if active
    if config.is_active:
        await vpn_service.disconnect_vpn(config)
    vpn_service._remove_config_file(config)
    await db.delete(config)
    await db.commit()
    logger.info("VPN config deleted: %s (id=%d)", config.name, config_id)
    return {"detail": "Deleted"}


@router.post("/configs/{config_id}/connect")
async def connect_vpn(config_id: int, db: AsyncSession = Depends(get_db)):
    config = await db.get(VPNConfig, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="VPN Config not found")
    logger.info(
        "Connecting VPN: %s (id=%d, type=%s)", config.name, config.id, config.vpn_type
    )
    result = await vpn_service.connect_vpn(config)
    if result["success"]:
        config.is_active = True
        await db.commit()
        logger.info("VPN connected: %s", config.name)
        await send_alert(
            "SUCCESS", f"VPN **{config.name}** ({config.vpn_type}) connected"
        )
    else:
        logger.error(
            "VPN connect failed: %s – %s", config.name, result.get("error", "Unknown")
        )
        await send_alert(
            "ERROR", f"VPN **{config.name}** error: {result.get('error', 'Unknown')}"
        )
    return result


@router.post("/configs/{config_id}/disconnect")
async def disconnect_vpn(config_id: int, db: AsyncSession = Depends(get_db)):
    config = await db.get(VPNConfig, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="VPN Config not found")
    logger.info("Disconnecting VPN: %s (id=%d)", config.name, config.id)
    result = await vpn_service.disconnect_vpn(config)
    if result["success"]:
        config.is_active = False
        await db.commit()
        logger.info("VPN disconnected: %s", config.name)
        await send_alert("INFO", f"VPN **{config.name}** disconnected")
    return result


@router.get("/configs/{config_id}/status", response_model=VPNStatus)
async def get_vpn_status(config_id: int, db: AsyncSession = Depends(get_db)):
    config = await db.get(VPNConfig, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="VPN Config not found")
    return await vpn_service.get_vpn_status(config)


@router.get("/status", response_model=list[VPNStatus])
async def get_all_vpn_status(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(VPNConfig))
    configs = result.scalars().all()
    statuses = []
    for config in configs:
        status = await vpn_service.get_vpn_status(config)
        statuses.append(status)
    return statuses
