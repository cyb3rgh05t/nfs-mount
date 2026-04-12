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
    succeeded = [r for r in results if r.get("success")]
    failed = [r for r in results if not r.get("success")]
    details = {
        "Total": str(len(results)),
        "Succeeded": str(len(succeeded)),
        "Failed": str(len(failed)),
    }
    if failed:
        fail_names = ", ".join(r.get("name", "?") for r in failed)
        details["Failed Mounts"] = fail_names
        await send_alert(
            "WARNING",
            f"NFS Mount All: {len(succeeded)}/{len(results)} succeeded",
            details,
        )
    else:
        await send_alert(
            "SUCCESS", f"NFS Mount All: all {len(succeeded)} mounts successful", details
        )
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
    succeeded = [r for r in results if r.get("success")]
    failed = [r for r in results if not r.get("success")]
    details = {
        "Total": str(len(results)),
        "Succeeded": str(len(succeeded)),
        "Failed": str(len(failed)),
    }
    if failed:
        fail_names = ", ".join(r.get("name", "?") for r in failed)
        details["Failed Mounts"] = fail_names
        await send_alert(
            "WARNING",
            f"NFS Unmount All: {len(succeeded)}/{len(results)} succeeded",
            details,
        )
    else:
        await send_alert(
            "INFO", f"NFS Unmount All: all {len(succeeded)} mounts unmounted", details
        )
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
    export.is_active = False  # Not active until explicitly enabled
    db.add(export)
    await db.commit()
    await db.refresh(export)
    logger.info("NFS export created: %s (%s)", export.name, export.export_path)
    await send_alert(
        "INFO",
        f"NFS Export **{export.name}** created",
        {
            "Export Path": export.export_path,
            "Allowed Hosts": export.allowed_hosts,
            "Options": export.options,
        },
    )
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
    logger.info("NFS export deleted: %s (id=%d)", export.name, export_id)
    await send_alert(
        "WARNING",
        f"NFS Export **{export.name}** deleted",
        {
            "Export Path": export.export_path,
            "Allowed Hosts": export.allowed_hosts,
        },
    )
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
        # Match both path AND host to avoid false positives from system exports
        # with the same path but different hosts
        is_active = any(
            exp.export_path in line and exp.allowed_hosts in line
            for line in active_lines
        )
        statuses.append(
            {
                "id": exp.id,
                "name": exp.name,
                "export_path": exp.export_path,
                "allowed_hosts": exp.allowed_hosts,
                "nfs_version": exp.nfs_version,
                "is_active": is_active,
                "auto_enable": exp.auto_enable,
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

    # 2) /etc/exports file content (prefer host file via /proc/1/root)
    host_exports = "/proc/1/root/etc/exports"
    exports_path = host_exports if os.path.isfile(host_exports) else "/etc/exports"
    exports_content = ""
    try:
        if os.path.isfile(exports_path):
            with open(exports_path, "r") as f:
                exports_content = f.read()
        else:
            exports_content = "[FILE DOES NOT EXIST]"
    except Exception as e:
        exports_content = f"[READ ERROR: {e}]"

    # 3) exportfs -v output (use nsenter with full namespaces if host file available)
    exportfs_cmd = (
        ["nsenter", "-t", "1", "-m", "-p", "-n", "-i", "--", "exportfs", "-v"]
        if os.path.isfile(host_exports)
        else ["exportfs", "-v"]
    )
    try:
        r = subprocess.run(exportfs_cmd, capture_output=True, text=True, timeout=10)
        exportfs_output = r.stdout.strip() or "(empty)"
        exportfs_stderr = r.stderr.strip()
        exportfs_rc = r.returncode
    except Exception as e:
        exportfs_output = f"[ERROR: {e}]"
        exportfs_stderr = ""
        exportfs_rc = -1

    # 4) NFS daemon status
    daemons = {}
    # Map display name → possible process names for pidof
    daemon_names = {
        "rpcbind": ["rpcbind"],
        "rpc.nfsd": ["nfsd"],
        "rpc.mountd": ["rpc.mountd", "mountd"],
        "rpc.statd": ["rpc.statd", "statd"],
    }
    for name, candidates in daemon_names.items():
        running = False
        pids = ""
        for proc_name in candidates:
            if running:
                break
            try:
                r = subprocess.run(
                    ["pidof", proc_name],
                    capture_output=True,
                    text=True,
                    timeout=5,
                )
                if r.returncode == 0:
                    running = True
                    pids = r.stdout.strip()
            except Exception:
                pass
        daemons[name] = {"running": running, "pids": pids}

    # 5) rpcinfo (use nsenter to query host's rpcbind)
    try:
        r = subprocess.run(
            ["nsenter", "-t", "1", "-m", "-n", "--", "rpcinfo", "-p"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        rpcinfo = (
            r.stdout.strip()
            if r.returncode == 0
            else f"[ERROR rc={r.returncode}: {r.stderr.strip()}]"
        )
    except Exception as e:
        rpcinfo = f"[ERROR: {e}]"

    # 6) /proc/fs/nfsd/threads (shows if host NFS server is running)
    nfsd_threads = ""
    try:
        if os.path.isfile("/proc/fs/nfsd/threads"):
            with open("/proc/fs/nfsd/threads", "r") as f:
                nfsd_threads = f.read().strip()
        else:
            nfsd_threads = "[/proc/fs/nfsd/threads DOES NOT EXIST]"
    except Exception as e:
        nfsd_threads = f"[READ ERROR: {e}]"

    # 7) Check if /etc/exports is bind-mounted from host
    exports_mount = ""
    try:
        with open("/proc/mounts", "r") as f:
            for line in f:
                if "/etc/exports" in line:
                    exports_mount = line.strip()
                    break
            if not exports_mount:
                exports_mount = (
                    "[NOT bind-mounted — container has its own /etc/exports!]"
                )
    except Exception as e:
        exports_mount = f"[ERROR: {e}]"

    # 8) ss/netstat check for NFS port 2049
    nfs_port_status = ""
    try:
        r = subprocess.run(["ss", "-tlnp"], capture_output=True, text=True, timeout=5)
        nfs_lines = [l for l in r.stdout.split("\n") if ":2049 " in l or ":111 " in l]
        nfs_port_status = (
            "\n".join(nfs_lines) if nfs_lines else "(ports 111/2049 not listening)"
        )
    except Exception as e:
        nfs_port_status = f"[ERROR: {e}]"

    # 9) /etc/exports.d/ contents (host-aware)
    exports_d_path = (
        "/proc/1/root/etc/exports.d"
        if os.path.isfile(host_exports)
        else "/etc/exports.d"
    )
    exports_d = {}
    if os.path.isdir(exports_d_path):
        try:
            for fname in sorted(os.listdir(exports_d_path)):
                fpath = os.path.join(exports_d_path, fname)
                if os.path.isfile(fpath):
                    with open(fpath, "r") as f:
                        exports_d[fname] = f.read()
        except Exception as e:
            exports_d["_error"] = str(e)
    else:
        exports_d["_status"] = f"{exports_d_path} does not exist"

    return {
        "exports_path_used": exports_path,
        "db_exports": db_exports,
        "etc_exports_content": exports_content,
        "etc_exports_d": exports_d,
        "exportfs_v": exportfs_output,
        "exportfs_stderr": exportfs_stderr,
        "exportfs_rc": exportfs_rc,
        "nfs_daemons": daemons,
        "rpcinfo": rpcinfo,
        "nfsd_threads": nfsd_threads,
        "exports_bind_mount": exports_mount,
        "nfs_port_listening": nfs_port_status,
    }
