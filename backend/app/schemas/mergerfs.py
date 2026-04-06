from pydantic import BaseModel
from datetime import datetime


class MergerFSBase(BaseModel):
    name: str
    mount_point: str
    sources: list[str]
    options: str = (
        "rw,async_read=true,use_ino,allow_other,"
        "func.getattr=newest,category.action=all,category.create=ff,"
        "cache.files=auto-full,cache.readdir=true,"
        "cache.statfs=3600,cache.attr=120,cache.entry=120,"
        "cache.negative_entry=60,dropcacheonclose=true,"
        "minfreespace=10G,fsname=mergerfs"
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
