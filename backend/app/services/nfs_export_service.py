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
HOST_EXPORTS_FILE = "/proc/1/root/etc/exports"
MANAGED_BEGIN = "# --- NFS-Manager BEGIN ---"
MANAGED_END = "# --- NFS-Manager END ---"


def _get_exports_path() -> str:
    """Return the effective /etc/exports path.

    Prefers the host file via /proc/1/root (privileged container) so edits
    affect the host NFS server directly.
    """
    if os.path.isfile(HOST_EXPORTS_FILE):
        return HOST_EXPORTS_FILE
    return EXPORTS_FILE


def _nsenter_prefix() -> list[str]:
    """Return nsenter prefix to run commands in the host's full namespace.

    Uses mount (-m), PID (-p), network (-n) and IPC (-i) namespaces so
    that tools like exportfs can access the host's /var/lib/nfs/etab,
    rpcbind socket, and kernel NFS interfaces.
    """
    return ["nsenter", "-t", "1", "-m", "-p", "-n", "-i", "--"]


def _exportfs_cmd(args: list[str]) -> list[str]:
    """Build an exportfs command, using nsenter into the host namespaces
    when running in a privileged container."""
    if os.path.isfile(HOST_EXPORTS_FILE):
        return _nsenter_prefix() + ["exportfs"] + args
    return ["exportfs"] + args


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


async def write_exports_file(
    db: AsyncSession = None, extra_lines: list[str] = None
) -> dict:
    """Regenerate the managed section in /etc/exports from all enabled exports.

    Uses a fresh DB session to guarantee reading committed state.
    extra_lines: additional export lines to include (bypass DB query).
    """
    export_lines = list(extra_lines or [])

    # Read enabled exports from a fresh session (supplements extra_lines)
    try:
        async with async_session() as fresh_db:
            result = await fresh_db.execute(
                select(NFSExport).where(NFSExport.enabled == True)  # noqa: E712
            )
            exports = result.scalars().all()
            for exp in exports:
                line = _build_export_line(exp)
                if line not in export_lines:
                    export_lines.append(line)
    except Exception as e:
        logger.error(f"write_exports_file: DB query failed: {e}")

    logger.info(f"write_exports_file: {len(export_lines)} export lines to write")

    exports_path = _get_exports_path()

    # Read existing file (preserve non-managed content)
    existing_lines: list[str] = []
    if os.path.isfile(exports_path):
        with open(exports_path, "r") as f:
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
    for line in export_lines:
        managed.append(line + "\n")
    managed.append(MANAGED_END + "\n")

    # Combine
    final = new_lines + ["\n"] + managed

    try:
        with open(exports_path, "w") as f:
            f.writelines(final)
        logger.info(
            f"write_exports_file: wrote {len(export_lines)} exports to {exports_path}"
        )
        return {"success": True}
    except Exception as e:
        logger.error(f"Failed to write {exports_path}: {e}")
        return {"success": False, "error": str(e)}


async def apply_exports() -> dict:
    """Run exportfs -ra to apply /etc/exports changes."""
    cmd = _exportfs_cmd(["-ra"])
    result = await _run(cmd)
    if result.returncode != 0:
        logger.error(f"exportfs -ra failed: {result.stderr}")
        return {"success": False, "error": result.stderr.strip()}
    return {"success": True}


def _host_nfs_running() -> bool:
    """Check if the host NFS server is running.

    Checks multiple indicators since container PID namespace can't see host processes:
    1. /proc/fs/nfsd/threads > 0
    2. Port 2049 is listening (via ss)
    """
    # Method 1: /proc/fs/nfsd/threads
    try:
        with open("/proc/fs/nfsd/threads", "r") as f:
            threads = int(f.read().strip())
            if threads > 0:
                return True
    except Exception:
        pass

    # Method 2: check if port 2049 is listening
    try:
        r = subprocess.run(
            ["ss", "-tlnH", "sport", "=", "2049"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if r.stdout.strip():
            return True
    except Exception:
        pass

    return False


async def start_nfs_server() -> dict:
    """Ensure NFS server daemons are running with fixed ports.

    With network_mode=host + privileged, the host may already have NFS running.
    In that case, we only need `exportfs -ra` to reload the exports table.
    If not, we start the daemons inside the container.
    """
    logger.info("start_nfs_server: checking state...")

    # Check if host NFS server is already running (via /proc/fs/nfsd/threads)
    if _host_nfs_running():
        logger.info("Host NFS running, reloading exports...")
        cmd = _exportfs_cmd(["-ra"])
        result = await _run(cmd)
        if result.returncode != 0:
            logger.error(f"exportfs -ra failed: {result.stderr.strip()}")
            return {"success": False, "error": result.stderr.strip()}
        return {"success": True}

    # Host NFS not running — start daemons ourselves
    logger.info("Host NFS not running, starting daemons...")

    # Ensure /proc/fs/nfsd is mounted
    r = await _run(["mountpoint", "-q", "/proc/fs/nfsd"])
    if r.returncode != 0:
        await _run(["modprobe", "nfsd"])
        await _run(["mkdir", "-p", "/proc/fs/nfsd"])
        await _run(["mount", "-t", "nfsd", "nfsd", "/proc/fs/nfsd"])

    # Ensure rpc_pipefs is mounted
    r = await _run(["mountpoint", "-q", "/var/lib/nfs/rpc_pipefs"])
    if r.returncode != 0:
        await _run(["mkdir", "-p", "/var/lib/nfs/rpc_pipefs"])
        await _run(
            ["mount", "-t", "rpc_pipefs", "rpc_pipefs", "/var/lib/nfs/rpc_pipefs"]
        )

    # Start rpcbind if not running
    await _run(["rpcbind"])
    # Start statd with fixed port
    await _run(["rpc.statd", "--port", str(firewall_service.STATD_PORT)])
    # Export the filesystems
    result = await _run(["exportfs", "-ra"])
    if result.returncode != 0:
        return {"success": False, "error": result.stderr.strip()}
    # Start nfsd with configured thread count
    result = await _run(["rpc.nfsd", str(settings.nfs_threads)])
    if (
        result.returncode != 0
        and "already running" not in (result.stderr or "").lower()
    ):
        return {"success": False, "error": result.stderr.strip()}
    # Start mountd with fixed port
    result = await _run(["rpc.mountd", "--port", str(firewall_service.MOUNTD_PORT)])
    if (
        result.returncode != 0
        and "already running" not in (result.stderr or "").lower()
    ):
        return {"success": False, "error": result.stderr.strip()}
    logger.info("NFS daemons started successfully")
    return {"success": True}


async def get_active_exports() -> list[str]:
    """Get list of currently active NFS exports via exportfs -v.

    Returns lines in ``path host(options)`` format.  The raw output of
    ``exportfs -v`` splits path and host across two lines, so we join
    continuation lines (those starting with whitespace) back onto the
    preceding path line.
    """
    try:
        cmd = _exportfs_cmd(["-v"])
        result = await _run(cmd)
    except FileNotFoundError:
        logger.warning("exportfs not found – nfs-kernel-server not installed?")
        return []
    if result.returncode != 0:
        return []
    # Join continuation lines: "  \t144.76.87.20(…)" belongs to the preceding path
    merged: list[str] = []
    for raw_line in result.stdout.split("\n"):
        if not raw_line.strip():
            continue
        if raw_line[0] in (" ", "\t") and merged:
            # continuation – append host part to previous path line
            merged[-1] = merged[-1] + " " + raw_line.strip()
        else:
            merged.append(raw_line.strip())
    return merged


def _parse_exports_lines(lines, source: str = "system") -> list[dict]:
    """Parse export lines and return structured entries, skipping managed block."""
    entries = []
    in_managed = False
    for line in lines:
        stripped = line.strip()
        if stripped == MANAGED_BEGIN:
            in_managed = True
            continue
        if stripped == MANAGED_END:
            in_managed = False
            continue
        if in_managed or not stripped or stripped.startswith("#"):
            continue
        parts = stripped.split()
        if len(parts) >= 2:
            export_path = parts[0]
            for hp in parts[1:]:
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
                        "source": source,
                    }
                )
        elif len(parts) == 1:
            entries.append(
                {
                    "export_path": parts[0],
                    "allowed_hosts": "*",
                    "options": "",
                    "source": source,
                }
            )
    return entries


def get_system_exports() -> list[dict]:
    """Parse /etc/exports and /etc/exports.d/*.exports for non-managed entries."""
    entries = []

    # Determine host-aware base path
    if os.path.isfile(HOST_EXPORTS_FILE):
        base = "/proc/1/root"
    else:
        base = ""

    # Parse main /etc/exports
    main_path = f"{base}/etc/exports"
    if os.path.isfile(main_path):
        try:
            with open(main_path, "r") as f:
                entries.extend(_parse_exports_lines(f, source="system"))
        except Exception as e:
            logger.error(f"Failed to parse {main_path}: {e}")

    # Parse /etc/exports.d/*.exports
    exports_d = f"{base}/etc/exports.d"
    if os.path.isdir(exports_d):
        try:
            for fname in sorted(os.listdir(exports_d)):
                if not fname.endswith(".exports"):
                    continue
                fpath = os.path.join(exports_d, fname)
                if os.path.isfile(fpath):
                    with open(fpath, "r") as f:
                        entries.extend(
                            _parse_exports_lines(f, source=f"system ({fname})")
                        )
        except Exception as e:
            logger.error(f"Failed to parse {exports_d}: {e}")

    return entries


async def enable_export(export: NFSExport, db: AsyncSession) -> dict:
    """Enable an export: write /etc/exports, start NFS server, and update firewall."""
    logger.info(
        f"Enabling export '{export.name}' → {export.allowed_hosts}:{export.export_path}"
    )
    export.enabled = True
    export.is_active = False
    await db.commit()
    await db.refresh(export)

    # Build the line and pass it directly to write_exports_file
    this_line = _build_export_line(export)
    write_result = await write_exports_file(db, extra_lines=[this_line])
    if not write_result["success"]:
        return write_result

    server_result = await start_nfs_server()
    if not server_result["success"]:
        logger.error(f"NFS server start failed: {server_result.get('error')}")
        return server_result

    export.is_active = True
    await db.commit()
    await db.refresh(export)
    await firewall_service.apply_export_firewall(db)
    logger.info(f"Export '{export.name}' enabled and active")
    return server_result


async def disable_export(export: NFSExport, db: AsyncSession) -> dict:
    """Disable a specific export via exportfs -u and update firewall."""
    logger.info(
        f"Disabling export '{export.name}' → {export.allowed_hosts}:{export.export_path}"
    )
    export.enabled = False
    export.is_active = False
    await db.commit()
    await db.refresh(export)

    # Re-write exports file (removes this export from managed block)
    write_result = await write_exports_file(db)

    # Unexport specifically
    cmd = _exportfs_cmd(["-u", f"{export.allowed_hosts}:{export.export_path}"])
    unexport_result = await _run(cmd)
    if unexport_result.returncode != 0:
        logger.warning(f"exportfs -u: {unexport_result.stderr.strip()}")

    # Reload all exports (so host manual exports stay active)
    await apply_exports()
    await firewall_service.apply_export_firewall(db)

    if not write_result["success"]:
        return write_result
    logger.info(f"Export '{export.name}' disabled")
    return {"success": True}


async def apply_all_exports() -> dict:
    """Write exports file from DB, start NFS server, and update firewall."""
    async with async_session() as session:
        # Build export lines from session directly (don't rely on write_exports_file re-query)
        result = await session.execute(
            select(NFSExport).where(NFSExport.enabled == True)  # noqa: E712
        )
        enabled_exports = result.scalars().all()
        lines = [_build_export_line(exp) for exp in enabled_exports]
        logger.info(f"apply_all_exports: {len(lines)} enabled exports")

        write_result = await write_exports_file(session, extra_lines=lines)
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
