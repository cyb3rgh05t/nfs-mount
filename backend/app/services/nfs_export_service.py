import asyncio
import logging
import os
import subprocess

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import async_session
from ..models.nfs_export import NFSExport

logger = logging.getLogger("nfs-manager")

EXPORTS_FILE = "/etc/exports"
MANAGED_BEGIN = "# --- NFS-Manager BEGIN ---"
MANAGED_END = "# --- NFS-Manager END ---"


async def _run(cmd: list[str], timeout: int = 30) -> subprocess.CompletedProcess:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None,
        lambda: subprocess.run(cmd, capture_output=True, text=True, timeout=timeout),
    )


def _build_export_line(export: NFSExport) -> str:
    """Build a single /etc/exports line: /path host(options)"""
    return f"{export.export_path} {export.allowed_hosts}({export.options})"


async def write_exports_file(db: AsyncSession) -> dict:
    """Regenerate the managed section in /etc/exports from all enabled exports."""
    result = await db.execute(
        select(NFSExport).where(NFSExport.enabled == True)  # noqa: E712
    )
    exports = result.scalars().all()

    # Read existing file (preserve non-managed content)
    existing_lines: list[str] = []
    if os.path.isfile(EXPORTS_FILE):
        with open(EXPORTS_FILE, "r") as f:
            existing_lines = f.readlines()

    # Remove old managed block
    new_lines: list[str] = []
    in_managed = False
    for line in existing_lines:
        stripped = line.strip()
        if stripped == MANAGED_BEGIN:
            in_managed = True
            continue
        if stripped == MANAGED_END:
            in_managed = False
            continue
        if not in_managed:
            new_lines.append(line)

    # Build managed block
    managed = [MANAGED_BEGIN + "\n"]
    for exp in exports:
        managed.append(_build_export_line(exp) + "\n")
    managed.append(MANAGED_END + "\n")

    # Combine
    final = new_lines + ["\n"] + managed

    try:
        with open(EXPORTS_FILE, "w") as f:
            f.writelines(final)
        return {"success": True}
    except Exception as e:
        logger.error(f"Failed to write {EXPORTS_FILE}: {e}")
        return {"success": False, "error": str(e)}


async def apply_exports() -> dict:
    """Run exportfs -ra to apply /etc/exports changes."""
    result = await _run(["exportfs", "-ra"])
    if result.returncode != 0:
        logger.error(f"exportfs -ra failed: {result.stderr}")
        return {"success": False, "error": result.stderr.strip()}
    logger.info("NFS exports applied successfully")
    return {"success": True}


async def start_nfs_server() -> dict:
    """Ensure NFS server daemons are running."""
    # Start rpcbind if not running
    await _run(["rpcbind"])
    # Export the filesystems
    result = await _run(["exportfs", "-ra"])
    if result.returncode != 0:
        return {"success": False, "error": result.stderr.strip()}
    # Start nfsd
    result = await _run(["rpc.nfsd", "8"])
    if (
        result.returncode != 0
        and "already running" not in (result.stderr or "").lower()
    ):
        return {"success": False, "error": result.stderr.strip()}
    # Start mountd
    result = await _run(["rpc.mountd"])
    if (
        result.returncode != 0
        and "already running" not in (result.stderr or "").lower()
    ):
        return {"success": False, "error": result.stderr.strip()}
    return {"success": True}


async def get_active_exports() -> list[str]:
    """Get list of currently active NFS exports via exportfs -v."""
    result = await _run(["exportfs", "-v"])
    if result.returncode != 0:
        return []
    return [line.strip() for line in result.stdout.strip().split("\n") if line.strip()]


async def enable_export(export: NFSExport, db: AsyncSession) -> dict:
    """Enable an export: write /etc/exports and apply."""
    write_result = await write_exports_file(db)
    if not write_result["success"]:
        return write_result
    apply_result = await apply_exports()
    if apply_result["success"]:
        export.is_active = True
        await db.commit()
    return apply_result


async def disable_export(export: NFSExport, db: AsyncSession) -> dict:
    """Disable a specific export via exportfs -u."""
    result = await _run(
        ["exportfs", "-u", f"{export.allowed_hosts}:{export.export_path}"]
    )
    export.is_active = False
    await db.commit()
    # Re-write exports file
    await write_exports_file(db)
    await apply_exports()
    if result.returncode != 0:
        return {"success": False, "error": result.stderr.strip()}
    return {"success": True}


async def apply_all_exports() -> dict:
    """Write exports file from DB and apply."""
    async with async_session() as session:
        write_result = await write_exports_file(session)
        if not write_result["success"]:
            return write_result
        apply_result = await apply_exports()
        if apply_result["success"]:
            # Mark all enabled exports as active
            result = await session.execute(
                select(NFSExport).where(NFSExport.enabled == True)  # noqa: E712
            )
            for exp in result.scalars().all():
                exp.is_active = True
            await session.commit()
        return apply_result
