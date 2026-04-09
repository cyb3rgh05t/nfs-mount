from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite+aiosqlite:////data/nfs-manager.db"
    api_key: str = ""
    log_level: str = "INFO"
    discord_webhook: str = ""
    telegram_token: str = ""
    telegram_chat_id: str = ""
    telegram_topic_id: str = ""
    log_file: str = "/var/log/nfs-manager/nfs-manager.log"

    # Server identification for notifications
    server_name: str = ""

    # NFS server threads (for exports)
    nfs_threads: int = 512

    # JWT Auth
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = 24
    default_admin_user: str = "admin"
    default_admin_pass: str = "admin"

    # Default NFS options optimized for 300+ concurrent streams
    default_nfs_options: str = (
        "vers=4.2,proto=tcp,hard,nconnect=16,"
        "rsize=1048576,wsize=1048576,"
        "async,noatime,nocto,ac,actimeo=3600"
    )

    # Default MergerFS options optimized for streaming
    default_mergerfs_options: str = (
        "rw,async_read=true,use_ino,allow_other,"
        "func.getattr=newest,category.action=all,category.create=ff,"
        "cache.files=auto-full,cache.readdir=true,"
        "cache.statfs=3600,cache.attr=120,cache.entry=120,"
        "cache.negative_entry=60,dropcacheonclose=true,"
        "minfreespace=10G,fsname=mergerfs"
    )

    class Config:
        env_file = "/config/.env"
        extra = "ignore"


settings = Settings()
