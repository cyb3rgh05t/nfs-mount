from sqlalchemy import event
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from .config import settings

# SQLite connect args: 30s busy timeout so concurrent writers (auth updates,
# server-monitor scheduler, external API-key dashboards) don't immediately
# fail with "database is locked" — they wait briefly for the writer lock.
_connect_args = {}
if settings.database_url.startswith("sqlite"):
    _connect_args = {"timeout": 30}

engine = create_async_engine(
    settings.database_url,
    echo=False,
    connect_args=_connect_args,
)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


# Enable WAL mode + sane PRAGMAs on every new SQLite connection. WAL lets
# readers and writers operate concurrently (instead of taking an exclusive
# DB lock per write), which is critical when external monitoring (e.g. API
# key polling) hits the API in parallel with internal services.
@event.listens_for(engine.sync_engine, "connect")
def _set_sqlite_pragmas(dbapi_connection, _):
    try:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
    except Exception:
        # Non-SQLite backends will reach here; silently ignore.
        pass


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session() as session:
        yield session
