#!/usr/bin/env bash
set -euo pipefail

echo "=========================================================="
echo " [STORAGE300] ZFS (200GB ARC) & NFS Server Tuning        "
echo "=========================================================="

# 1. ZFS Modul-Optionen (200GB ARC, 64 Streams Prefetching)
echo "[1/4] Konfiguriere ZFS ARC und Prefetcher..."
cat <<'EOF' > /etc/modprobe.d/zfs.conf
options zfs zfs_arc_max=214748364800
options zfs zfs_arc_min=107374182400
options zfs zfetch_max_streams=64
options zfs zfs_dirty_data_max=4294967296
options zfs zfs_txg_timeout=5
EOF

# Live anwenden
echo 214748364800 > /sys/module/zfs/parameters/zfs_arc_max 2>/dev/null || true
echo 107374182400 > /sys/module/zfs/parameters/zfs_arc_min 2>/dev/null || true
echo 64 > /sys/module/zfs/parameters/zfetch_max_streams 2>/dev/null || true

# 2. 512 NFS Worker Threads (Live & Persistent)
echo "[2/4] Konfiguriere 512 NFS Server Worker Threads..."
echo 512 > /proc/fs/nfsd/threads 2>/dev/null || true

mkdir -p /etc
if [ -f /etc/nfs.conf ]; then
    if grep -q "\[nfsd\]" /etc/nfs.conf; then
        sed -i '/\[nfsd\]/a threads=512' /etc/nfs.conf
    else
        echo -e "\n[nfsd]\nthreads=512" >> /etc/nfs.conf
    fi
else
    echo -e "[nfsd]\nthreads=512" > /etc/nfs.conf
fi

if [ -f /etc/default/nfs-kernel-server ]; then
    sed -i 's/^RPCNFSDCOUNT=.*/RPCNFSDCOUNT=512/' /etc/default/nfs-kernel-server || echo "RPCNFSDCOUNT=512" >> /etc/default/nfs-kernel-server
fi

# 3. Sysctl Konfiguration (Symmetrisch: BBR, FQ, 128MB Sockets)
echo "[3/4] Wende Sysctl Netzwerk- und Speicherprofil an..."
cat <<'EOF' > /etc/sysctl.d/99-storage-performance.conf
fs.file-max = 2097152
fs.nr_open = 2097152
vm.max_map_count = 262144

vm.vfs_cache_pressure = 50
vm.swappiness = 10
vm.dirty_background_ratio = 5
vm.dirty_ratio = 15

sunrpc.tcp_slot_table_entries = 128
sunrpc.tcp_max_slot_table_entries = 128
sunrpc.udp_slot_table_entries = 128

net.core.default_qdisc = fq
net.core.somaxconn = 65535
net.core.netdev_max_backlog = 65535
net.core.netdev_budget = 600
net.core.netdev_budget_usecs = 8000
net.core.optmem_max = 262144

net.core.rmem_default = 262144
net.core.wmem_default = 262144
net.core.rmem_max = 134217728
net.core.wmem_max = 134217728

net.ipv4.tcp_congestion_control = bbr
net.ipv4.tcp_rmem = 4096 87380 134217728
net.ipv4.tcp_wmem = 4096 65536 134217728
net.ipv4.tcp_window_scaling = 1
net.ipv4.tcp_timestamps = 1
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

sysctl -p /etc/sysctl.d/99-storage-performance.conf > /dev/null

# 4. Ring Buffer aller physischen NICs anheben
echo "[4/4] Maximiere Hardware Ring-Buffer..."
for iface in $(ip -o link show | awk -F': ' '{print $2}' | grep -E '^(eth|en|eno)'); do
    ethtool -G "$iface" rx 4096 tx 4096 2>/dev/null || true
done

echo "==================================================================================="
echo "   10Gbps Storage (200GB RAM & ARC) erfolgreich optimiert!"
echo "==================================================================================="