import logging
from dataclasses import dataclass
from datetime import datetime

import httpx

from ..config import settings
from ..database import async_session
from ..models.notification import NotificationConfig
from sqlalchemy import select

logger = logging.getLogger("nfs-manager")


@dataclass
class _FallbackConfig:
    type: str = ""
    enabled: bool = False
    webhook_url: str = ""
    bot_token: str = ""
    chat_id: str = ""
    topic_id: str = ""


async def _get_configs() -> list:
    """Get all enabled notification configs from DB, falling back to env vars."""
    configs: list = []
    try:
        async with async_session() as session:
            rows = await session.execute(
                select(NotificationConfig).where(
                    NotificationConfig.enabled == True
                )  # noqa: E712
            )
            configs = list(rows.scalars().all())
    except Exception:
        pass

    # Fallback to environment variables if no DB configs
    if not configs:
        if settings.discord_webhook:
            configs.append(
                _FallbackConfig(
                    type="discord",
                    enabled=True,
                    webhook_url=settings.discord_webhook,
                )
            )
        if settings.telegram_token and settings.telegram_chat_id:
            configs.append(
                _FallbackConfig(
                    type="telegram",
                    enabled=True,
                    bot_token=settings.telegram_token,
                    chat_id=settings.telegram_chat_id,
                    topic_id=settings.telegram_topic_id or "",
                )
            )

    return configs


async def send_discord(webhook_url: str, status: str, message: str):
    """Send a Discord notification via webhook."""
    color_map = {
        "STARTUP": 3066993,
        "SUCCESS": 3066993,
        "ERROR": 15158588,
        "CRITICAL": 15158588,
        "INFO": 3447003,
    }
    emoji_map = {
        "STARTUP": "\U0001f680",
        "SUCCESS": "\u2705",
        "ERROR": "\u26a0\ufe0f",
        "CRITICAL": "\u26a0\ufe0f",
        "INFO": "\u2139\ufe0f",
    }

    color = color_map.get(status, 3447003)
    emoji = emoji_map.get(status, "\u2139\ufe0f")
    now = datetime.now().strftime("%d.%m.%Y %H:%M:%S")

    payload = {
        "embeds": [
            {
                "title": f"{emoji} NFS-MergerFS Manager",
                "description": f"**Meldung:** _{message}_",
                "color": color,
                "fields": [
                    {"name": "**Status**", "value": f"`{status}`", "inline": True},
                    {
                        "name": "**Server**",
                        "value": f"`NFS-Manager`",
                        "inline": True,
                    },
                ],
                "footer": {"text": f"System Monitor \u2022 {now}"},
            }
        ]
    }

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(webhook_url, json=payload, timeout=10)
            resp.raise_for_status()
        except Exception as e:
            logger.error(f"Discord notification failed: {e}")


async def send_telegram(
    token: str, chat_id: str, topic_id: str, status: str, message: str
):
    """Send a Telegram notification."""
    emoji_map = {
        "STARTUP": "\U0001f680",
        "SUCCESS": "\u2705",
        "ERROR": "\u26a0\ufe0f",
        "CRITICAL": "\u26a0\ufe0f",
        "INFO": "\u2139\ufe0f",
    }
    emoji = emoji_map.get(status, "\u2139\ufe0f")
    now = datetime.now().strftime("%H:%M:%S | %d.%m.%Y")

    text = (
        f"<b>{emoji} NFS-MergerFS Manager</b>\n"
        f"\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
        f"<b>Status:</b> <code>{status}</code>\n"
        f"<b>Server:</b> <code>NFS-Manager</code>\n\n"
        f"<b>Meldung:</b>\n<i>{message}</i>\n\n"
        f"<code>{now}</code>"
    )

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    params = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
    }
    if topic_id:
        params["message_thread_id"] = topic_id

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(url, data=params, timeout=10)
            resp.raise_for_status()
        except Exception as e:
            logger.error(f"Telegram notification failed: {e}")


async def send_alert(status: str, message: str):
    """Send alert to all configured notification channels."""
    configs = await _get_configs()

    for cfg in configs:
        if cfg.type == "discord" and cfg.webhook_url:
            await send_discord(cfg.webhook_url, status, message)
        elif cfg.type == "telegram" and cfg.bot_token and cfg.chat_id:
            await send_telegram(
                cfg.bot_token, cfg.chat_id, cfg.topic_id, status, message
            )
