from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from sqlalchemy.sql import func

from ..database import Base


class MergerFSConfig(Base):
    __tablename__ = "mergerfs_configs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    mount_point = Column(String(512), nullable=False, unique=True)
    sources = Column(Text, nullable=False)  # JSON array of source paths
    options = Column(
        Text,
        default=(
            "rw,async_read=true,use_ino,allow_other,"
            "func.getattr=newest,category.action=all,category.create=ff,"
            "cache.files=auto-full,cache.readdir=true,"
            "cache.statfs=3600,cache.attr=120,cache.entry=120,"
            "cache.negative_entry=60,dropcacheonclose=true,"
            "minfreespace=10G,fsname=mergerfs"
        ),
    )
    auto_mount = Column(Boolean, default=True)
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
