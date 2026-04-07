import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy import select, func

from .database import engine, Base, async_session
from .logging_config import setup_logging
from .middleware import RequestLoggingMiddleware
from .routers import nfs, mergerfs, system, notifications, auth, vpn
from .services.nfs_service import auto_mount_nfs
from .services.mergerfs_service import auto_mount_mergerfs
from .services.vpn_service import auto_connect_vpn
from .services.notification_service import send_alert
from .models.user import User
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create database tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Create default admin if needed
    await create_default_admin()

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
            await send_alert(status, msg)
    except Exception as e:
        logger.error(f"Auto-mount failed: {e}")

    yield


app = FastAPI(
    title="NFS-MergerFS Manager",
    version="1.0.0",
    lifespan=lifespan,
)

# Request logging middleware
app.add_middleware(RequestLoggingMiddleware)


# API routers
# Health check endpoint (no auth, for Docker healthcheck)
@app.get("/api/system/health", include_in_schema=False)
async def health_check():
    return {"status": "ok"}


app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(nfs.router, prefix="/api/nfs", tags=["NFS"])
app.include_router(mergerfs.router, prefix="/api/mergerfs", tags=["MergerFS"])
app.include_router(vpn.router, prefix="/api/vpn", tags=["VPN"])
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
        file_path = os.path.join(frontend_dist, full_path)
        if full_path and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(frontend_dist, "index.html"))
