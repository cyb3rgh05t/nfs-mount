#!/bin/bash
set -e

echo "============================================"
echo "  NFS-MergerFS Manager - Starting Up"
echo "============================================"

# ── Kernel Tuning for 300+ Concurrent Streams ──
echo "[TUNING] Applying kernel parameters for high-throughput NFS streaming..."

# NFS/SUNRPC: increase concurrent RPC slots (default 65 -> 128)
sysctl -w sunrpc.tcp_max_slot_table_entries=128 2>/dev/null || true

# Network buffers: maximize TCP throughput
sysctl -w net.core.rmem_max=16777216 2>/dev/null || true
sysctl -w net.core.wmem_max=16777216 2>/dev/null || true
sysctl -w net.core.rmem_default=1048576 2>/dev/null || true
sysctl -w net.core.wmem_default=1048576 2>/dev/null || true
sysctl -w net.ipv4.tcp_rmem="4096 1048576 16777216" 2>/dev/null || true
sysctl -w net.ipv4.tcp_wmem="4096 1048576 16777216" 2>/dev/null || true

# TCP optimizations
sysctl -w net.ipv4.tcp_window_scaling=1 2>/dev/null || true
sysctl -w net.ipv4.tcp_timestamps=1 2>/dev/null || true
sysctl -w net.ipv4.tcp_sack=1 2>/dev/null || true
sysctl -w net.ipv4.tcp_no_metrics_save=1 2>/dev/null || true
sysctl -w net.ipv4.tcp_moderate_rcvbuf=1 2>/dev/null || true

# VM/Page cache tuning for streaming workloads
sysctl -w vm.dirty_ratio=40 2>/dev/null || true
sysctl -w vm.dirty_background_ratio=10 2>/dev/null || true
sysctl -w vm.vfs_cache_pressure=50 2>/dev/null || true

echo "[TUNING] Kernel parameters applied."

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

# ── Ensure mount directories ──
mkdir -p /mnt/downloads /mnt/unionfs

# ── Start Application ──
echo "[APP] Starting NFS-MergerFS Manager on port 8080..."
exec uvicorn backend.app.main:app --host 0.0.0.0 --port 8080 --workers 1 --log-level info
