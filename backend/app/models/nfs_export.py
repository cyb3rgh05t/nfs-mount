from datetime import datetime
from typing import Optional

from sqlalchemy import String, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from ..database import Base


class NFSExport(Base):
    __tablename__ = "nfs_exports"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    export_path: Mapped[str] = mapped_column(String(512))
    allowed_hosts: Mapped[str] = mapped_column(String(512), default="*")
    options: Mapped[str] = mapped_column(
        Text,
        default="rw,sync,no_subtree_check,no_root_squash",
    )
    nfs_version: Mapped[str] = mapped_column(String(10), default="4.2")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    auto_enable: Mapped[bool] = mapped_column(Boolean, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )
