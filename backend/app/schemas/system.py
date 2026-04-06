from pydantic import BaseModel


class SystemHealth(BaseModel):
    status: str
    uptime: float
    nfs_mounts_active: int
    mergerfs_mounts_active: int
    vpn_active: bool


class SystemStats(BaseModel):
    cpu_percent: float
    memory_total: int
    memory_used: int
    memory_percent: float
    disk_stats: list[dict]
    network_io: dict
    load_avg: list[float]


class KernelParam(BaseModel):
    name: str
    value: str


class KernelTuning(BaseModel):
    params: list[KernelParam]


class LogEntry(BaseModel):
    timestamp: str
    level: str
    message: str


class VPNStatus(BaseModel):
    active: bool
    interface: str
    peers: list[dict]
    transfer: dict
