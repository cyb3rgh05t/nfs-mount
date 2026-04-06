import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import verify_api_key
from ..database import get_db
from ..models.nfs_mount import NFSMount
from ..schemas.nfs import (
    NFSMountCreate,
    NFSMountResponse,
    NFSMountStatus,
    NFSMountUpdate,
)
from ..services import nfs_service
from ..services.notification_service import send_alert

router = APIRouter(dependencies=[Depends(verify_api_key)])


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
    return {"detail": "Deleted"}


@router.post("/mounts/{mount_id}/mount")
async def mount_nfs(mount_id: int, db: AsyncSession = Depends(get_db)):
    mount = await db.get(NFSMount, mount_id)
    if not mount:
        raise HTTPException(status_code=404, detail="NFS mount not found")
    result = await nfs_service.mount_nfs(mount)
    if result["success"]:
        await send_alert("SUCCESS", f"NFS Mount **{mount.name}** erfolgreich gemountet")
    else:
        await send_alert(
            "ERROR",
            f"NFS Mount **{mount.name}** fehlgeschlagen: {result.get('error', 'Unknown')}",
        )
    return result


@router.post("/mounts/{mount_id}/unmount")
async def unmount_nfs(mount_id: int, db: AsyncSession = Depends(get_db)):
    mount = await db.get(NFSMount, mount_id)
    if not mount:
        raise HTTPException(status_code=404, detail="NFS mount not found")
    result = await nfs_service.unmount_nfs(mount.local_path)
    if result["success"]:
        await send_alert("INFO", f"NFS Mount **{mount.name}** unmounted")
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
    results = []
    for m in mounts:
        r = await nfs_service.mount_nfs(m)
        results.append(r)
    return results


@router.post("/unmount-all")
async def unmount_all(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(NFSMount))
    mounts = result.scalars().all()
    results = []
    for m in mounts:
        r = await nfs_service.unmount_nfs(m.local_path)
        results.append({"name": m.name, **r})
    return results
