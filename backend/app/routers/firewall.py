import logging

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import verify_api_key
from ..database import get_db
from ..schemas.firewall import FirewallStatus
from ..services import firewall_service

logger = logging.getLogger("nfs-manager.router.firewall")

router = APIRouter(dependencies=[Depends(verify_api_key)])


@router.get("/status", response_model=FirewallStatus)
async def get_firewall_status():
    """Get current firewall protection status."""
    return await firewall_service.get_firewall_status()


@router.post("/apply/exports")
async def apply_export_firewall(db: AsyncSession = Depends(get_db)):
    """Apply/refresh NFS export (server) firewall rules."""
    logger.info("Applying NFS export firewall rules")
    result = await firewall_service.apply_export_firewall(db)
    return result


@router.post("/apply/clients")
async def apply_client_firewall(db: AsyncSession = Depends(get_db)):
    """Apply/refresh NFS client firewall rules."""
    logger.info("Applying NFS client firewall rules")
    result = await firewall_service.apply_client_firewall(db)
    return result


@router.post("/apply/all")
async def apply_all_firewall(db: AsyncSession = Depends(get_db)):
    """Apply/refresh all NFS firewall rules (exports + clients)."""
    logger.info("Applying all NFS firewall rules")
    result = await firewall_service.apply_all_firewall_rules(db)
    return result


@router.post("/remove/exports")
async def remove_export_firewall():
    """Remove NFS export (server) firewall rules."""
    logger.info("Removing NFS export firewall rules")
    result = await firewall_service.remove_export_firewall()
    return result


@router.post("/remove/clients")
async def remove_client_firewall():
    """Remove NFS client firewall rules."""
    logger.info("Removing NFS client firewall rules")
    result = await firewall_service.remove_client_firewall()
    return result


@router.post("/remove/all")
async def remove_all_firewall():
    """Remove all NFS firewall rules."""
    logger.info("Removing all NFS firewall rules")
    result = await firewall_service.remove_all_firewall_rules()
    return result
