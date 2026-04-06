# NFS-MergerFS Manager

Docker container with Web UI for managing NFS mounts, MergerFS unions, and UnionFS — optimized for high-throughput media streaming (300+ concurrent streams).

## Features

- **Web UI** — Dark-themed React dashboard for managing all mounts
- **NFS v4.2** — Optimized mount options with `nconnect=16`, 1MB buffers, aggressive caching
- **MergerFS** — Union filesystem with full file/readdir/attribute caching
- **Kernel Tuning** — Auto-applied sysctl parameters for NFS streaming
- **WireGuard VPN** — Optional VPN tunnel for secure NFS traffic
- **Notifications** — Discord & Telegram alerts for mount events
- **Auto-Mount** — Configured mounts start automatically on container startup
- **REST API** — Full API with optional API key authentication

## Quick Start

```bash
# Clone and configure
cp .env.example .env
# Edit .env with your settings

# Build and start
docker compose up -d --build

# Access WebUI
open http://localhost:8080
```

## NFS Streaming Optimization

Default mount options tuned for 300+ concurrent media streams:

```
vers=4.2          # Latest NFS protocol
nconnect=16       # 16 parallel TCP connections per mount
rsize=1048576     # 1MB read buffer
wsize=1048576     # 1MB write buffer
async             # Asynchronous I/O
nocto             # Skip close-to-open consistency (safe for media)
noatime           # No access time tracking
actimeo=3600      # 1 hour attribute cache
```

Kernel tuning applied at startup:

```
sunrpc.tcp_max_slot_table_entries=128   # More concurrent RPC slots
net.core.rmem_max=16777216              # 16MB receive buffer
net.core.wmem_max=16777216              # 16MB send buffer
vm.dirty_ratio=40                       # Page cache optimization
vm.vfs_cache_pressure=50                # Favor inode/dentry caching
```

## WireGuard VPN

Place your WireGuard config at `config/wg0.conf` and the VPN tunnel starts automatically.

## API Endpoints

| Method | Endpoint                           | Description            |
| ------ | ---------------------------------- | ---------------------- |
| GET    | `/api/nfs/mounts`                  | List NFS mounts        |
| POST   | `/api/nfs/mounts`                  | Create NFS mount       |
| POST   | `/api/nfs/mounts/{id}/mount`       | Mount NFS share        |
| POST   | `/api/nfs/mounts/{id}/unmount`     | Unmount NFS share      |
| GET    | `/api/mergerfs/configs`            | List MergerFS configs  |
| POST   | `/api/mergerfs/configs`            | Create MergerFS config |
| POST   | `/api/mergerfs/configs/{id}/mount` | Mount MergerFS         |
| GET    | `/api/system/status`               | System status          |
| GET    | `/api/system/stats`                | System statistics      |
| GET    | `/api/notifications/configs`       | Notification settings  |

## Tech Stack

- **Backend:** Python, FastAPI, SQLAlchemy, Uvicorn
- **Frontend:** React, Tailwind CSS, Vite, Lucide Icons
- **Database:** SQLite
- **Infrastructure:** Docker, WireGuard, NFS v4.2, MergerFS
