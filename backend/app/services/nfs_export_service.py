import asyncio
import logging
import os
import subprocess

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import async_session
from ..models.nfs_export import NFSExport
from ..services import firewall_service
from ..config import settings

logger = logging.getLogger("nfs-manager.service.nfs_export")

EXPORTS_FILE = "/etc/exports"
MANAGED_BEGIN = "# --- NFS-Manager BEGIN ---"
MANAGED_END = "# --- NFS-Manager END ---"


async def _run(cmd: list[str], timeout: int = 30) -> subprocess.CompletedProcess:
    loop = asyncio.get_event_loop()
    try:
        return await loop.run_in_executor(
            None,
            lambda: subprocess.run(
                cmd, capture_output=True, text=True, timeout=timeout
            ),
        )
    except subprocess.TimeoutExpired:
        return subprocess.CompletedProcess(
            cmd, returncode=-1, stdout="", stderr=f"Command timed out after {timeout}s"
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
    logger.info(f"write_exports_file: found {len(exports)} enabled exports")

    # Read existing file (preserve non-managed content)
    existing_lines: list[str] = []
    if os.path.isfile(EXPORTS_FILE):
        with open(EXPORTS_FILE, "r") as f:
            existing_lines = f.readlines()
        logger.info(
            f"write_exports_file: existing file has {len(existing_lines)} lines"
        )
    else:
        logger.info("write_exports_file: /etc/exports does not exist yet")

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
        line = _build_export_line(exp)
        logger.info(f"write_exports_file: adding export line: {line}")
        managed.append(line + "\n")
    managed.append(MANAGED_END + "\n")

    # Combine
    final = new_lines + ["\n"] + managed

    try:
        with open(EXPORTS_FILE, "w") as f:
            f.writelines(final)
        logger.info(f"write_exports_file: wrote {len(final)} lines to {EXPORTS_FILE}")
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
    """Ensure NFS server daemons are running with fixed ports."""
    logger.info("start_nfs_server: starting NFS server daemons...")

    # Ensure /proc/fs/nfsd is mounted (required for kernel NFS server)
    r = await _run(["mountpoint", "-q", "/proc/fs/nfsd"])
    if r.returncode != 0:
        logger.info("start_nfs_server: mounting /proc/fs/nfsd...")
        await _run(["modprobe", "nfsd"])
        await _run(["mkdir", "-p", "/proc/fs/nfsd"])
        r = await _run(["mount", "-t", "nfsd", "nfsd", "/proc/fs/nfsd"])
        logger.info(f"start_nfs_server: mount nfsd rc={r.returncode} stderr={r.stderr.strip()!r}")

    # Ensure rpc_pipefs is mounted
    r = await _run(["mountpoint", "-q", "/var/lib/nfs/rpc_pipefs"])
    if r.returncode != 0:
        await _run(["mkdir", "-p", "/var/lib/nfs/rpc_pipefs"])
        await _run(["mount", "-t", "rpc_pipefs", "rpc_pipefs", "/var/lib/nfs/rpc_pipefs"])

    # Start rpcbind if not running
    r = await _run(["rpcbind"])
    logger.info(
        f"start_nfs_server: rpcbind rc={r.returncode} stderr={r.stderr.strip()!r}"
    )
    # Start statd with fixed port
    r = await _run(["rpc.statd", "--port", str(firewall_service.STATD_PORT)])
    logger.info(
        f"start_nfs_server: rpc.statd rc={r.returncode} stderr={r.stderr.strip()!r}"
    )
    # Export the filesystems
    result = await _run(["exportfs", "-ra"])
    logger.info(
        f"start_nfs_server: exportfs -ra rc={result.returncode} stdout={result.stdout.strip()!r} stderr={result.stderr.strip()!r}"
    )
    if result.returncode != 0:
        return {"success": False, "error": result.stderr.strip()}
    # Start nfsd with configured thread count
    result = await _run(["rpc.nfsd", str(settings.nfs_threads)])
    logger.info(
        f"start_nfs_server: rpc.nfsd {settings.nfs_threads} rc={result.returncode} stderr={result.stderr.strip()!r}"
    )
    if (
        result.returncode != 0
        and "already running" not in (result.stderr or "").lower()
    ):
        return {"success": False, "error": result.stderr.strip()}
    # Start mountd with fixed port
    result = await _run(["rpc.mountd", "--port", str(firewall_service.MOUNTD_PORT)])
    logger.info(
        f"start_nfs_server: rpc.mountd rc={result.returncode} stderr={result.stderr.strip()!r}"
    )
    if (
        result.returncode != 0
        and "already running" not in (result.stderr or "").lower()
    ):
        return {"success": False, "error": result.stderr.strip()}
    logger.info("start_nfs_server: all daemons started successfully")
    return {"success": True}


async def get_active_exports() -> list[str]:
    """Get list of currently active NFS exports via exportfs -v."""
    try:
        result = await _run(["exportfs", "-v"])
    except FileNotFoundError:
        logger.warning("exportfs not found – nfs-kernel-server not installed?")
        return []
    if result.returncode != 0:
        return []
    return [line.strip() for line in result.stdout.strip().split("\n") if line.strip()]


def get_system_exports() -> list[dict]:
    """Parse /etc/exports and return non-managed entries (manual exports)."""
    if not os.path.isfile(EXPORTS_FILE):
        return []
    entries = []
    in_managed = False
    try:
        with open(EXPORTS_FILE, "r") as f:
            for line in f:
                stripped = line.strip()
                if stripped == MANAGED_BEGIN:
                    in_managed = True
                    continue
                if stripped == MANAGED_END:
                    in_managed = False
                    continue
                if in_managed or not stripped or stripped.startswith("#"):
                    continue
                # Parse: /path host(options) [host2(options2) ...]
                parts = stripped.split()
                if len(parts) >= 2:
                    export_path = parts[0]
                    # Combine remaining parts as host(options) pairs
                    host_parts = parts[1:]
                    for hp in host_parts:
                        # Split host(options) → host, options
                        if "(" in hp and hp.endswith(")"):
                            host = hp[: hp.index("(")]
                            options = hp[hp.index("(") + 1 : -1]
                        else:
                            host = hp
                            options = ""
                        entries.append(
                            {
                                "export_path": export_path,
                                "allowed_hosts": host,
                                "options": options,
                                "source": "system",
                            }
                        )
                elif len(parts) == 1:
                    entries.append(
                        {
                            "export_path": parts[0],
                            "allowed_hosts": "*",
                            "options": "",
                            "source": "system",
                        }
                    )
    except Exception as e:
        logger.error(f"Failed to parse {EXPORTS_FILE}: {e}")
    return entries


async def enable_export(export: NFSExport, db: AsyncSession) -> dict:
    """Enable an export: write /etc/exports, start NFS server, and update firewall."""
    logger.info(
        f"enable_export: enabling '{export.name}' path={export.export_path} hosts={export.allowed_hosts}"
    )
    # Mark as enabled first so write_exports_file includes it
    export.enabled = True
    export.is_active = False  # will be set True after NFS server starts
    await db.flush()
    logger.info(f"enable_export: flushed enabled=True for '{export.name}'")

    write_result = await write_exports_file(db)
    logger.info(f"enable_export: write_exports_file result={write_result}")
    if not write_result["success"]:
        return write_result
    # Ensure NFS server daemons are running (also calls exportfs -ra internally)
    server_result = await start_nfs_server()
    logger.info(f"enable_export: start_nfs_server result={server_result}")
    if not server_result["success"]:
        logger.error(f"NFS server start failed: {server_result.get('error')}")
        return server_result
    export.is_active = True
    await db.commit()
    logger.info(f"enable_export: committed is_active=True for '{export.name}'")
    # Update firewall rules to allow the new host
    await firewall_service.apply_export_firewall(db)
    return server_result


async def disable_export(export: NFSExport, db: AsyncSession) -> dict:
    """Disable a specific export via exportfs -u and update firewall."""
    result = await _run(
        ["exportfs", "-u", f"{export.allowed_hosts}:{export.export_path}"]
    )
    export.enabled = False
    export.is_active = False
    await db.commit()
    # Re-write exports file (this export will be excluded now)
    await write_exports_file(db)
    await apply_exports()
    # Update firewall rules (removes host if no other export uses it)
    await firewall_service.apply_export_firewall(db)
    if result.returncode != 0:
        return {"success": False, "error": result.stderr.strip()}
    return {"success": True}


async def apply_all_exports() -> dict:
    """Write exports file from DB, start NFS server, and update firewall."""
    async with async_session() as session:
        write_result = await write_exports_file(session)
        if not write_result["success"]:
            return write_result
        # Ensure NFS server daemons are running (also calls exportfs -ra internally)
        server_result = await start_nfs_server()
        if server_result["success"]:
            # Mark all enabled exports as active
            result = await session.execute(
                select(NFSExport).where(NFSExport.enabled == True)  # noqa: E712
            )
            for exp in result.scalars().all():
                exp.is_active = True
            await session.commit()
            # Update firewall rules
            await firewall_service.apply_export_firewall(session)
        return server_result
