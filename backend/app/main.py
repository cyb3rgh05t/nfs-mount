import os
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy import select, func, inspect, text

from .database import engine, Base, async_session
from .logging_config import setup_logging
from .middleware import RequestLoggingMiddleware
from .routers import (
    nfs,
    mergerfs,
    system,
    notifications,
    auth,
    vpn,
    api_keys,
    server_monitor,
    firewall,
)
from .services.nfs_service import auto_mount_nfs
from .services.mergerfs_service import auto_mount_mergerfs
from .services.vpn_service import auto_connect_vpn
from .services.notification_service import send_alert
from .services.system_service import auto_apply_saved_settings
from .services.firewall_service import apply_all_firewall_rules
from .services.nfs_export_service import (
    start_nfs_server,
    write_exports_file,
    _build_export_line,
)
from .models.user import User
from .models.nfs_export import NFSExport
from .auth import hash_password
from .config import settings

# Initialize logging before anything else
setup_logging(level=settings.log_level)

logger = logging.getLogger("nfs-manager")


async def create_default_admin():
    """Create default admin user if no users exist."""
    async with async_session() as session:
        result = await session.execute(select(func.count(User.id)))
        count = result.scalar()
        if count == 0:
            admin = User(
                username=settings.default_admin_user.lower(),
                display_name="Administrator",
                hashed_password=hash_password(settings.default_admin_pass),
                is_admin=True,
            )
            session.add(admin)
            await session.commit()
            logger.info(
                f"Default admin user '{settings.default_admin_user}' created. "
                "Please change the password!"
            )


def _run_migrations(connection):
    """Add missing columns to existing tables (lightweight auto-migration)."""
    insp = inspect(connection)
    # nfs_exports: add auto_enable column if missing
    if insp.has_table("nfs_exports"):
        columns = [c["name"] for c in insp.get_columns("nfs_exports")]
        if "auto_enable" not in columns:
            connection.execute(
                text(
                    "ALTER TABLE nfs_exports ADD COLUMN auto_enable BOOLEAN DEFAULT 1 NOT NULL"
                )
            )
            logger.info("Migration: added 'auto_enable' column to nfs_exports")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create database tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Migrate: add missing columns to existing tables
    async with engine.begin() as conn:
        await conn.run_sync(_run_migrations)

    # Create default admin if needed
    await create_default_admin()

    # Auto-apply saved kernel & RPS/XPS settings from DB
    try:
        async with async_session() as db:
            await auto_apply_saved_settings(db)
    except Exception as e:
        logger.error(f"Auto-apply saved system settings failed: {e}")

    # Auto-mount configured mounts
    try:
        nfs_results = await auto_mount_nfs()
        mergerfs_results = await auto_mount_mergerfs()
        vpn_results = await auto_connect_vpn()
        mounted = sum(
            1 for r in nfs_results + mergerfs_results + vpn_results if r["success"]
        )
        failed = sum(
            1 for r in nfs_results + mergerfs_results + vpn_results if not r["success"]
        )
        if mounted > 0 or failed > 0:
            msg = f"Auto-mount: **{mounted}** successful, **{failed}** failed"
            status = "STARTUP" if failed == 0 else "ERROR"
            nfs_ok = sum(1 for r in nfs_results if r["success"])
            nfs_fail = sum(1 for r in nfs_results if not r["success"])
            mergerfs_ok = sum(1 for r in mergerfs_results if r["success"])
            mergerfs_fail = sum(1 for r in mergerfs_results if not r["success"])
            vpn_ok = sum(1 for r in vpn_results if r["success"])
            vpn_fail = sum(1 for r in vpn_results if not r["success"])
            details = {
                "NFS Mounts": f"{nfs_ok} OK / {nfs_fail} Failed",
                "MergerFS": f"{mergerfs_ok} OK / {mergerfs_fail} Failed",
                "VPN": f"{vpn_ok} OK / {vpn_fail} Failed",
            }
            await send_alert(status, msg, details)
    except Exception as e:
        logger.error(f"Auto-mount failed: {e}")

    # Auto-apply firewall rules for NFS protection
    try:
        fw_result = await apply_all_firewall_rules()
        if fw_result["success"]:
            logger.info("NFS firewall rules applied on startup")
        else:
            logger.warning(f"NFS firewall rules partially failed: {fw_result}")
    except Exception as e:
        logger.error(f"Auto-apply firewall rules failed: {e}")

    # Auto-start NFS server if there are auto-enable exports
    try:
        async with async_session() as db:
            result = await db.execute(
                select(NFSExport).where(
                    NFSExport.enabled == True,  # noqa: E712
                    NFSExport.auto_enable == True,  # noqa: E712
                )
            )
            enabled_exports = list(result.scalars().all())
            if enabled_exports:
                logger.info(
                    f"Found {len(enabled_exports)} auto-enable NFS export(s), starting NFS server..."
                )
                # Build lines directly from ORM objects (avoids fresh-session re-query issues)
                lines = [_build_export_line(exp) for exp in enabled_exports]
                await write_exports_file(db, extra_lines=lines)
                srv_result = await start_nfs_server()
                if srv_result["success"]:
                    for exp in enabled_exports:
                        exp.is_active = True
                    await db.commit()
                    logger.info("NFS server started successfully for exports")
                else:
                    logger.error(f"NFS server start failed: {srv_result.get('error')}")
    except Exception as e:
        logger.error(f"Auto-start NFS exports failed: {e}")

    yield

    # ── Shutdown: send notification ──
    logger.info("Container shutting down...")
    try:
        await send_alert(
            "SHUTDOWN",
            "Container is shutting down",
            {"Action": "All mounts and exports will be unavailable"},
        )
    except Exception as e:
        logger.error(f"Shutdown notification failed: {e}")


app = FastAPI(
    title="NFS-MergerFS Manager",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS – only allow same-origin in production; override via CORS_ORIGINS env
cors_origins = os.environ.get("CORS_ORIGINS", "").split(",")
cors_origins = [o.strip() for o in cors_origins if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request logging middleware
app.add_middleware(RequestLoggingMiddleware)


# API routers
# Health check endpoint (no auth, for Docker healthcheck)
@app.get("/api/system/health", include_in_schema=False)
async def health_check():
    return {"status": "ok"}


app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(api_keys.router, prefix="/api/api-keys", tags=["API Keys"])
app.include_router(nfs.router, prefix="/api/nfs", tags=["NFS"])
app.include_router(nfs.debug_router, prefix="/api/nfs", tags=["NFS Debug"])
app.include_router(mergerfs.router, prefix="/api/mergerfs", tags=["MergerFS"])
app.include_router(vpn.router, prefix="/api/vpn", tags=["VPN"])
app.include_router(server_monitor.router, prefix="/api/monitor", tags=["Monitor"])
app.include_router(firewall.router, prefix="/api/firewall", tags=["Firewall"])
app.include_router(system.router, prefix="/api/system", tags=["System"])
app.include_router(
    notifications.router, prefix="/api/notifications", tags=["Notifications"]
)

# Serve frontend static files
frontend_dist = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
frontend_dist = os.path.abspath(frontend_dist)

if os.path.isdir(frontend_dist):
    assets_dir = os.path.join(frontend_dist, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_frontend(full_path: str):
        # Resolve and verify the path stays within frontend_dist (prevent traversal)
        base = Path(frontend_dist).resolve()
        file_path = (base / full_path).resolve()
        if full_path and file_path.is_file() and str(file_path).startswith(str(base)):
            # Hashed assets get long cache, everything else no-cache
            headers = {}
            if "/assets/" in full_path:
                headers["Cache-Control"] = "public, max-age=31536000, immutable"
            else:
                headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            return FileResponse(str(file_path), headers=headers)
        # index.html (SPA fallback) — always revalidate
        return FileResponse(
            os.path.join(frontend_dist, "index.html"),
            headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
        )
