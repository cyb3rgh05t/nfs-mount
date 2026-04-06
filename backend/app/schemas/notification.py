from pydantic import BaseModel
from datetime import datetime


class NotificationBase(BaseModel):
    type: str  # "discord" or "telegram"
    enabled: bool = False
    webhook_url: str = ""
    bot_token: str = ""
    chat_id: str = ""
    topic_id: str = ""


class NotificationCreate(NotificationBase):
    pass


class NotificationUpdate(BaseModel):
    enabled: bool | None = None
    webhook_url: str | None = None
    bot_token: str | None = None
    chat_id: str | None = None
    topic_id: str | None = None


class NotificationResponse(NotificationBase):
    id: int
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True


class NotificationTest(BaseModel):
    type: str
    message: str = "Test notification from NFS-MergerFS Manager"
