import { useState } from "react";
import InfoBox from "../components/InfoBox";
import {
  BookOpen,
  HardDrive,
  GitMerge,
  Shield,
  Settings,
  Users,
  Bell,
  Cpu,
  ChevronDown,
  ChevronRight,
  Terminal,
  Globe,
  Lock,
  Layers,
} from "lucide-react";

function Section({
  icon: Icon,
  title,
  iconColor,
  defaultOpen = false,
  children,
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-nfs-card border border-nfs-border rounded-xl mb-4 hover:border-nfs-muted transition-all overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-5 text-left"
      >
        <div className={`p-2 rounded-lg ${iconColor}`}>
          <Icon className="w-4 h-4" />
        </div>
        <h2 className="text-lg font-semibold text-white flex-1">{title}</h2>
        {open ? (
          <ChevronDown className="w-5 h-5 text-nfs-muted" />
        ) : (
          <ChevronRight className="w-5 h-5 text-nfs-muted" />
        )}
      </button>
      {open && (
        <div className="px-5 pb-5 text-sm text-nfs-text leading-relaxed space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}

function Code({ children }) {
  return (
    <code className="px-1.5 py-0.5 bg-nfs-input border border-nfs-border rounded text-xs text-nfs-primary font-mono">
      {children}
    </code>
  );
}

function CodeBlock({ children }) {
  return (
    <pre className="bg-nfs-input border border-nfs-border rounded-lg p-4 text-xs text-nfs-text font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">
      {children}
    </pre>
  );
}

export default function DocsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-white flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-nfs-primary/10">
          <BookOpen className="w-5 h-5 text-nfs-primary" />
        </div>
        Documentation
      </h1>

      <p className="text-nfs-muted mb-6 leading-relaxed">
        Complete guide to the NFS-MergerFS Manager. Manage NFS Mounts, MergerFS
        Unions, VPN Tunnels, and system settings via the Web UI.
      </p>

      {/* Quick Start */}
      <Section
        icon={Globe}
        title="Quick Start"
        iconColor="bg-nfs-primary/10 text-nfs-primary"
        defaultOpen={true}
      >
        <h3 className="font-semibold text-white">Docker Compose</h3>
        <p>The easiest way to start the application is via Docker Compose:</p>
        <CodeBlock>{`version: "3.8"
services:
  nfs-mount:
    image: nfs-mount:latest
    container_name: nfs-mount
    privileged: true
    cap_add:
      - SYS_ADMIN
      - NET_ADMIN
    devices:
      - /dev/fuse
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=Europe/Berlin
      - JWT_SECRET=your-secret-key
      - DEFAULT_ADMIN_USER=admin
      - DEFAULT_ADMIN_PASS=admin
    volumes:
      - /opt/appdata/nfs-mount/data:/data
      - /mnt:/mnt:rshared
    ports:
      - 8080:8080
    restart: unless-stopped`}</CodeBlock>
        <InfoBox type="warning">
          Make sure to change <Code>JWT_SECRET</Code>,{" "}
          <Code>DEFAULT_ADMIN_USER</Code> and <Code>DEFAULT_ADMIN_PASS</Code> to
          secure values!
        </InfoBox>
        <h3 className="font-semibold text-white mt-4">First Login</h3>
        <p>
          After starting, access the UI at <Code>http://IP:8080</Code>. Log in
          with the default credentials (default: <Code>admin</Code> /{" "}
          <Code>admin</Code>). Change your password immediately under Settings.
        </p>
      </Section>

      {/* Auth System */}
      <Section
        icon={Lock}
        title="Authentication"
        iconColor="bg-red-500/10 text-red-400"
      >
        <p>
          The system uses JWT token-based authentication. After login, you
          receive a token that is automatically sent with every API request.
        </p>
        <h3 className="font-semibold text-white">User Management</h3>
        <ul className="list-disc list-inside space-y-1 text-nfs-muted">
          <li>Admins can create, edit, and delete users</li>
          <li>Users can change their own profile and password</li>
          <li>Disabled users cannot log in</li>
        </ul>
        <h3 className="font-semibold text-white mt-3">API Key (Legacy)</h3>
        <p className="text-nfs-muted">
          In addition to JWT auth, an API key can be set via the environment
          variable <Code>API_KEY</Code>. It is sent in the header{" "}
          <Code>X-API-Key</Code> and is primarily intended for external API
          access.
        </p>
        <h3 className="font-semibold text-white mt-3">Environment Variables</h3>
        <CodeBlock>{`JWT_SECRET=my-secret-key              # JWT Token Secret
JWT_EXPIRE_HOURS=24                    # Token validity in hours
DEFAULT_ADMIN_USER=admin               # Default admin username
DEFAULT_ADMIN_PASS=admin               # Default admin password
API_KEY=optional-api-key               # Optional API key`}</CodeBlock>
      </Section>

      {/* NFS Mounts */}
      <Section
        icon={HardDrive}
        title="NFS Mounts"
        iconColor="bg-nfs-primary/10 text-nfs-primary"
      >
        <p>
          Manage NFS Network File System mounts. Optimized for high-throughput
          streaming with 300+ simultaneous streams.
        </p>
        <h3 className="font-semibold text-white">Create a Mount</h3>
        <ol className="list-decimal list-inside space-y-1 text-nfs-muted">
          <li>Navigate to "NFS" in the sidebar</li>
          <li>Click "+ New Mount"</li>
          <li>Fill in the fields: Name, Server IP, Remote Path, Local Path</li>
          <li>Optional: Adjust NFS Version, Mount Options, Check File</li>
          <li>Save and mount using the play button</li>
        </ol>
        <h3 className="font-semibold text-white mt-3">Fields</h3>
        <div className="space-y-2">
          <div className="flex gap-3">
            <Code>Name</Code>
            <span className="text-nfs-muted">Display name of the mount</span>
          </div>
          <div className="flex gap-3">
            <Code>Server IP</Code>
            <span className="text-nfs-muted">IP address of the NFS server</span>
          </div>
          <div className="flex gap-3">
            <Code>Remote Path</Code>
            <span className="text-nfs-muted">
              Path on the server (e.g. /export/media)
            </span>
          </div>
          <div className="flex gap-3">
            <Code>Local Path</Code>
            <span className="text-nfs-muted">
              Local mountpoint (e.g. /mnt/media)
            </span>
          </div>
          <div className="flex gap-3">
            <Code>Check File</Code>
            <span className="text-nfs-muted">
              Optional: File for validation (e.g. /mnt/media/.mounted)
            </span>
          </div>
        </div>
        <h3 className="font-semibold text-white mt-3">Default NFS Options</h3>
        <CodeBlock>
          {`vers=4.2,proto=tcp,hard,nconnect=16,
rsize=1048576,wsize=1048576,
async,noatime,nocto,ac,actimeo=3600`}
        </CodeBlock>
        <InfoBox type="info">
          <Code>nconnect=16</Code> creates 16 parallel TCP connections per mount
          for maximum throughput. <Code>rsize</Code>/<Code>wsize</Code> of 1MB
          optimizes large sequential reads.
        </InfoBox>
        <h3 className="font-semibold text-white mt-3">Status Indicators</h3>
        <ul className="list-disc list-inside space-y-1 text-nfs-muted">
          <li>
            <span className="text-emerald-400">●</span> Green: Mount active and
            reachable
          </li>
          <li>
            <span className="text-red-400">●</span> Red: Mount not active or
            server unreachable
          </li>
          <li>Server icon shows NFS server reachability (ping)</li>
        </ul>
        <h3 className="font-semibold text-white mt-3">API Endpoints</h3>
        <CodeBlock>{`GET    /api/nfs/mounts          # List all mounts
POST   /api/nfs/mounts          # Create mount
PUT    /api/nfs/mounts/{id}     # Edit mount
DELETE /api/nfs/mounts/{id}     # Delete mount
POST   /api/nfs/mounts/{id}/mount    # Mount single
POST   /api/nfs/mounts/{id}/unmount  # Unmount single
GET    /api/nfs/status           # All statuses
POST   /api/nfs/mount-all        # Mount all
POST   /api/nfs/unmount-all      # Unmount all`}</CodeBlock>
      </Section>

      {/* MergerFS */}
      <Section
        icon={GitMerge}
        title="MergerFS / UnionFS"
        iconColor="bg-purple-500/10 text-purple-400"
      >
        <p>
          MergerFS combines multiple directories into a single virtual
          filesystem. Ideal for combining multiple NFS mounts under one path.
        </p>
        <h3 className="font-semibold text-white">Create Configuration</h3>
        <ol className="list-decimal list-inside space-y-1 text-nfs-muted">
          <li>Navigate to "MergerFS" in the sidebar</li>
          <li>Click "+ New Config"</li>
          <li>Enter Name, Mount Point, and Sources (colon-separated)</li>
          <li>Optional: Adjust MergerFS options</li>
        </ol>
        <h3 className="font-semibold text-white mt-3">Example</h3>
        <CodeBlock>{`Name: Media Union
Mount Point: /mnt/unionfs
Sources: /mnt/disk1,/mnt/disk2,/mnt/disk3`}</CodeBlock>
        <h3 className="font-semibold text-white mt-3">
          Default MergerFS Options
        </h3>
        <CodeBlock>
          {`rw,async_read=true,use_ino,allow_other,
func.getattr=newest,category.action=all,
category.create=ff,cache.files=auto-full,
cache.readdir=true,cache.statfs=3600,
cache.attr=120,cache.entry=120,
cache.negative_entry=60,dropcacheonclose=true,
minfreespace=10G,fsname=mergerfs`}
        </CodeBlock>
        <h3 className="font-semibold text-white mt-3">API Endpoints</h3>
        <CodeBlock>{`GET    /api/mergerfs/configs          # All configs
POST   /api/mergerfs/configs          # Create config
PUT    /api/mergerfs/configs/{id}     # Edit config
DELETE /api/mergerfs/configs/{id}     # Delete config
POST   /api/mergerfs/configs/{id}/mount    # Mount
POST   /api/mergerfs/configs/{id}/unmount  # Unmount
GET    /api/mergerfs/status           # All statuses`}</CodeBlock>
      </Section>

      {/* VPN */}
      <Section
        icon={Shield}
        title="VPN Tunnel (WireGuard & OpenVPN)"
        iconColor="bg-emerald-500/10 text-emerald-400"
      >
        <p>
          Manage VPN tunnels directly from the Web UI. Supports both WireGuard
          and OpenVPN configurations.
        </p>
        <h3 className="font-semibold text-white">WireGuard</h3>
        <p className="text-nfs-muted">
          WireGuard is a modern, fast VPN protocol. Enter your WireGuard
          configuration directly in the UI:
        </p>
        <CodeBlock>{`[Interface]
PrivateKey = YOUR_PRIVATE_KEY
Address = 10.0.0.2/24
DNS = 1.1.1.1

[Peer]
PublicKey = SERVER_PUBLIC_KEY
Endpoint = vpn.example.com:51820
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25`}</CodeBlock>
        <h3 className="font-semibold text-white mt-3">OpenVPN</h3>
        <p className="text-nfs-muted">
          OpenVPN configurations are managed as .conf files. Certificates and
          keys can be embedded inline in the config:
        </p>
        <CodeBlock>{`client
dev tun
proto udp
remote vpn.example.com 1194
resolv-retry infinite
nobind
persist-key
persist-tun

<ca>
-----BEGIN CERTIFICATE-----
...Insert certificate here...
-----END CERTIFICATE-----
</ca>

<cert>
-----BEGIN CERTIFICATE-----
...Insert client cert here...
-----END CERTIFICATE-----
</cert>

<key>
-----BEGIN PRIVATE KEY-----
...Insert client key here...
-----END PRIVATE KEY-----
</key>`}</CodeBlock>
        <h3 className="font-semibold text-white mt-3">Features</h3>
        <ul className="list-disc list-inside space-y-1 text-nfs-muted">
          <li>
            <strong>Auto-Connect:</strong> VPN connects automatically on
            container start
          </li>
          <li>
            <strong>Status Monitoring:</strong> Real-time status with peer info
            and transfer data
          </li>
          <li>
            <strong>Config Viewer:</strong> View and copy configuration in the
            UI
          </li>
          <li>
            <strong>Multi-Tunnel:</strong> Manage multiple VPN tunnels
            simultaneously
          </li>
        </ul>
        <h3 className="font-semibold text-white mt-3">
          Legacy WireGuard Config
        </h3>
        <p className="text-nfs-muted">
          Alternatively, a WireGuard config can be mounted directly as a file:
        </p>
        <CodeBlock>{`volumes:
  - /path/to/wg0.conf:/config/wg0.conf`}</CodeBlock>
        <InfoBox type="info">
          The file <Code>/config/wg0.conf</Code> is automatically loaded on
          container start, independent of the UI.
        </InfoBox>
        <h3 className="font-semibold text-white mt-3">API Endpoints</h3>
        <CodeBlock>{`GET    /api/vpn/configs              # All VPN configs
POST   /api/vpn/configs              # Create config
PUT    /api/vpn/configs/{id}         # Edit config
DELETE /api/vpn/configs/{id}         # Delete config
POST   /api/vpn/configs/{id}/connect     # Connect
POST   /api/vpn/configs/{id}/disconnect  # Disconnect
GET    /api/vpn/configs/{id}/status  # Single status
GET    /api/vpn/status               # All statuses`}</CodeBlock>
      </Section>

      {/* Notifications */}
      <Section
        icon={Bell}
        title="Notifications"
        iconColor="bg-amber-500/10 text-amber-400"
      >
        <p>
          Receive notifications about mount actions, errors, and status changes
          via Discord or Telegram.
        </p>
        <h3 className="font-semibold text-white">Discord</h3>
        <ol className="list-decimal list-inside space-y-1 text-nfs-muted">
          <li>Create a webhook in your Discord channel</li>
          <li>Go to Settings → Discord</li>
          <li>Paste the webhook URL and enable</li>
          <li>Verify with the "Test" button</li>
        </ol>
        <h3 className="font-semibold text-white mt-3">Telegram</h3>
        <ol className="list-decimal list-inside space-y-1 text-nfs-muted">
          <li>Create a bot via @BotFather</li>
          <li>Get the Chat ID (e.g. via @userinfobot)</li>
          <li>Enter Bot Token and Chat ID in the settings</li>
          <li>Optional: Topic ID for forum groups</li>
        </ol>
        <h3 className="font-semibold text-white mt-3">Notification Events</h3>
        <ul className="list-disc list-inside space-y-1 text-nfs-muted">
          <li>
            <span className="text-emerald-400">SUCCESS:</span> Mount/Unmount
            successful
          </li>
          <li>
            <span className="text-red-400">ERROR:</span> Mount failed
          </li>
          <li>
            <span className="text-blue-400">STARTUP:</span> Auto-mount on start
          </li>
          <li>
            <span className="text-amber-400">INFO:</span> General information
          </li>
        </ul>
      </Section>

      {/* Kernel Tuning */}
      <Section
        icon={Cpu}
        title="Kernel Tuning"
        iconColor="bg-amber-500/10 text-amber-400"
      >
        <p>
          On container start, kernel parameters are automatically set for
          optimal NFS streaming (300+ simultaneous streams):
        </p>
        <h3 className="font-semibold text-white">NFS/SUNRPC</h3>
        <CodeBlock>
          {`sunrpc.tcp_max_slot_table_entries=128  # RPC Slots (default 65)`}
        </CodeBlock>
        <h3 className="font-semibold text-white mt-3">Network Buffers</h3>
        <CodeBlock>
          {`net.core.rmem_max=16777216        # 16MB max Receive Buffer
net.core.wmem_max=16777216        # 16MB max Send Buffer
net.core.rmem_default=1048576     # 1MB default Receive
net.core.wmem_default=1048576     # 1MB default Send
net.ipv4.tcp_rmem=4096 1048576 16777216
net.ipv4.tcp_wmem=4096 1048576 16777216`}
        </CodeBlock>
        <h3 className="font-semibold text-white mt-3">TCP Optimizations</h3>
        <CodeBlock>
          {`net.ipv4.tcp_window_scaling=1      # TCP Window Scaling
net.ipv4.tcp_timestamps=1         # TCP Timestamps
net.ipv4.tcp_sack=1               # Selective ACKs
net.ipv4.tcp_no_metrics_save=1    # No Route Metrics Cache
net.ipv4.tcp_moderate_rcvbuf=1    # Auto-Tune Receive Buffer`}
        </CodeBlock>
        <h3 className="font-semibold text-white mt-3">VM/Page Cache</h3>
        <CodeBlock>
          {`vm.dirty_ratio=40                 # Dirty Page Ratio
vm.dirty_background_ratio=10      # Background Writeback
vm.vfs_cache_pressure=50          # VFS Cache Pressure`}
        </CodeBlock>
        <InfoBox type="info">
          Prerequisite: Container must run with <Code>privileged: true</Code> or{" "}
          <Code>SYS_ADMIN</Code> capability.
        </InfoBox>
      </Section>

      {/* System API */}
      <Section
        icon={Terminal}
        title="System API"
        iconColor="bg-nfs-primary/10 text-nfs-primary"
      >
        <p>
          The System API allows retrieving system data and performing actions:
        </p>
        <CodeBlock>{`GET  /api/system/health        # Healthcheck (no auth)
GET  /api/system/status        # System Status
GET  /api/system/stats         # CPU, Memory, Disk, Network
GET  /api/system/vpn           # WireGuard Status (Legacy)
GET  /api/system/kernel-params # Kernel Parameters
POST /api/system/kernel-tuning # Apply kernel parameters
GET  /api/system/logs          # Log entries`}</CodeBlock>
        <h3 className="font-semibold text-white mt-3">Auth API</h3>
        <CodeBlock>{`POST /api/auth/login            # Login (JWT Token)
GET  /api/auth/me               # Own profile
PUT  /api/auth/me               # Edit profile
POST /api/auth/change-password  # Change password
GET  /api/auth/users            # All users (Admin)
POST /api/auth/users            # Create user (Admin)
PUT  /api/auth/users/{id}       # Edit user (Admin)
DELETE /api/auth/users/{id}     # Delete user (Admin)`}</CodeBlock>
      </Section>

      {/* Docker Configuration */}
      <Section
        icon={Layers}
        title="Docker Configuration"
        iconColor="bg-blue-500/10 text-blue-400"
      >
        <h3 className="font-semibold text-white">Environment Variables</h3>
        <div className="space-y-2">
          {[
            ["PUID / PGID", "User/Group ID (default: 1000)"],
            ["TZ", "Timezone (e.g. Europe/Berlin)"],
            ["JWT_SECRET", "Secret key for JWT tokens"],
            ["JWT_EXPIRE_HOURS", "Token validity in hours (default: 24)"],
            ["DEFAULT_ADMIN_USER", "Default admin username"],
            ["DEFAULT_ADMIN_PASS", "Default admin password"],
            ["API_KEY", "Optional API key for external access"],
            ["DATABASE_URL", "SQLite database path"],
            ["DISCORD_WEBHOOK", "Discord webhook URL (fallback)"],
            ["TELEGRAM_TOKEN", "Telegram bot token (fallback)"],
            ["TELEGRAM_CHAT_ID", "Telegram chat ID (fallback)"],
            ["TELEGRAM_TOPIC_ID", "Telegram topic ID (fallback)"],
          ].map(([key, desc]) => (
            <div
              key={key}
              className="flex items-start gap-3 bg-nfs-input/50 rounded-lg px-4 py-2.5"
            >
              <Code>{key}</Code>
              <span className="text-xs text-nfs-muted">{desc}</span>
            </div>
          ))}
        </div>
        <h3 className="font-semibold text-white mt-4">Volumes</h3>
        <div className="space-y-2">
          {[
            ["/data", "Database and persistent data"],
            ["/mnt:rshared", "Mount directory (rshared for mount propagation)"],
            ["/config/wg0.conf", "Optional: WireGuard config file (legacy)"],
          ].map(([path, desc]) => (
            <div
              key={path}
              className="flex items-start gap-3 bg-nfs-input/50 rounded-lg px-4 py-2.5"
            >
              <Code>{path}</Code>
              <span className="text-xs text-nfs-muted">{desc}</span>
            </div>
          ))}
        </div>
        <h3 className="font-semibold text-white mt-4">Required Capabilities</h3>
        <CodeBlock>{`privileged: true        # or alternatively:
cap_add:
  - SYS_ADMIN          # For mount/umount operations
  - NET_ADMIN           # For VPN (WireGuard/OpenVPN)
devices:
  - /dev/fuse           # For MergerFS (FUSE)`}</CodeBlock>
      </Section>

      {/* Troubleshooting */}
      <Section
        icon={Settings}
        title="Troubleshooting"
        iconColor="bg-red-500/10 text-red-400"
      >
        <h3 className="font-semibold text-white">NFS Mount Fails</h3>
        <ul className="list-disc list-inside space-y-1 text-nfs-muted">
          <li>Check if the NFS server is reachable (ping indicator in UI)</li>
          <li>
            Check the NFS export on the server:{" "}
            <Code>showmount -e SERVER_IP</Code>
          </li>
          <li>
            Check if the container has <Code>SYS_ADMIN</Code> capability
          </li>
          <li>Check the logs under System → Logs</li>
        </ul>
        <h3 className="font-semibold text-white mt-3">MergerFS Won't Start</h3>
        <ul className="list-disc list-inside space-y-1 text-nfs-muted">
          <li>
            Check if <Code>/dev/fuse</Code> is mounted as a device
          </li>
          <li>Check if all source paths exist</li>
          <li>
            Check <Code>user_allow_other</Code> in /etc/fuse.conf
          </li>
        </ul>
        <h3 className="font-semibold text-white mt-3">VPN Won't Connect</h3>
        <ul className="list-disc list-inside space-y-1 text-nfs-muted">
          <li>
            Check if <Code>NET_ADMIN</Code> capability is set
          </li>
          <li>WireGuard: Check PrivateKey and PublicKey</li>
          <li>OpenVPN: Check if certificates are correctly embedded</li>
          <li>Check firewall rules on the host</li>
        </ul>
        <h3 className="font-semibold text-white mt-3">Login Not Working</h3>
        <ul className="list-disc list-inside space-y-1 text-nfs-muted">
          <li>
            Default login: <Code>admin</Code> / <Code>admin</Code>
          </li>
          <li>
            If changed: Check <Code>DEFAULT_ADMIN_USER</Code> and{" "}
            <Code>DEFAULT_ADMIN_PASS</Code>
          </li>
          <li>
            Reset database: Delete <Code>/data/nfs-manager.db</Code>
            and restart the container
          </li>
        </ul>
      </Section>
    </div>
  );
}
