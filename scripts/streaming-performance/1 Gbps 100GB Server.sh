#!/usr/bin/env bash
set -euo pipefail

echo "=========================================================="
echo " [STORAGE] ZFS (100GB RAM ARC) & 1 Gbps NFS Server Tuning  "
echo "=========================================================="

# 1. ZFS Modul-Parameter (100GB ARC, 64 Streams Prefetching)
echo "[1/4] Konfiguriere ZFS ARC und Prefetcher..."
cat <<'EOF' > /etc/modprobe.d/zfs.conf
options zfs zfs_arc_max=107374182400
options zfs zfs_arc_min=53687091200
options zfs zfetch_max_streams=64
options zfs zfs_dirty_data_max=4294967296
options zfs zfs_txg_timeout=5
EOF

# Live anwenden
echo 107374182400 > /sys/module/zfs/parameters/zfs_arc_max 2>/dev/null || true
echo 53687091200 > /sys/module/zfs/parameters/zfs_arc_min 2>/dev/null || true
echo 64 > /sys/module/zfs/parameters/zfetch_max_streams 2>/dev/null || true

# 2. NFS Worker Threads (256 Threads für 1G ideal)
echo "[2/4] Konfiguriere NFS-Server Threads (256 Worker)..."
echo 256 > /proc/fs/nfsd/threads 2>/dev/null || true

mkdir -p /etc
if [ -f /etc/nfs.conf ]; then
    if grep -q "\[nfsd\]" /etc/nfs.conf; then
        sed -i '/\[nfsd\]/a threads=256' /etc/nfs.conf
    else
        echo -e "\n[nfsd]\nthreads=256" >> /etc/nfs.conf
    fi
else
    echo -e "[nfsd]\nthreads=256" > /etc/nfs.conf
fi

if [ -f /etc/default/nfs-kernel-server ]; then
    sed -i 's/^RPCNFSDCOUNT=.*/RPCNFSDCOUNT=256/' /etc/default/nfs-kernel-server || echo "RPCNFSDCOUNT=256" >> /etc/default/nfs-kernel-server
fi

# 3. Sysctl Konfiguration (Speziell auf 1 Gbps ausgelegt: 32MB Puffer)
echo "[3/4] Wende Sysctl-Parameter für 1G an..."
cat <<'EOF' > /etc/sysctl.d/99-storage-1g.conf
fs.file-max = 2097152
fs.nr_open = 2097152
vm.max_map_count = 262144

# RAM/Cache ZFS-optimiert
vm.vfs_cache_pressure = 50
vm.swappiness = 10
vm.dirty_background_ratio = 5
vm.dirty_ratio = 15

# SunRPC Slots
sunrpc.tcp_slot_table_entries = 128
sunrpc.tcp_max_slot_table_entries = 128
sunrpc.udp_slot_table_entries = 128

# 1 Gbps Netzwerk Core
net.core.default_qdisc = fq
net.core.somaxconn = 16384
net.core.netdev_max_backlog = 16384
net.core.netdev_budget = 300
net.core.netdev_budget_usecs = 4000
net.core.optmem_max = 65536

# Socket Puffer: 32MB Max (ausreichend für volle 1 Gbps Sättigung)
net.core.rmem_default = 262144
net.core.wmem_default = 262144
net.core.rmem_max = 33554432
net.core.wmem_max = 33554432

# TCP & BBR
net.ipv4.tcp_congestion_control = bbr
net.ipv4.tcp_rmem = 4096 87380 33554432
net.ipv4.tcp_wmem = 4096 65536 33554432
net.ipv4.tcp_window_scaling = 1
net.ipv4.tcp_timestamps = 1
net.ipv4.tcp_sack = 1
net.ipv4.tcp_slow_start_after_idle = 0
net.ipv4.tcp_mtu_probing = 1
net.ipv4.tcp_no_metrics_save = 1
net.ipv4.tcp_fin_timeout = 15
net.ipv4.tcp_keepalive_time = 300
net.ipv4.ip_local_port_range = 1024 65000

net.ipv4.udp_rmem_min = 16384
net.ipv4.udp_wmem_min = 16384

net.ipv4.neigh.default.gc_thresh1 = 1024
net.ipv4.neigh.default.gc_thresh2 = 4096
net.ipv4.neigh.default.gc_thresh3 = 8192
EOF

sysctl -p /etc/sysctl.d/99-storage-1g.conf > /dev/null

# 4. Ring Buffer aller 1G-NICs auf Hardware-Maximum setzen
echo "[4/4] Optimiere Hardware Ring-Buffer..."
for iface in $(ip -o link show | awk -F': ' '{print $2}' | grep -E '^(eth|en|eno)'); do
    if command -v ethtool >/dev/null 2>&1; then
        MAX_RX=$(ethtool -g "$iface" 2>/dev/null | awk '/Pre-set maximums:/,/Current hardware settings:/' | awk '/^RX:/ {print $2; exit}' || echo "")
        MAX_TX=$(ethtool -g "$iface" 2>/dev/null | awk '/Pre-set maximums:/,/Current hardware settings:/' | awk '/^TX:/ {print $2; exit}' || echo "")
        if [ -n "$MAX_RX" ] && [ "$MAX_RX" -gt 0 ]; then
            ethtool -G "$iface" rx "$MAX_RX" tx "$MAX_TX" 2>/dev/null || true
            echo "  └─ $iface auf RX=$MAX_RX / TX=$MAX_TX gesetzt."
        fi
    fi
done

echo "==================================================================================="
echo "   1Gbps Storage (100GB RAM & ARC) Tuning abgeschlossen!           "
echo "==================================================================================="