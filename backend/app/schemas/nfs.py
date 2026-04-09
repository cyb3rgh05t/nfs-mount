from pydantic import BaseModel
from datetime import datetime


class NFSMountBase(BaseModel):
    name: str
    server_ip: str
    remote_path: str
    local_path: str
    nfs_version: str = "4.2"
    options: str = (
        "vers=4.2,proto=tcp,hard,nconnect=16,"
        "rsize=1048576,wsize=1048576,"
        "async,noatime,nocto,ac,actimeo=3600"
    )
    check_file: str = ""
    auto_mount: bool = True
    enabled: bool = True


class NFSMountCreate(NFSMountBase):
    pass


class NFSMountUpdate(BaseModel):
    name: str | None = None
    server_ip: str | None = None
    remote_path: str | None = None
    local_path: str | None = None
    nfs_version: str | None = None
    options: str | None = None
    check_file: str | None = None
    auto_mount: bool | None = None
    enabled: bool | None = None


class NFSMountResponse(NFSMountBase):
    id: int
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True


class NFSMountStatus(BaseModel):
    id: int
    name: str
    local_path: str
    mounted: bool
    validated: bool
    server_reachable: bool


# --- NFS Export (Server) Schemas ---


class NFSExportBase(BaseModel):
    name: str
    export_path: str
    allowed_hosts: str = "*"
    options: str = "rw,sync,no_subtree_check,no_root_squash"
    nfs_version: str = "4.2"
    enabled: bool = True
    auto_enable: bool = True


class NFSExportCreate(NFSExportBase):
    pass


class NFSExportUpdate(BaseModel):
    name: str | None = None
    export_path: str | None = None
    allowed_hosts: str | None = None
    options: str | None = None
    nfs_version: str | None = None
    enabled: bool | None = None
    auto_enable: bool | None = None


class NFSExportResponse(NFSExportBase):
    id: int
    is_active: bool = False
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True


class NFSExportStatus(BaseModel):
    id: int
    name: str
    export_path: str
    is_active: bool
