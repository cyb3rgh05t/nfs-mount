from pydantic import BaseModel


class FirewallProtectionStatus(BaseModel):
    active: bool
    chain: str
    rules_count: int
    rules: list[str]


class FirewallFixedPorts(BaseModel):
    mountd: int
    nlockmgr: int
    statd: int


class FirewallStatus(BaseModel):
    export_protection: FirewallProtectionStatus
    client_protection: FirewallProtectionStatus
    fixed_ports: FirewallFixedPorts


class FirewallApplyResult(BaseModel):
    success: bool
    exports_count: int | None = None
    mounts_count: int | None = None
    allowed_hosts: list[str] | None = None
    allowed_servers: list[str] | None = None
    error: str | None = None
