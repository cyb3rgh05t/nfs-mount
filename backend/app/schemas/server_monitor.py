from pydantic import BaseModel
from datetime import datetime


class MonitorServerBase(BaseModel):
    name: str
    host: str
    port: int = 22
    username: str = "root"
    ssh_key_path: str = "/config/ssh/id_rsa"
    enabled: bool = True


class MonitorServerCreate(MonitorServerBase):
    pass


class MonitorServerUpdate(BaseModel):
    name: str | None = None
    host: str | None = None
    port: int | None = None
    username: str | None = None
    ssh_key_path: str | None = None
    enabled: bool | None = None


class MonitorServerResponse(MonitorServerBase):
    id: int
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True


class ServerMetrics(BaseModel):
    server_id: int
    hostname: str
    online: bool
    error: str | None = None
    # CPU
    cpu_usage: float | None = None
    cpu_cores: int | None = None
    load_1: float | None = None
    load_5: float | None = None
    load_15: float | None = None
    # Memory
    mem_total_mb: float | None = None
    mem_used_mb: float | None = None
    mem_free_mb: float | None = None
    mem_usage_pct: float | None = None
    # Disk
    disks: list[dict] | None = None
    # Network
    net_rx_bytes: int | None = None
    net_tx_bytes: int | None = None
    # Uptime
    uptime_seconds: int | None = None
    uptime_human: str | None = None
    # ARC (ZFS)
    arc_size_mb: float | None = None
    arc_hit_pct: float | None = None
    # ZFS Pools
    zfs_pools: list[dict] | None = None
    zfs_pool_disks: dict | None = None
    # RAID Arrays
    raid_arrays: list[dict] | None = None
    # UnionFS / MergerFS
    union_mounts: list[dict] | None = None
