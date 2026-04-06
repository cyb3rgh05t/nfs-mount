import { useState } from "react";
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

function InfoBox({ type = "info", children }) {
  const styles = {
    info: "bg-blue-500/10 border-blue-500/30 text-blue-400",
    warning: "bg-amber-500/10 border-amber-500/30 text-amber-400",
    success: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
  };
  return (
    <div className={`p-3 rounded-lg border text-sm ${styles[type]}`}>
      {children}
    </div>
  );
}

export default function DocsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-white flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-nfs-primary/10">
          <BookOpen className="w-5 h-5 text-nfs-primary" />
        </div>
        Dokumentation
      </h1>

      <p className="text-nfs-muted mb-6 leading-relaxed">
        Komplette Anleitung zum NFS-MergerFS Manager. Verwalte NFS Mounts,
        MergerFS Unions, VPN Tunnel und Systemeinstellungen über das Web-UI.
      </p>

      {/* Quick Start */}
      <Section
        icon={Globe}
        title="Schnellstart"
        iconColor="bg-nfs-primary/10 text-nfs-primary"
        defaultOpen={true}
      >
        <h3 className="font-semibold text-white">Docker Compose</h3>
        <p>
          Der einfachste Weg die Anwendung zu starten ist über Docker Compose:
        </p>
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
      - JWT_SECRET=dein-geheimer-schluessel
      - DEFAULT_ADMIN_USER=admin
      - DEFAULT_ADMIN_PASS=admin
    volumes:
      - /opt/appdata/nfs-mount/data:/data
      - /mnt:/mnt:rshared
    ports:
      - 8080:8080
    restart: unless-stopped`}</CodeBlock>
        <InfoBox type="warning">
          Ändere unbedingt <Code>JWT_SECRET</Code>,{" "}
          <Code>DEFAULT_ADMIN_USER</Code> und <Code>DEFAULT_ADMIN_PASS</Code>{" "}
          auf sichere Werte!
        </InfoBox>
        <h3 className="font-semibold text-white mt-4">Erster Login</h3>
        <p>
          Nach dem Start erreichst du das UI unter <Code>http://IP:8080</Code>.
          Logge dich mit den Standard-Zugangsdaten ein (default:{" "}
          <Code>admin</Code> / <Code>admin</Code>). Ändere sofort das Passwort
          unter Einstellungen.
        </p>
      </Section>

      {/* Auth System */}
      <Section
        icon={Lock}
        title="Authentifizierung"
        iconColor="bg-red-500/10 text-red-400"
      >
        <p>
          Das System nutzt JWT-Token basierte Authentifizierung. Nach dem Login
          erhältst du einen Token, der automatisch bei jedem API-Request
          mitgesendet wird.
        </p>
        <h3 className="font-semibold text-white">Benutzerverwaltung</h3>
        <ul className="list-disc list-inside space-y-1 text-nfs-muted">
          <li>Admins können neue Benutzer erstellen, bearbeiten und löschen</li>
          <li>Benutzer können ihr eigenes Profil und Passwort ändern</li>
          <li>Deaktivierte Benutzer können sich nicht anmelden</li>
        </ul>
        <h3 className="font-semibold text-white mt-3">API Key (Legacy)</h3>
        <p className="text-nfs-muted">
          Zusätzlich zur JWT-Auth kann ein API Key über die Umgebungsvariable{" "}
          <Code>API_KEY</Code> gesetzt werden. Dieser wird im Header{" "}
          <Code>X-API-Key</Code> mitgesendet und ist primär für externe
          API-Zugriffe gedacht.
        </p>
        <h3 className="font-semibold text-white mt-3">Umgebungsvariablen</h3>
        <CodeBlock>{`JWT_SECRET=mein-geheimer-schluessel  # JWT Token Secret
JWT_EXPIRE_HOURS=24                  # Token Gültigkeit in Stunden
DEFAULT_ADMIN_USER=admin             # Standard Admin Username
DEFAULT_ADMIN_PASS=admin             # Standard Admin Passwort
API_KEY=optional-api-key             # Optionaler API Key`}</CodeBlock>
      </Section>

      {/* NFS Mounts */}
      <Section
        icon={HardDrive}
        title="NFS Mounts"
        iconColor="bg-nfs-primary/10 text-nfs-primary"
      >
        <p>
          Verwalte NFS Network File System Mounts. Optimiert für
          Hochdurchsatz-Streaming mit 300+ gleichzeitigen Streams.
        </p>
        <h3 className="font-semibold text-white">Mount erstellen</h3>
        <ol className="list-decimal list-inside space-y-1 text-nfs-muted">
          <li>Navigiere zu „NFS Mounts" in der Sidebar</li>
          <li>Klicke auf „+ Neuer Mount"</li>
          <li>
            Fülle die Felder aus: Name, Server IP, Remote Path, Local Path
          </li>
          <li>Optional: NFS Version, Mount Options, Check File anpassen</li>
          <li>Speichern und per Play-Button mounten</li>
        </ol>
        <h3 className="font-semibold text-white mt-3">Felder</h3>
        <div className="space-y-2">
          <div className="flex gap-3">
            <Code>Name</Code>
            <span className="text-nfs-muted">Anzeigename des Mounts</span>
          </div>
          <div className="flex gap-3">
            <Code>Server IP</Code>
            <span className="text-nfs-muted">IP-Adresse des NFS Servers</span>
          </div>
          <div className="flex gap-3">
            <Code>Remote Path</Code>
            <span className="text-nfs-muted">
              Pfad auf dem Server (z.B. /export/media)
            </span>
          </div>
          <div className="flex gap-3">
            <Code>Local Path</Code>
            <span className="text-nfs-muted">
              Lokaler Mountpoint (z.B. /mnt/media)
            </span>
          </div>
          <div className="flex gap-3">
            <Code>Check File</Code>
            <span className="text-nfs-muted">
              Optional: Datei zur Validierung (z.B. /mnt/media/.mounted)
            </span>
          </div>
        </div>
        <h3 className="font-semibold text-white mt-3">Standard NFS Optionen</h3>
        <CodeBlock>
          {`vers=4.2,proto=tcp,hard,nconnect=16,
rsize=1048576,wsize=1048576,
async,noatime,nocto,ac,actimeo=3600`}
        </CodeBlock>
        <InfoBox type="info">
          <Code>nconnect=16</Code> erstellt 16 parallele TCP-Verbindungen pro
          Mount für maximalen Durchsatz. <Code>rsize</Code>/<Code>wsize</Code>{" "}
          von 1MB optimiert große sequentielle Reads.
        </InfoBox>
        <h3 className="font-semibold text-white mt-3">Status-Indikatoren</h3>
        <ul className="list-disc list-inside space-y-1 text-nfs-muted">
          <li>
            <span className="text-emerald-400">●</span> Grün: Mount aktiv und
            erreichbar
          </li>
          <li>
            <span className="text-red-400">●</span> Rot: Mount nicht aktiv oder
            Server nicht erreichbar
          </li>
          <li>Server-Icon zeigt die Erreichbarkeit des NFS Servers (Ping)</li>
        </ul>
        <h3 className="font-semibold text-white mt-3">API Endpoints</h3>
        <CodeBlock>{`GET    /api/nfs/mounts          # Alle Mounts auflisten
POST   /api/nfs/mounts          # Mount erstellen
PUT    /api/nfs/mounts/{id}     # Mount bearbeiten
DELETE /api/nfs/mounts/{id}     # Mount löschen
POST   /api/nfs/mounts/{id}/mount    # Einzeln mounten
POST   /api/nfs/mounts/{id}/unmount  # Einzeln unmounten
GET    /api/nfs/status           # Alle Status
POST   /api/nfs/mount-all        # Alle mounten
POST   /api/nfs/unmount-all      # Alle unmounten`}</CodeBlock>
      </Section>

      {/* MergerFS */}
      <Section
        icon={GitMerge}
        title="MergerFS / UnionFS"
        iconColor="bg-purple-500/10 text-purple-400"
      >
        <p>
          MergerFS vereint mehrere Verzeichnisse zu einem einzigen virtuellen
          Dateisystem. Ideal um mehrere NFS Mounts unter einem Pfad zu
          kombinieren.
        </p>
        <h3 className="font-semibold text-white">Konfiguration erstellen</h3>
        <ol className="list-decimal list-inside space-y-1 text-nfs-muted">
          <li>Navigiere zu „MergerFS" in der Sidebar</li>
          <li>Klicke auf „+ Neue Config"</li>
          <li>Name, Mount Point, und Sources (kommagetrennt) eingeben</li>
          <li>Optional: MergerFS Optionen anpassen</li>
        </ol>
        <h3 className="font-semibold text-white mt-3">Beispiel</h3>
        <CodeBlock>{`Name: Media Union
Mount Point: /mnt/unionfs
Sources: /mnt/disk1,/mnt/disk2,/mnt/disk3`}</CodeBlock>
        <h3 className="font-semibold text-white mt-3">
          Standard MergerFS Optionen
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
        <CodeBlock>{`GET    /api/mergerfs/configs          # Alle Configs
POST   /api/mergerfs/configs          # Config erstellen
PUT    /api/mergerfs/configs/{id}     # Config bearbeiten
DELETE /api/mergerfs/configs/{id}     # Config löschen
POST   /api/mergerfs/configs/{id}/mount    # Mounten
POST   /api/mergerfs/configs/{id}/unmount  # Unmounten
GET    /api/mergerfs/status           # Alle Status`}</CodeBlock>
      </Section>

      {/* VPN */}
      <Section
        icon={Shield}
        title="VPN Tunnel (WireGuard & OpenVPN)"
        iconColor="bg-emerald-500/10 text-emerald-400"
      >
        <p>
          Verwalte VPN Tunnel direkt aus dem Web-UI. Unterstützt sowohl
          WireGuard als auch OpenVPN Konfigurationen.
        </p>
        <h3 className="font-semibold text-white">WireGuard</h3>
        <p className="text-nfs-muted">
          WireGuard ist ein modernes, schnelles VPN-Protokoll. Füge deine
          WireGuard-Konfiguration direkt im UI ein:
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
          OpenVPN Konfigurationen werden als .conf Datei verwaltet. Zertifikate
          und Keys können inline in die Config eingefügt werden:
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
...Zertifikat hier einfügen...
-----END CERTIFICATE-----
</ca>

<cert>
-----BEGIN CERTIFICATE-----
...Client Cert hier einfügen...
-----END CERTIFICATE-----
</cert>

<key>
-----BEGIN PRIVATE KEY-----
...Client Key hier einfügen...
-----END PRIVATE KEY-----
</key>`}</CodeBlock>
        <h3 className="font-semibold text-white mt-3">Funktionen</h3>
        <ul className="list-disc list-inside space-y-1 text-nfs-muted">
          <li>
            <strong>Auto-Connect:</strong> VPN verbindet sich automatisch beim
            Container-Start
          </li>
          <li>
            <strong>Status-Überwachung:</strong> Echtzeit-Status mit Peer-Info
            und Transfer-Daten
          </li>
          <li>
            <strong>Config Viewer:</strong> Konfiguration im UI anzeigen und
            kopieren
          </li>
          <li>
            <strong>Multi-Tunnel:</strong> Mehrere VPN Tunnel gleichzeitig
            verwalten
          </li>
        </ul>
        <h3 className="font-semibold text-white mt-3">
          Legacy WireGuard Config
        </h3>
        <p className="text-nfs-muted">
          Alternativ kann eine WireGuard Config direkt als Datei gemountet
          werden:
        </p>
        <CodeBlock>{`volumes:
  - /path/to/wg0.conf:/config/wg0.conf`}</CodeBlock>
        <InfoBox type="info">
          Die Datei <Code>/config/wg0.conf</Code> wird beim Container-Start
          automatisch geladen, unabhängig vom UI.
        </InfoBox>
        <h3 className="font-semibold text-white mt-3">API Endpoints</h3>
        <CodeBlock>{`GET    /api/vpn/configs              # Alle VPN Configs
POST   /api/vpn/configs              # Config erstellen
PUT    /api/vpn/configs/{id}         # Config bearbeiten
DELETE /api/vpn/configs/{id}         # Config löschen
POST   /api/vpn/configs/{id}/connect     # Verbinden
POST   /api/vpn/configs/{id}/disconnect  # Trennen
GET    /api/vpn/configs/{id}/status  # Einzel-Status
GET    /api/vpn/status               # Alle Status`}</CodeBlock>
      </Section>

      {/* Notifications */}
      <Section
        icon={Bell}
        title="Benachrichtigungen"
        iconColor="bg-amber-500/10 text-amber-400"
      >
        <p>
          Erhalte Benachrichtigungen über Mount-Aktionen, Fehler und
          Statusänderungen über Discord oder Telegram.
        </p>
        <h3 className="font-semibold text-white">Discord</h3>
        <ol className="list-decimal list-inside space-y-1 text-nfs-muted">
          <li>Erstelle einen Webhook in deinem Discord-Kanal</li>
          <li>Gehe zu Einstellungen → Discord</li>
          <li>Webhook URL einfügen und aktivieren</li>
          <li>Mit „Test" Button verifizieren</li>
        </ol>
        <h3 className="font-semibold text-white mt-3">Telegram</h3>
        <ol className="list-decimal list-inside space-y-1 text-nfs-muted">
          <li>Erstelle einen Bot über @BotFather</li>
          <li>Hole die Chat ID (z.B. über @userinfobot)</li>
          <li>Bot Token und Chat ID in den Einstellungen eintragen</li>
          <li>Optional: Topic ID für Forum-Gruppen</li>
        </ol>
        <h3 className="font-semibold text-white mt-3">
          Benachrichtigungs-Events
        </h3>
        <ul className="list-disc list-inside space-y-1 text-nfs-muted">
          <li>
            <span className="text-emerald-400">SUCCESS:</span> Mount/Unmount
            erfolgreich
          </li>
          <li>
            <span className="text-red-400">ERROR:</span> Mount fehlgeschlagen
          </li>
          <li>
            <span className="text-blue-400">STARTUP:</span> Auto-mount beim
            Start
          </li>
          <li>
            <span className="text-amber-400">INFO:</span> Allgemeine
            Informationen
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
          Beim Container-Start werden automatisch Kernel-Parameter für optimales
          NFS Streaming gesetzt (300+ gleichzeitige Streams):
        </p>
        <h3 className="font-semibold text-white">NFS/SUNRPC</h3>
        <CodeBlock>
          {`sunrpc.tcp_max_slot_table_entries=128  # RPC Slots (default 65)`}
        </CodeBlock>
        <h3 className="font-semibold text-white mt-3">Netzwerk Buffer</h3>
        <CodeBlock>
          {`net.core.rmem_max=16777216        # 16MB max Receive Buffer
net.core.wmem_max=16777216        # 16MB max Send Buffer
net.core.rmem_default=1048576     # 1MB default Receive
net.core.wmem_default=1048576     # 1MB default Send
net.ipv4.tcp_rmem=4096 1048576 16777216
net.ipv4.tcp_wmem=4096 1048576 16777216`}
        </CodeBlock>
        <h3 className="font-semibold text-white mt-3">TCP Optimierungen</h3>
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
          Voraussetzung: Container muss mit <Code>privileged: true</Code> oder{" "}
          <Code>SYS_ADMIN</Code> Capability laufen.
        </InfoBox>
      </Section>

      {/* System API */}
      <Section
        icon={Terminal}
        title="System API"
        iconColor="bg-nfs-primary/10 text-nfs-primary"
      >
        <p>
          Über die System-API können Systemdaten abgerufen und Aktionen
          ausgeführt werden:
        </p>
        <CodeBlock>{`GET  /api/system/health        # Healthcheck (kein Auth)
GET  /api/system/status        # System Status
GET  /api/system/stats         # CPU, Memory, Disk, Network
GET  /api/system/vpn           # WireGuard Status (Legacy)
GET  /api/system/kernel-params # Kernel Parameter
POST /api/system/kernel-tuning # Kernel Parameter anwenden
GET  /api/system/logs          # Log Einträge`}</CodeBlock>
        <h3 className="font-semibold text-white mt-3">Auth API</h3>
        <CodeBlock>{`POST /api/auth/login            # Login (JWT Token)
GET  /api/auth/me               # Eigenes Profil
PUT  /api/auth/me               # Profil bearbeiten
POST /api/auth/change-password  # Passwort ändern
GET  /api/auth/users            # Alle Benutzer (Admin)
POST /api/auth/users            # Benutzer erstellen (Admin)
PUT  /api/auth/users/{id}       # Benutzer bearbeiten (Admin)
DELETE /api/auth/users/{id}     # Benutzer löschen (Admin)`}</CodeBlock>
      </Section>

      {/* Docker Configuration */}
      <Section
        icon={Layers}
        title="Docker Konfiguration"
        iconColor="bg-blue-500/10 text-blue-400"
      >
        <h3 className="font-semibold text-white">Umgebungsvariablen</h3>
        <div className="space-y-2">
          {[
            ["PUID / PGID", "User/Group ID (default: 1000)"],
            ["TZ", "Zeitzone (z.B. Europe/Berlin)"],
            ["JWT_SECRET", "Geheimer Schlüssel für JWT Tokens"],
            ["JWT_EXPIRE_HOURS", "Token Gültigkeit in Stunden (default: 24)"],
            ["DEFAULT_ADMIN_USER", "Standard Admin Benutzername"],
            ["DEFAULT_ADMIN_PASS", "Standard Admin Passwort"],
            ["API_KEY", "Optionaler API Key für externe Zugriffe"],
            ["DATABASE_URL", "SQLite Datenbank Pfad"],
            ["DISCORD_WEBHOOK", "Discord Webhook URL (Fallback)"],
            ["TELEGRAM_TOKEN", "Telegram Bot Token (Fallback)"],
            ["TELEGRAM_CHAT_ID", "Telegram Chat ID (Fallback)"],
            ["TELEGRAM_TOPIC_ID", "Telegram Topic ID (Fallback)"],
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
            ["/data", "Datenbank und persistente Daten"],
            [
              "/mnt:rshared",
              "Mount Verzeichnis (rshared für Mount Propagation)",
            ],
            ["/config/wg0.conf", "Optional: WireGuard Config Datei (Legacy)"],
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
        <h3 className="font-semibold text-white mt-4">
          Benötigte Capabilities
        </h3>
        <CodeBlock>{`privileged: true        # oder alternativ:
cap_add:
  - SYS_ADMIN          # Für mount/umount Operationen
  - NET_ADMIN           # Für VPN (WireGuard/OpenVPN)
devices:
  - /dev/fuse           # Für MergerFS (FUSE)`}</CodeBlock>
      </Section>

      {/* Troubleshooting */}
      <Section
        icon={Settings}
        title="Fehlerbehebung"
        iconColor="bg-red-500/10 text-red-400"
      >
        <h3 className="font-semibold text-white">NFS Mount schlägt fehl</h3>
        <ul className="list-disc list-inside space-y-1 text-nfs-muted">
          <li>Prüfe ob der NFS Server erreichbar ist (Ping-Indikator im UI)</li>
          <li>
            Prüfe den NFS Export auf dem Server:{" "}
            <Code>showmount -e SERVER_IP</Code>
          </li>
          <li>
            Prüfe ob der Container <Code>SYS_ADMIN</Code> Capability hat
          </li>
          <li>Prüfe die Logs unter System → Logs</li>
        </ul>
        <h3 className="font-semibold text-white mt-3">
          MergerFS startet nicht
        </h3>
        <ul className="list-disc list-inside space-y-1 text-nfs-muted">
          <li>
            Prüfe ob <Code>/dev/fuse</Code> als Device gemountet ist
          </li>
          <li>Prüfe ob alle Source-Pfade existieren</li>
          <li>
            Prüfe <Code>user_allow_other</Code> in /etc/fuse.conf
          </li>
        </ul>
        <h3 className="font-semibold text-white mt-3">VPN verbindet nicht</h3>
        <ul className="list-disc list-inside space-y-1 text-nfs-muted">
          <li>
            Prüfe ob <Code>NET_ADMIN</Code> Capability gesetzt ist
          </li>
          <li>WireGuard: Prüfe PrivateKey und PublicKey</li>
          <li>OpenVPN: Prüfe ob Zertifikate korrekt eingebettet sind</li>
          <li>Prüfe Firewall-Regeln auf dem Host</li>
        </ul>
        <h3 className="font-semibold text-white mt-3">
          Login funktioniert nicht
        </h3>
        <ul className="list-disc list-inside space-y-1 text-nfs-muted">
          <li>
            Standard-Login: <Code>admin</Code> / <Code>admin</Code>
          </li>
          <li>
            Falls geändert: <Code>DEFAULT_ADMIN_USER</Code> und{" "}
            <Code>DEFAULT_ADMIN_PASS</Code> prüfen
          </li>
          <li>
            Datenbank zurücksetzen: <Code>/data/nfs-manager.db</Code> löschen
            und Container neustarten
          </li>
        </ul>
      </Section>
    </div>
  );
}
