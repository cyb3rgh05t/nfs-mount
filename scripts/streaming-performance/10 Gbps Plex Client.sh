#!/usr/bin/env bash
set -euo pipefail

echo "==================================================================================="
echo "   [STREAMING] 10Gbps Plex Client High-Performance Tuning & Hardening              "
echo "==================================================================================="

# 1. Sysctl Konfiguration für 10 Gbps Netzwerk & VFS Caching
echo "[1/4] Schreibe /etc/sysctl.d/99-plex-10g.conf..."
cat <<'EOF' > /etc/sysctl.d/99-plex-10g.conf
# --- File Descriptors & Limits ---
fs.file-max = 2097152
fs.nr_open = 2097152
vm.max_map_count = 262144

# --- Memory & Dirty Pages ---
# Verhindert Ruckler durch Transcoder-Spikes und Temp-Dateien
vm.dirty_background_ratio = 5
vm.dirty_ratio = 10
vm.swappiness = 10
# Hält Plex Metadaten und Library-Indexe bevorzugt im RAM
vm.vfs_cache_pressure = 50

# --- Network Core Tuning für 10 Gbps ---
net.core.default_qdisc = fq
net.core.somaxconn = 65535
net.core.netdev_max_backlog = 65535
net.core.netdev_budget = 600
net.core.netdev_budget_usecs = 8000
net.core.optmem_max = 262144

# Socket-Puffer: 128MB Max (optimal für 10 Gbps BDP)
net.core.rmem_default = 262144
net.core.wmem_default = 262144
net.core.rmem_max = 134217728
net.core.wmem_max = 134217728

# --- TCP Optimierungen & BBR ---
net.ipv4.tcp_congestion_control = bbr
net.ipv4.tcp_rmem = 4096 87380 134217728
net.ipv4.tcp_wmem = 4096 65536 134217728
net.ipv4.tcp_window_scaling = 1
net.ipv4.tcp_timestamps = 1
net.ipv4.tcp_sack = 1
net.ipv4.tcp_slow_start_after_idle = 0
net.ipv4.tcp_mtu_probing = 1
net.ipv4.tcp_no_metrics_save = 1
net.ipv4.tcp_fin_timeout = 15
net.ipv4.tcp_keepalive_time = 300
net.ipv4.ip_local_port_range = 1024 65000

# UDP Buffer (Wichtig für Plex GDM / Discovery)
net.ipv4.udp_rmem_min = 16384
net.ipv4.udp_wmem_min = 16384

# ARP Cache (Schutz bei hunderten gleichzeitigen Client-IPs)
net.ipv4.neigh.default.gc_thresh1 = 1024
net.ipv4.neigh.default.gc_thresh2 = 4096
net.ipv4.neigh.default.gc_thresh3 = 8192

# --- SunRPC (Falls dieser Client via NFS Daten bezieht) ---
sunrpc.tcp_slot_table_entries = 128
sunrpc.tcp_max_slot_table_entries = 128
sunrpc.udp_slot_table_entries = 128
EOF

sysctl -p /etc/sysctl.d/99-plex-10g.conf > /dev/null
echo "  └─ Sysctl geladen ✓"

# 2. Hardware-Ring-Buffer der primären 10G-NIC erkennen und maximieren
echo "[2/4] Optimiere Hardware Ring-Buffer auf Maximum (bis 4096)..."
PRIMARY_IFACE=$(ip -o route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="dev") print $(i+1)}')

if [ -n "$PRIMARY_IFACE" ] && command -v ethtool >/dev/null 2>&1; then
    MAX_RX=$(ethtool -g "$PRIMARY_IFACE" 2>/dev/null | awk '/Pre-set maximums:/,/Current hardware settings:/' | awk '/^RX:/ {print $2; exit}' || echo "")
    MAX_TX=$(ethtool -g "$PRIMARY_IFACE" 2>/dev/null | awk '/Pre-set maximums:/,/Current hardware settings:/' | awk '/^TX:/ {print $2; exit}' || echo "")

    if [ -n "$MAX_RX" ] && [ "$MAX_RX" -gt 0 ]; then
        echo "  └─ Interface $PRIMARY_IFACE unterstützt RX: $MAX_RX, TX: $MAX_TX"
        ethtool -G "$PRIMARY_IFACE" rx "$MAX_RX" tx "$MAX_TX" 2>/dev/null || true

        # Persistent via systemd Service einrichten
        cat <<EOF > /etc/systemd/system/plex-10g-nic-ring.service
[Unit]
Description=Set 10G NIC Ring Buffer to Hardware Max
After=network.target

[Service]
Type=oneshot
ExecStart=/sbin/ethtool -G $PRIMARY_IFACE rx $MAX_RX tx $MAX_TX
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF
        systemctl daemon-reload
        systemctl enable plex-10g-nic-ring.service >/dev/null 2>&1 || true
        echo "  └─ Ring-Buffer dauerhaft persistiert ✓"
    else
        echo "  └─ Interface unterstützt kein dynamisches Ring-Buffer Tuning (virtuell oder Container)."
    fi
else
    echo "  └─ Kein Standard-Interface gefunden oder ethtool nicht installiert."
fi

# 3. Transcoder-Pfade / Temp-Verzeichnis Check
echo "[3/4] Prüfe Plex-Transcode Temp-Speicher..."
if [ -d "/dev/shm" ]; then
    echo "  └─ Empfehlung: Setze in Plex 'Transcoder temporary directory' auf '/dev/shm', um Disk-I/O komplett zu eliminieren."
fi

# 4. NFS-Mount Remount (falls Storage gemountet ist)
echo "[4/4] Prüfe vorhandene NFS-Mounts..."
for mnt in $(awk '$3 ~ /^nfs/ {print $2}' /proc/mounts); do
    echo "  └─ Optimiere Mountpoint $mnt mit nocto, actimeo=3600..."
    mount -o remount,nocto,actimeo=3600 "$mnt" 2>/dev/null || true
done

echo "=================================================================================="
echo "   10Gbps Plex Client  High-Performance Tuning & Hardening abgeschlossen!         "
echo "=================================================================================="