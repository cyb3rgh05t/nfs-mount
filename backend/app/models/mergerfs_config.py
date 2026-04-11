from datetime import datetime
from typing import Optional

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from ..database import Base


class MergerFSConfig(Base):
    __tablename__ = "mergerfs_configs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    mount_point: Mapped[str] = mapped_column(String(512), unique=True)
    sources: Mapped[str] = mapped_column(Text)  # JSON array of source paths
    options: Mapped[str] = mapped_column(
        Text,
        default=(
            "rw,use_ino,allow_other,statfs_ignore=nc,"
            "func.getattr=newest,category.action=all,category.create=ff,"
            "cache.files=partial,dropcacheonclose=true,"
            "kernel_cache,splice_move,splice_read,direct_io,fsname=mergerfs"
        ),
    )
    auto_mount: Mapped[bool] = mapped_column(default=True)
    enabled: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )
