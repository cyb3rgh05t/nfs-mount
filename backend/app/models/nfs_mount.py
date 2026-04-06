from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from sqlalchemy.sql import func

from ..database import Base


class NFSMount(Base):
    __tablename__ = "nfs_mounts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    server_ip = Column(String(255), nullable=False)
    remote_path = Column(String(512), nullable=False)
    local_path = Column(String(512), nullable=False, unique=True)
    nfs_version = Column(String(10), default="4.2")
    options = Column(
        Text,
        default=(
            "vers=4.2,proto=tcp,hard,nconnect=16,"
            "rsize=1048576,wsize=1048576,"
            "async,noatime,nocto,ac,actimeo=3600"
        ),
    )
    check_file = Column(String(512), default="")  # optional validation file path
    auto_mount = Column(Boolean, default=True)
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
