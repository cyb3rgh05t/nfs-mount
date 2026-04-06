from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime


class VPNConfigBase(BaseModel):
    name: str
    vpn_type: str
    config_content: str = ""
    auto_connect: bool = False
    enabled: bool = True

    @field_validator("vpn_type")
    @classmethod
    def validate_type(cls, v):
        if v not in ("wireguard", "openvpn"):
            raise ValueError("vpn_type muss 'wireguard' oder 'openvpn' sein")
        return v


class VPNConfigCreate(VPNConfigBase):
    pass


class VPNConfigUpdate(BaseModel):
    name: Optional[str] = None
    config_content: Optional[str] = None
    auto_connect: Optional[bool] = None
    enabled: Optional[bool] = None


class VPNConfigResponse(BaseModel):
    id: int
    name: str
    vpn_type: str
    config_content: str
    is_active: bool
    auto_connect: bool
    enabled: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class VPNStatus(BaseModel):
    id: int
    name: str
    vpn_type: str
    is_active: bool
    interface: str = ""
    endpoint: str = ""
    transfer: dict = {}
    peers: list = []
