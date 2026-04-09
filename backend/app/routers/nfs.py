import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import verify_api_key
from ..database import get_db
from ..models.nfs_mount import NFSMount
from ..models.nfs_export import NFSExport
from ..schemas.nfs import (
    NFSMountCreate,
    NFSMountResponse,
    NFSMountStatus,
    NFSMountUpdate,
    NFSExportCreate,
    NFSExportResponse,
    NFSExportStatus,
    NFSExportUpdate,
)
from ..services import nfs_service
from ..services import nfs_export_service
from ..services import firewall_service
from ..services.notification_service import send_alert

logger = logging.getLogger("nfs-manager.router.nfs")

router = APIRouter(dependencies=[Depends(verify_api_key)])

# Separate router without auth for debug endpoints
debug_router = APIRouter()


@router.get("/mounts", response_model=list[NFSMountResponse])
async def list_nfs_mounts(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(NFSMount))
    return result.scalars().all()


@router.post("/mounts", response_model=NFSMountResponse, status_code=201)
async def create_nfs_mount(data: NFSMountCreate, db: AsyncSession = Depends(get_db)):
    mount = NFSMount(**data.model_dump())
    db.add(mount)
    await db.commit()
    await db.refresh(mount)
    logger.info(
        "NFS mount created: %s (%s:%s -> %s)",
        mount.name,
        mount.server_ip,
        mount.remote_path,
        mount.local_path,
    )
    return mount


@router.get("/mounts/{mount_id}", response_model=NFSMountResponse)
async def get_nfs_mount(mount_id: int, db: AsyncSession = Depends(get_db)):
    mount = await db.get(NFSMount, mount_id)
    if not mount:
        raise HTTPException(status_code=404, detail="NFS mount not found")
    return mount


@router.put("/mounts/{mount_id}", response_model=NFSMountResponse)
async def update_nfs_mount(
    mount_id: int, data: NFSMountUpdate, db: AsyncSession = Depends(get_db)
):
    mount = await db.get(NFSMount, mount_id)
    if not mount:
        raise HTTPException(status_code=404, detail="NFS mount not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(mount, key, value)
    await db.commit()
    await db.refresh(mount)
    logger.info("NFS mount updated: %s (id=%d)", mount.name, mount.id)
    return mount


@router.delete("/mounts/{mount_id}")
async def delete_nfs_mount(mount_id: int, db: AsyncSession = Depends(get_db)):
    mount = await db.get(NFSMount, mount_id)
    if not mount:
        raise HTTPException(status_code=404, detail="NFS mount not found")
    # Unmount first if mounted
    if nfs_service.is_mounted(mount.local_path):
        await nfs_service.unmount_nfs(mount.local_path)
    await db.delete(mount)
    await db.commit()
    # Update client firewall (removes server if no other mount uses it)
    await firewall_service.apply_client_firewall(db)
    logger.info("NFS mount deleted: %s (id=%d)", mount.name, mount_id)
    return {"detail": "Deleted"}


@router.post("/mounts/{mount_id}/mount")
async def mount_nfs(mount_id: int, db: AsyncSession = Depends(get_db)):
    mount = await db.get(NFSMount, mount_id)
    if not mount:
        raise HTTPException(status_code=404, detail="NFS mount not found")
    logger.info("Mounting NFS: %s (id=%d)", mount.name, mount.id)
    result = await nfs_service.mount_nfs(mount)
    mount_details = {
        "Server": mount.server_ip,
        "Remote Path": mount.remote_path,
        "Local Path": mount.local_path,
        "NFS Version": mount.nfs_version,
    }
    if result["success"]:
        logger.info("NFS mount successful: %s", mount.name)
        await send_alert(
            "SUCCESS",
            f"NFS Mount **{mount.name}** mounted successfully",
            mount_details,
        )
    else:
        logger.error(
            "NFS mount failed: %s – %s", mount.name, result.get("error", "Unknown")
        )
        await send_alert(
            "ERROR",
            f"NFS Mount **{mount.name}** failed: {result.get('error', 'Unknown')}",
            mount_details,
        )
    return result


@router.post("/mounts/{mount_id}/unmount")
async def unmount_nfs(mount_id: int, db: AsyncSession = Depends(get_db)):
    mount = await db.get(NFSMount, mount_id)
    if not mount:
        raise HTTPException(status_code=404, detail="NFS mount not found")
    logger.info("Unmounting NFS: %s (id=%d)", mount.name, mount.id)
    result = await nfs_service.unmount_nfs(mount.local_path)
    if result["success"]:
        logger.info("NFS unmount successful: %s", mount.name)
        await send_alert(
            "INFO",
            f"NFS Mount **{mount.name}** unmounted",
            {
                "Server": mount.server_ip,
                "Local Path": mount.local_path,
            },
        )
    return result


@router.get("/mounts/{mount_id}/status", response_model=NFSMountStatus)
async def get_mount_status(mount_id: int, db: AsyncSession = Depends(get_db)):
    mount = await db.get(NFSMount, mount_id)
    if not mount:
        raise HTTPException(status_code=404, detail="NFS mount not found")
    return await nfs_service.get_mount_status(mount)


@router.get("/status", response_model=list[NFSMountStatus])
async def get_all_mount_statuses(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(NFSMount))
    mounts = result.scalars().all()
    statuses = []
    for m in mounts:
        statuses.append(await nfs_service.get_mount_status(m))
    return statuses


@router.post("/mount-all")
async def mount_all(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(NFSMount).where(NFSMount.enabled == True)  # noqa: E712
    )
    mounts = result.scalars().all()
    logger.info("Mount-all requested for %d enabled NFS mounts", len(mounts))
    results = []
    for m in mounts:
        r = await nfs_service.mount_nfs(m)
        results.append(r)
    return results


@router.post("/unmount-all")
async def unmount_all(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(NFSMount))
    mounts = result.scalars().all()
    logger.info("Unmount-all requested for %d NFS mounts", len(mounts))
    results = []
    for m in mounts:
        r = await nfs_service.unmount_nfs(m.local_path)
        results.append({"name": m.name, **r})
    return results


# ──────────────────────────────────────────
# NFS Exports (Server)
# ──────────────────────────────────────────


@router.get("/exports", response_model=list[NFSExportResponse])
async def list_exports(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(NFSExport))
    return result.scalars().all()


@router.post("/exports", response_model=NFSExportResponse, status_code=201)
async def create_export(data: NFSExportCreate, db: AsyncSession = Depends(get_db)):
    export = NFSExport(**data.model_dump())
    db.add(export)
    await db.commit()
    await db.refresh(export)
    logger.info("NFS export created: %s (%s)", export.name, export.export_path)
    return export


@router.get("/exports/{export_id}", response_model=NFSExportResponse)
async def get_export(export_id: int, db: AsyncSession = Depends(get_db)):
    export = await db.get(NFSExport, export_id)
    if not export:
        raise HTTPException(status_code=404, detail="NFS export not found")
    return export


@router.put("/exports/{export_id}", response_model=NFSExportResponse)
async def update_export(
    export_id: int, data: NFSExportUpdate, db: AsyncSession = Depends(get_db)
):
    export = await db.get(NFSExport, export_id)
    if not export:
        raise HTTPException(status_code=404, detail="NFS export not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(export, key, value)
    await db.commit()
    await db.refresh(export)
    logger.info("NFS export updated: %s (id=%d)", export.name, export.id)
    return export


@router.delete("/exports/{export_id}")
async def delete_export(export_id: int, db: AsyncSession = Depends(get_db)):
    export = await db.get(NFSExport, export_id)
    if not export:
        raise HTTPException(status_code=404, detail="NFS export not found")
    # Disable export first
    if export.is_active:
        await nfs_export_service.disable_export(export, db)
    await db.delete(export)
    await db.commit()
    # Re-apply exports file
    await nfs_export_service.write_exports_file(db)
    await nfs_export_service.apply_exports()
    # Update firewall rules
    await firewall_service.apply_export_firewall(db)
    logger.info("NFS export deleted: id=%d", export_id)
    return {"detail": "Deleted"}


@router.post("/exports/{export_id}/enable")
async def enable_export(export_id: int, db: AsyncSession = Depends(get_db)):
    export = await db.get(NFSExport, export_id)
    if not export:
        raise HTTPException(status_code=404, detail="NFS export not found")
    logger.info("Enabling NFS export: %s (id=%d)", export.name, export.id)
    result = await nfs_export_service.enable_export(export, db)
    export_details = {
        "Export Path": export.export_path,
        "Allowed Hosts": export.allowed_hosts,
        "Options": export.options,
        "NFS Version": export.nfs_version,
    }
    if result["success"]:
        logger.info("NFS export enabled: %s", export.name)
        await send_alert(
            "SUCCESS",
            f"NFS Export **{export.name}** enabled",
            export_details,
        )
    else:
        logger.error(
            "NFS export enable failed: %s – %s",
            export.name,
            result.get("error", "Unknown"),
        )
        await send_alert(
            "ERROR",
            f"NFS Export **{export.name}** failed: {result.get('error', 'Unknown')}",
            export_details,
        )
    return result


@router.post("/exports/{export_id}/disable")
async def disable_export(export_id: int, db: AsyncSession = Depends(get_db)):
    export = await db.get(NFSExport, export_id)
    if not export:
        raise HTTPException(status_code=404, detail="NFS export not found")
    logger.info("Disabling NFS export: %s (id=%d)", export.name, export.id)
    result = await nfs_export_service.disable_export(export, db)
    if result["success"]:
        logger.info("NFS export disabled: %s", export.name)
        await send_alert(
            "INFO",
            f"NFS Export **{export.name}** disabled",
            {
                "Export Path": export.export_path,
                "Allowed Hosts": export.allowed_hosts,
            },
        )
    return result


@router.get("/exports-status", response_model=list[NFSExportStatus])
async def get_all_export_statuses(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(NFSExport))
    exports = result.scalars().all()
    active_lines = await nfs_export_service.get_active_exports()
    statuses = []
    for exp in exports:
        is_active = any(exp.export_path in line for line in active_lines)
        statuses.append(
            {
                "id": exp.id,
                "name": exp.name,
                "export_path": exp.export_path,
                "is_active": is_active,
            }
        )
    return statuses


@router.get("/exports-system")
async def get_system_exports():
    """Get manually configured exports from /etc/exports (non-managed)."""
    return nfs_export_service.get_system_exports()


@router.post("/exports-apply")
async def apply_all_exports(db: AsyncSession = Depends(get_db)):
    """Write all exports to /etc/exports and apply."""
    write_result = await nfs_export_service.write_exports_file(db)
    if not write_result["success"]:
        return write_result
    # Ensure NFS server daemons are running (also calls exportfs -ra)
    result = await nfs_export_service.start_nfs_server()
    if result["success"]:
        # Mark enabled exports as active
        res = await db.execute(
            select(NFSExport).where(NFSExport.enabled == True)  # noqa: E712
        )
        enabled_exports = list(res.scalars().all())
        for exp in enabled_exports:
            exp.is_active = True
        await db.commit()
        logger.info("All NFS exports applied successfully")
        paths = ", ".join(e.export_path for e in enabled_exports) or "none"
        await send_alert(
            "SUCCESS",
            "All NFS exports applied",
            {"Exports": str(len(enabled_exports)), "Paths": paths},
        )
    return result


@debug_router.get("/exports-debug")
async def debug_exports(db: AsyncSession = Depends(get_db)):
    """Debug endpoint: show current state of NFS exports system."""
    import os
    import subprocess

    # 1) DB state
    result = await db.execute(select(NFSExport))
    db_exports = []
    for exp in result.scalars().all():
        db_exports.append(
            {
                "id": exp.id,
                "name": exp.name,
                "export_path": exp.export_path,
                "allowed_hosts": exp.allowed_hosts,
                "enabled": exp.enabled,
                "is_active": exp.is_active,
                "auto_enable": exp.auto_enable,
            }
        )

    # 2) /etc/exports file content
    exports_content = ""
    try:
        if os.path.isfile("/etc/exports"):
            with open("/etc/exports", "r") as f:
                exports_content = f.read()
        else:
            exports_content = "[FILE DOES NOT EXIST]"
    except Exception as e:
        exports_content = f"[READ ERROR: {e}]"

    # 3) exportfs -v output
    try:
        r = subprocess.run(
            ["exportfs", "-v"], capture_output=True, text=True, timeout=10
        )
        exportfs_output = r.stdout.strip() or "(empty)"
        exportfs_stderr = r.stderr.strip()
        exportfs_rc = r.returncode
    except Exception as e:
        exportfs_output = f"[ERROR: {e}]"
        exportfs_stderr = ""
        exportfs_rc = -1

    # 4) NFS daemon status
    daemons = {}
    for name in ["rpcbind", "rpc.nfsd", "rpc.mountd", "rpc.statd"]:
        try:
            r = subprocess.run(
                ["pidof", name.split(".")[-1]],
                capture_output=True,
                text=True,
                timeout=5,
            )
            daemons[name] = {"running": r.returncode == 0, "pids": r.stdout.strip()}
        except Exception:
            daemons[name] = {"running": False, "pids": ""}

    # 5) rpcinfo
    try:
        r = subprocess.run(
            ["rpcinfo", "-p"], capture_output=True, text=True, timeout=10
        )
        rpcinfo = (
            r.stdout.strip()
            if r.returncode == 0
            else f"[ERROR rc={r.returncode}: {r.stderr.strip()}]"
        )
    except Exception as e:
        rpcinfo = f"[ERROR: {e}]"

    return {
        "db_exports": db_exports,
        "etc_exports_content": exports_content,
        "exportfs_v": exportfs_output,
        "exportfs_stderr": exportfs_stderr,
        "exportfs_rc": exportfs_rc,
        "nfs_daemons": daemons,
        "rpcinfo": rpcinfo,
    }
