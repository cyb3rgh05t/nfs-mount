#!/bin/bash
set -e

# ── ANSI Colors ──
RST="\033[0m"
DIM="\033[2m"
BOLD="\033[1m"
GREEN="\033[32m"
CYAN="\033[36m"
YELLOW="\033[33m"
RED="\033[31m"
GRAY="\033[38;5;244m"

log()  { echo -e "${DIM}$(date +%H:%M:%S)${RST} ${BOLD}${GREEN}INFO    ${RST} ${GRAY}entrypoint${RST}               $*"; }
warn() { echo -e "${DIM}$(date +%H:%M:%S)${RST} ${BOLD}${YELLOW}WARNING ${RST} ${GRAY}entrypoint${RST}               $*"; }
err()  { echo -e "${DIM}$(date +%H:%M:%S)${RST} ${BOLD}${RED}ERROR   ${RST} ${GRAY}entrypoint${RST}               $*"; }
head() { echo -e "\n${BOLD}${CYAN}━━ $* ━━${RST}"; }

head "NFS-MergerFS Manager - Starting Up"

# ── Detect host iptables backend ──
head "Firewall Backend"
if nsenter -t 1 -m -n -- iptables-nft -S >/dev/null 2>&1; then
    if update-alternatives --set iptables /usr/sbin/iptables-nft 2>/dev/null && \
       update-alternatives --set ip6tables /usr/sbin/ip6tables-nft 2>/dev/null; then
        log "Host uses ${CYAN}nf_tables${RST} — container iptables set to nft ${GREEN}✓${RST}"
    else
        log "Host uses ${CYAN}nf_tables${RST} — nft is already the default ${GREEN}✓${RST}"
    fi
else
    if update-alternatives --set iptables /usr/sbin/iptables-legacy 2>/dev/null && \
       update-alternatives --set ip6tables /usr/sbin/ip6tables-legacy 2>/dev/null; then
        log "Host uses ${CYAN}legacy${RST} iptables — container set to legacy ${GREEN}✓${RST}"
    else
        log "Host uses ${CYAN}legacy${RST} iptables — legacy is already the default ${GREEN}✓${RST}"
    fi
fi

# ── Kernel Tuning for 300+ Concurrent Streams ──
head "Kernel Tuning"
log "Applying kernel parameters for high-throughput NFS streaming..."

# NFS/SUNRPC: increase concurrent RPC slots (default 65 -> 128)
sysctl -qw sunrpc.tcp_max_slot_table_entries=128 2>/dev/null || true
sysctl -qw sunrpc.udp_slot_table_entries=128 2>/dev/null || true

# Network buffers: 128MB for high-throughput 10G links
sysctl -qw net.core.rmem_max=134217728 2>/dev/null || true
sysctl -qw net.core.wmem_max=134217728 2>/dev/null || true
sysctl -qw net.core.rmem_default=1048576 2>/dev/null || true
sysctl -qw net.core.wmem_default=1048576 2>/dev/null || true
sysctl -qw net.ipv4.tcp_rmem="4096 1048576 134217728" 2>/dev/null || true
sysctl -qw net.ipv4.tcp_wmem="4096 1048576 134217728" 2>/dev/null || true

# TCP optimizations
sysctl -qw net.ipv4.tcp_window_scaling=1 2>/dev/null || true
sysctl -qw net.ipv4.tcp_timestamps=1 2>/dev/null || true
sysctl -qw net.ipv4.tcp_sack=1 2>/dev/null || true
sysctl -qw net.ipv4.tcp_no_metrics_save=1 2>/dev/null || true
sysctl -qw net.ipv4.tcp_moderate_rcvbuf=1 2>/dev/null || true

# BBR congestion control (reduces packet loss on high-throughput links)
sysctl -qw net.core.default_qdisc=fq 2>/dev/null || true
sysctl -qw net.ipv4.tcp_congestion_control=bbr 2>/dev/null || true

# VM/Page cache tuning for streaming workloads
sysctl -qw vm.dirty_ratio=40 2>/dev/null || true
sysctl -qw vm.dirty_background_ratio=10 2>/dev/null || true
sysctl -qw vm.vfs_cache_pressure=50 2>/dev/null || true

# Connection tracking for many concurrent NFS clients
sysctl -qw net.netfilter.nf_conntrack_max=524288 2>/dev/null || true
sysctl -qw net.netfilter.nf_conntrack_tcp_timeout_established=86400 2>/dev/null || true

# Network device budget for high-throughput
sysctl -qw net.core.netdev_budget=600 2>/dev/null || true
sysctl -qw net.core.netdev_budget_usecs=8000 2>/dev/null || true
sysctl -qw net.core.optmem_max=262144 2>/dev/null || true

log "Kernel parameters applied ${GREEN}✓${RST}"

# ── CPU Load Balancing (RPS/XPS) ──
head "CPU Load Balancing"
ETH_DEV=$(ip -o link show | awk -F': ' '!/lo|docker|br-|veth|wg/{print $2; exit}')
if [ -n "$ETH_DEV" ]; then
    log "Optimizing RPS/XPS for ${CYAN}$ETH_DEV${RST}..."
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
    log "CPU load balancing applied for ${CYAN}$ETH_DEV${RST} (mask=${CYAN}$MASK${RST}) ${GREEN}✓${RST}"
else
    warn "No primary network interface found — skipping RPS/XPS"
fi

# ── WireGuard VPN ──
head "VPN"
if [ -f /config/wg0.conf ]; then
    log "Starting WireGuard tunnel..."
    mkdir -p /etc/wireguard
    cp /config/wg0.conf /etc/wireguard/wg0.conf
    chmod 600 /etc/wireguard/wg0.conf
    wg-quick up wg0 && log "WireGuard tunnel active ${GREEN}✓${RST}" || err "WireGuard startup failed!"
else
    log "No WireGuard config at /config/wg0.conf — skipping"
fi

# ── Pin NFS auxiliary services to fixed ports (for firewall) ──
head "NFS Server"
log "Pinning NFS services to fixed ports..."
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
sysctl -qw fs.nfs.nlm_tcpport=$NLOCKMGR_PORT 2>/dev/null || true
sysctl -qw fs.nfs.nlm_udpport=$NLOCKMGR_PORT 2>/dev/null || true

# Configure mountd fixed port and NFS threads in /etc/default/nfs-kernel-server
NFS_THREADS=${NFS_THREADS:-512}
cat > /etc/default/nfs-kernel-server 2>/dev/null <<EOF
RPCMOUNTDOPTS="--port $MOUNTD_PORT"
RPCNFSDCOUNT=$NFS_THREADS
EOF

log "Fixed ports: mountd=${CYAN}$MOUNTD_PORT${RST}  nlockmgr=${CYAN}$NLOCKMGR_PORT${RST}  statd=${CYAN}$STATD_PORT${RST}"
log "NFS server threads: ${CYAN}$NFS_THREADS${RST}"

# ── Mount nfsd filesystem (required for NFS server in containers) ──
if [ ! -d /proc/fs/nfsd ] || ! mountpoint -q /proc/fs/nfsd 2>/dev/null; then
    log "Mounting /proc/fs/nfsd..."
    modprobe nfsd 2>/dev/null || true
    mkdir -p /proc/fs/nfsd 2>/dev/null || true
    mount -t nfsd nfsd /proc/fs/nfsd 2>/dev/null || true
fi
if mountpoint -q /proc/fs/nfsd 2>/dev/null; then
    log "/proc/fs/nfsd mounted ${GREEN}✓${RST}"
else
    warn "Could not mount /proc/fs/nfsd — NFS server exports will not work"
fi

# Mount rpc_pipefs if needed
if [ ! -d /var/lib/nfs/rpc_pipefs ] || ! mountpoint -q /var/lib/nfs/rpc_pipefs 2>/dev/null; then
    mkdir -p /var/lib/nfs/rpc_pipefs 2>/dev/null || true
    mount -t rpc_pipefs rpc_pipefs /var/lib/nfs/rpc_pipefs 2>/dev/null || true
fi

# ── Detect host /etc/exports access ──
HOST_EXPORTS="/proc/1/root/etc/exports"
if [ -f "$HOST_EXPORTS" ]; then
    log "Host /etc/exports accessible via ${CYAN}$HOST_EXPORTS${RST} ${GREEN}✓${RST}"
else
    warn "Host /etc/exports NOT accessible — will use container-local /etc/exports"
fi

# ── Clean stale mounts & ensure directories ──
for mp in /mnt/downloads /mnt/unionfs; do
    if mountpoint -q "$mp" 2>/dev/null; then
        log "Unmounting stale mount at ${CYAN}$mp${RST}..."
        fusermount -u "$mp" 2>/dev/null || umount -l "$mp" 2>/dev/null || true
    elif [ -e "$mp" ] && ! stat "$mp" >/dev/null 2>&1; then
        log "Stale transport at ${CYAN}$mp${RST}, force unmounting..."
        umount -l "$mp" 2>/dev/null || true
    fi
    mkdir -p "$mp" 2>/dev/null || true
done

# ── Start Application ──
head "Application"
log "Starting NFS-MergerFS Manager on port ${CYAN}8080${RST}..."
exec uvicorn backend.app.main:app --host 0.0.0.0 --port 8080 --workers 1 --log-level warning
