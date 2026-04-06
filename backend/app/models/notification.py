from datetime import datetime
from typing import Optional

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from ..database import Base


class NotificationConfig(Base):
    __tablename__ = "notification_configs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    type: Mapped[str] = mapped_column(
        String(50), unique=True
    )  # "discord" or "telegram"
    enabled: Mapped[bool] = mapped_column(default=False)
    webhook_url: Mapped[str] = mapped_column(String(512), default="")
    bot_token: Mapped[str] = mapped_column(String(255), default="")
    chat_id: Mapped[str] = mapped_column(String(100), default="")
    topic_id: Mapped[str] = mapped_column(String(100), default="")
    created_at: Mapped[Optional[datetime]] = mapped_column(server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )
