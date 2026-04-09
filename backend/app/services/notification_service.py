import logging
import os
import socket
from dataclasses import dataclass
from datetime import datetime

import httpx

from ..config import settings


def _get_server_name() -> str:
    """Get server name for notifications. Priority: SERVER_NAME env > host hostname > container hostname."""
    if settings.server_name:
        return settings.server_name
    # Try to read the real host hostname (works when /etc/hostname is from the host)
    try:
        with open("/etc/hostname_host", "r") as f:
            name = f.read().strip()
            if name:
                return name
    except Exception:
        pass
    return socket.gethostname()


from ..database import async_session
from ..models.notification import NotificationConfig
from sqlalchemy import select

logger = logging.getLogger("nfs-manager.service.notification")


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


async def send_discord(
    webhook_url: str, status: str, message: str, details: dict | None = None
):
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
    server_name = _get_server_name()

    fields = [
        {"name": "**Status**", "value": f"`{status}`", "inline": True},
        {"name": "**Server**", "value": f"`{server_name}`", "inline": True},
    ]
    if details:
        # Add a blank inline field to force a new row
        fields.append({"name": "\u200b", "value": "\u200b", "inline": True})
        for key, value in details.items():
            fields.append({"name": f"**{key}**", "value": f"`{value}`", "inline": True})

    payload = {
        "embeds": [
            {
                "title": f"{emoji} NFS-MergerFS Manager",
                "description": f"**Meldung:** _{message}_",
                "color": color,
                "fields": fields,
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
    token: str,
    chat_id: str,
    topic_id: str,
    status: str,
    message: str,
    details: dict | None = None,
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
    server_name = _get_server_name()

    detail_lines = ""
    if details:
        detail_lines = "\n".join(
            f"<b>{key}:</b> <code>{value}</code>" for key, value in details.items()
        )
        detail_lines = f"\n{detail_lines}\n"

    text = (
        f"<b>{emoji} NFS-MergerFS Manager</b>\n"
        f"\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
        f"<b>Status:</b> <code>{status}</code>\n"
        f"<b>Server:</b> <code>{server_name}</code>\n\n"
        f"<b>Meldung:</b>\n<i>{message}</i>\n"
        f"{detail_lines}\n"
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


async def send_alert(status: str, message: str, details: dict | None = None):
    """Send alert to all configured notification channels."""
    configs = await _get_configs()

    for cfg in configs:
        if cfg.type == "discord" and cfg.webhook_url:
            await send_discord(cfg.webhook_url, status, message, details)
        elif cfg.type == "telegram" and cfg.bot_token and cfg.chat_id:
            await send_telegram(
                cfg.bot_token, cfg.chat_id, cfg.topic_id, status, message, details
            )
