from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite+aiosqlite:////data/nfs-manager.db"
    api_key: str = ""
    log_level: str = "INFO"
    discord_webhook: str = ""
    telegram_token: str = ""
    telegram_chat_id: str = ""
    telegram_topic_id: str = ""
    log_file: str = "/data/logs/nfs-manager.log"

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
        "rw,nfsvers=4.2,rsize=1048576,wsize=1048576,"
        "hard,proto=tcp,nconnect=16,"
        "timeo=600,retrans=2,noatime,async"
    )

    # Default MergerFS options optimized for streaming
    default_mergerfs_options: str = (
        "rw,use_ino,allow_other,statfs_ignore=nc,"
        "func.getattr=newest,category.action=all,category.create=ff,"
        "cache.files=partial,dropcacheonclose=true,"
        "kernel_cache,splice_move,splice_read,direct_io,fsname=mergerfs"
    )

    class Config:
        env_file = "/config/.env"
        extra = "ignore"


settings = Settings()
