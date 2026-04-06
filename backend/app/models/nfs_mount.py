from datetime import datetime
from typing import Optional

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from ..database import Base


class NFSMount(Base):
    __tablename__ = "nfs_mounts"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    server_ip: Mapped[str] = mapped_column(String(255))
    remote_path: Mapped[str] = mapped_column(String(512))
    local_path: Mapped[str] = mapped_column(String(512), unique=True)
    nfs_version: Mapped[str] = mapped_column(String(10), default="4.2")
    options: Mapped[str] = mapped_column(
        Text,
        default=(
            "vers=4.2,proto=tcp,hard,nconnect=16,"
            "rsize=1048576,wsize=1048576,"
            "async,noatime,nocto,ac,actimeo=3600"
        ),
    )
    check_file: Mapped[str] = mapped_column(String(512), default="")
    auto_mount: Mapped[bool] = mapped_column(default=True)
    enabled: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )
