from pydantic import BaseModel
from datetime import datetime


class MergerFSBase(BaseModel):
    name: str
    mount_point: str
    sources: list[str]
    options: str = (
        "rw,use_ino,allow_other,statfs_ignore=nc,"
        "func.getattr=newest,category.action=all,category.create=ff,"
        "cache.files=partial,dropcacheonclose=true,"
        "kernel_cache,splice_move,splice_read,direct_io,fsname=mergerfs"
    )
    auto_mount: bool = True
    enabled: bool = True


class MergerFSCreate(MergerFSBase):
    pass


class MergerFSUpdate(BaseModel):
    name: str | None = None
    mount_point: str | None = None
    sources: list[str] | None = None
    options: str | None = None
    auto_mount: bool | None = None
    enabled: bool | None = None


class MergerFSResponse(MergerFSBase):
    id: int
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True


class MergerFSStatus(BaseModel):
    id: int
    name: str
    mount_point: str
    mounted: bool
    auto_mount: bool = False
    total_space: str | None = None
    used_space: str | None = None
    free_space: str | None = None
    used_percent: float | None = None
