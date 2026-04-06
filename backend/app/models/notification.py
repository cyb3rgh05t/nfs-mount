from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func

from ..database import Base


class NotificationConfig(Base):
    __tablename__ = "notification_configs"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String(50), nullable=False, unique=True)  # "discord" or "telegram"
    enabled = Column(Boolean, default=False)
    webhook_url = Column(String(512), default="")  # Discord webhook
    bot_token = Column(String(255), default="")  # Telegram bot token
    chat_id = Column(String(100), default="")  # Telegram chat ID
    topic_id = Column(String(100), default="")  # Telegram topic ID
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
