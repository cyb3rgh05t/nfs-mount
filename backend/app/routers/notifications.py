import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import verify_api_key
from ..database import get_db
from ..models.notification import NotificationConfig
from ..schemas.notification import (
    NotificationCreate,
    NotificationResponse,
    NotificationTest,
    NotificationUpdate,
)
from ..services import notification_service

logger = logging.getLogger("nfs-manager.router.notifications")

router = APIRouter(dependencies=[Depends(verify_api_key)])


@router.get("/configs", response_model=list[NotificationResponse])
async def list_configs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(NotificationConfig))
    return result.scalars().all()


@router.post("/configs", response_model=NotificationResponse, status_code=201)
async def create_config(data: NotificationCreate, db: AsyncSession = Depends(get_db)):
    # Check if type already exists
    existing = await db.execute(
        select(NotificationConfig).where(NotificationConfig.type == data.type)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail=f"Notification config for '{data.type}' already exists. Use PUT to update.",
        )
    config = NotificationConfig(**data.model_dump())
    db.add(config)
    await db.commit()
    await db.refresh(config)
    logger.info("Notification config created: type=%s (id=%d)", config.type, config.id)
    return config


@router.put("/configs/{config_id}", response_model=NotificationResponse)
async def update_config(
    config_id: int, data: NotificationUpdate, db: AsyncSession = Depends(get_db)
):
    config = await db.get(NotificationConfig, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="Notification config not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(config, key, value)
    await db.commit()
    await db.refresh(config)
    logger.info("Notification config updated: type=%s (id=%d)", config.type, config.id)
    return config


@router.delete("/configs/{config_id}")
async def delete_config(config_id: int, db: AsyncSession = Depends(get_db)):
    config = await db.get(NotificationConfig, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="Notification config not found")
    await db.delete(config)
    await db.commit()
    logger.info("Notification config deleted: id=%d", config_id)
    return {"detail": "Deleted"}


@router.post("/test")
async def test_notification(data: NotificationTest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(NotificationConfig).where(NotificationConfig.type == data.type)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(
            status_code=404,
            detail=f"No notification config found for type '{data.type}'",
        )

    if config.type == "discord" and config.webhook_url:
        await notification_service.send_discord(
            config.webhook_url, "INFO", data.message
        )
    elif config.type == "telegram" and config.bot_token:
        await notification_service.send_telegram(
            config.bot_token, config.chat_id, config.topic_id, "INFO", data.message
        )
    else:
        raise HTTPException(status_code=400, detail="Notification config incomplete")

    logger.info("Test notification sent via %s", config.type)
    return {"detail": "Test notification sent"}
