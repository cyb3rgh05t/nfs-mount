#!/bin/bash
set -e

echo "============================================"
echo "  NFS-MergerFS Manager - Starting Up"
echo "============================================"

# ── Kernel Tuning for 300+ Concurrent Streams ──
echo "[TUNING] Applying kernel parameters for high-throughput NFS streaming..."

# NFS/SUNRPC: increase concurrent RPC slots (default 65 -> 128)
sysctl -w sunrpc.tcp_max_slot_table_entries=128 2>/dev/null || true
sysctl -w sunrpc.udp_slot_table_entries=128 2>/dev/null || true

# Network buffers: 128MB for high-throughput 10G links
sysctl -w net.core.rmem_max=134217728 2>/dev/null || true
sysctl -w net.core.wmem_max=134217728 2>/dev/null || true
sysctl -w net.core.rmem_default=1048576 2>/dev/null || true
sysctl -w net.core.wmem_default=1048576 2>/dev/null || true
sysctl -w net.ipv4.tcp_rmem="4096 1048576 134217728" 2>/dev/null || true
sysctl -w net.ipv4.tcp_wmem="4096 1048576 134217728" 2>/dev/null || true

# TCP optimizations
sysctl -w net.ipv4.tcp_window_scaling=1 2>/dev/null || true
sysctl -w net.ipv4.tcp_timestamps=1 2>/dev/null || true
sysctl -w net.ipv4.tcp_sack=1 2>/dev/null || true
sysctl -w net.ipv4.tcp_no_metrics_save=1 2>/dev/null || true
sysctl -w net.ipv4.tcp_moderate_rcvbuf=1 2>/dev/null || true

# BBR congestion control (reduces packet loss on high-throughput links)
sysctl -w net.core.default_qdisc=fq 2>/dev/null || true
sysctl -w net.ipv4.tcp_congestion_control=bbr 2>/dev/null || true

# VM/Page cache tuning for streaming workloads
sysctl -w vm.dirty_ratio=40 2>/dev/null || true
sysctl -w vm.dirty_background_ratio=10 2>/dev/null || true
sysctl -w vm.vfs_cache_pressure=50 2>/dev/null || true

# Connection tracking for many concurrent NFS clients
sysctl -w net.netfilter.nf_conntrack_max=524288 2>/dev/null || true
sysctl -w net.netfilter.nf_conntrack_tcp_timeout_established=86400 2>/dev/null || true

# Network device budget for high-throughput
sysctl -w net.core.netdev_budget=600 2>/dev/null || true
sysctl -w net.core.netdev_budget_usecs=8000 2>/dev/null || true
sysctl -w net.core.optmem_max=262144 2>/dev/null || true

echo "[TUNING] Kernel parameters applied."

# ── CPU Load Balancing (RPS/XPS) ──
ETH_DEV=$(ip -o link show | awk -F': ' '!/lo|docker|br-|veth|wg/{print $2; exit}')
if [ -n "$ETH_DEV" ]; then
    echo "[TUNING] Optimizing CPU load distribution (RPS/XPS) for $ETH_DEV..."
    # Detect CPU count and build bitmask
    NCPU=$(nproc 2>/dev/null || echo 1)
    if [ "$NCPU" -ge 64 ]; then
        MASK="ffffffff,ffffffff"
    elif [ "$NCPU" -ge 32 ]; then
        MASK="ffffffff"
    else
        MASK=$(printf '%x' $(( (1 << NCPU) - 1 )))
    fi
    for rx in /sys/class/net/$ETH_DEV/queues/rx-*/rps_cpus; do
        [ -f "$rx" ] && echo "$MASK" > "$rx" 2>/dev/null || true
    done
    for tx in /sys/class/net/$ETH_DEV/queues/tx-*/xps_cpus; do
        [ -f "$tx" ] && echo "$MASK" > "$tx" 2>/dev/null || true
    done
    # Set MTU
    ip link set dev $ETH_DEV mtu 1500 2>/dev/null || true
    echo "[TUNING] CPU load balancing applied for $ETH_DEV (mask=$MASK)."
else
    echo "[TUNING] No primary network interface found - skipping RPS/XPS."
fi

# ── WireGuard VPN ──
if [ -f /config/wg0.conf ]; then
    echo "[VPN] Starting WireGuard tunnel..."
    mkdir -p /etc/wireguard
    cp /config/wg0.conf /etc/wireguard/wg0.conf
    chmod 600 /etc/wireguard/wg0.conf
    wg-quick up wg0 && echo "[VPN] WireGuard tunnel active." || echo "[VPN] WireGuard startup failed!"
else
    echo "[VPN] No WireGuard config found at /config/wg0.conf - skipping."
fi

# ── Pin NFS auxiliary services to fixed ports (for firewall) ──
echo "[NFS] Pinning NFS services to fixed ports for firewall protection..."
MOUNTD_PORT=32767
NLOCKMGR_PORT=32768
STATD_PORT=32769

# Configure statd fixed port
mkdir -p /var/lib/nfs/sm /var/lib/nfs/sm.bak /var/run/rpc_pipefs 2>/dev/null || true

# Set port in /etc/default/nfs-common (statd)
cat > /etc/default/nfs-common 2>/dev/null <<EOF
STATDOPTS="--port $STATD_PORT"
EOF

# Configure nlockmgr via kernel module params
echo "options lockd nlm_udpport=$NLOCKMGR_PORT nlm_tcpport=$NLOCKMGR_PORT" > /etc/modprobe.d/lockd.conf 2>/dev/null || true
# Also set via sysctl for runtime
sysctl -w fs.nfs.nlm_tcpport=$NLOCKMGR_PORT 2>/dev/null || true
sysctl -w fs.nfs.nlm_udpport=$NLOCKMGR_PORT 2>/dev/null || true

# Configure mountd fixed port and NFS threads in /etc/default/nfs-kernel-server
NFS_THREADS=${NFS_THREADS:-512}
cat > /etc/default/nfs-kernel-server 2>/dev/null <<EOF
RPCMOUNTDOPTS="--port $MOUNTD_PORT"
RPCNFSDCOUNT=$NFS_THREADS
EOF

echo "[NFS] Fixed ports: mountd=$MOUNTD_PORT, nlockmgr=$NLOCKMGR_PORT, statd=$STATD_PORT"
echo "[NFS] NFS server threads: $NFS_THREADS"

# ── Mount nfsd filesystem (required for NFS server in containers) ──
if [ ! -d /proc/fs/nfsd ] || ! mountpoint -q /proc/fs/nfsd 2>/dev/null; then
    echo "[NFS] Mounting /proc/fs/nfsd..."
    modprobe nfsd 2>/dev/null || true
    mkdir -p /proc/fs/nfsd 2>/dev/null || true
    mount -t nfsd nfsd /proc/fs/nfsd 2>/dev/null || true
fi
if mountpoint -q /proc/fs/nfsd 2>/dev/null; then
    echo "[NFS] /proc/fs/nfsd mounted successfully"
else
    echo "[NFS] WARNING: Could not mount /proc/fs/nfsd — NFS server exports will not work"
fi

# Mount rpc_pipefs if needed
if [ ! -d /var/lib/nfs/rpc_pipefs ] || ! mountpoint -q /var/lib/nfs/rpc_pipefs 2>/dev/null; then
    mkdir -p /var/lib/nfs/rpc_pipefs 2>/dev/null || true
    mount -t rpc_pipefs rpc_pipefs /var/lib/nfs/rpc_pipefs 2>/dev/null || true
fi

# ── Bind-mount host /etc/exports if available ──
# With privileged mode, we can access the host filesystem via /proc/1/root
# (PID 1 on the host is always init/systemd)
HOST_EXPORTS="/proc/1/root/etc/exports"
if [ -f "$HOST_EXPORTS" ] && ! mount | grep -q "on /etc/exports type"; then
    echo "[NFS] Found host /etc/exports, bind-mounting..."
    mount --bind "$HOST_EXPORTS" /etc/exports 2>/dev/null && \
        echo "[NFS] Host /etc/exports bind-mounted successfully" || \
        echo "[NFS] WARNING: Could not bind-mount host /etc/exports"
elif mount | grep -q "on /etc/exports type"; then
    echo "[NFS] /etc/exports already bind-mounted (via docker-compose volume)"
else
    echo "[NFS] No host /etc/exports found — using container-local file"
fi

# ── Clean stale mounts & ensure directories ──
for mp in /mnt/downloads /mnt/unionfs; do
    if mountpoint -q "$mp" 2>/dev/null; then
        echo "[CLEANUP] Unmounting stale mount at $mp..."
        fusermount -u "$mp" 2>/dev/null || umount -l "$mp" 2>/dev/null || true
    elif [ -e "$mp" ] && ! stat "$mp" >/dev/null 2>&1; then
        echo "[CLEANUP] Stale transport at $mp, force unmounting..."
        umount -l "$mp" 2>/dev/null || true
    fi
    mkdir -p "$mp" 2>/dev/null || true
done

# ── Start Application ──
echo "[APP] Starting NFS-MergerFS Manager on port 8080..."
exec uvicorn backend.app.main:app --host 0.0.0.0 --port 8080 --workers 1 --log-level info
