#!/bin/bash
# NFS-MergerFS Manager — Performance Diagnostics
# Run inside the container: docker exec -it nfs-manager bash /app/diagnostics.sh

RST="\033[0m"
BOLD="\033[1m"
GREEN="\033[32m"
RED="\033[31m"
CYAN="\033[36m"
YELLOW="\033[33m"
DIM="\033[2m"

ok()   { echo -e "  ${GREEN}✓${RST} $*"; }
warn() { echo -e "  ${YELLOW}⚠${RST} $*"; }
fail() { echo -e "  ${RED}✗${RST} $*"; }
head() { echo -e "\n${BOLD}${CYAN}━━ $* ━━${RST}"; }

head "NFS CLIENT MOUNTS"
echo -e "${DIM}Checking active NFS mount options...${RST}"
mount -t nfs,nfs4 2>/dev/null | while read line; do
    dev=$(echo "$line" | awk '{print $1}')
    mp=$(echo "$line" | awk '{print $3}')
    opts=$(echo "$line" | sed 's/.*(\(.*\))/\1/')
    echo -e "\n  ${BOLD}$dev${RST} → ${CYAN}$mp${RST}"
    echo -e "  ${DIM}Options: $opts${RST}"

    # Check critical options
    echo "$opts" | grep -q "nconnect=" && ok "nconnect present: $(echo $opts | grep -o 'nconnect=[0-9]*')" || fail "nconnect MISSING (using 1 TCP connection!)"
    echo "$opts" | grep -q "rsize=" && ok "rsize: $(echo $opts | grep -o 'rsize=[0-9]*')" || warn "rsize not set (kernel default)"
    echo "$opts" | grep -q "wsize=" && ok "wsize: $(echo $opts | grep -o 'wsize=[0-9]*')" || warn "wsize not set (kernel default)"
    echo "$opts" | grep -q "noatime" && ok "noatime enabled" || warn "noatime not set"
    echo "$opts" | grep -qE "\basync\b" && ok "async mode" || warn "sync mode (slower)"
done

if ! mount -t nfs,nfs4 2>/dev/null | grep -q .; then
    warn "No NFS mounts found"
fi

head "NFS READ-AHEAD"
echo -e "${DIM}Checking read-ahead settings for NFS devices...${RST}"
for bdi in /sys/class/bdi/*/read_ahead_kb; do
    if [ -f "$bdi" ]; then
        val=$(cat "$bdi" 2>/dev/null)
        dir=$(dirname "$bdi")
        name=$(basename "$dir")
        # Only show NFS-related BDIs (0:XX pattern for NFS)
        if echo "$name" | grep -qE "^0:"; then
            if [ "$val" -ge 16384 ] 2>/dev/null; then
                ok "$name: ${val}KB"
            else
                warn "$name: ${val}KB (recommend 16384KB for streaming)"
            fi
        fi
    fi
done

head "MERGERFS MOUNTS"
echo -e "${DIM}Checking MergerFS mount options...${RST}"
mount -t fuse.mergerfs 2>/dev/null | while read line; do
    dev=$(echo "$line" | awk '{print $1}')
    mp=$(echo "$line" | awk '{print $3}')
    opts=$(echo "$line" | sed 's/.*(\(.*\))/\1/')
    echo -e "\n  ${BOLD}MergerFS${RST} → ${CYAN}$mp${RST}"
    echo -e "  ${DIM}Options: $opts${RST}"

    echo "$opts" | grep -q "kernel_cache" && ok "kernel_cache enabled" || warn "kernel_cache MISSING"
    echo "$opts" | grep -q "splice_move" && ok "splice_move (zero-copy)" || warn "splice_move MISSING"
    echo "$opts" | grep -q "splice_read" && ok "splice_read (zero-copy)" || warn "splice_read MISSING"
    echo "$opts" | grep -q "direct_io" && ok "direct_io enabled" || warn "direct_io MISSING"
    echo "$opts" | grep -q "dropcacheonclose" && ok "dropcacheonclose enabled" || warn "dropcacheonclose MISSING"
done

if ! mount -t fuse.mergerfs 2>/dev/null | grep -q .; then
    warn "No MergerFS mounts found"
fi

head "NFS SERVER EXPORTS"
echo -e "${DIM}Checking active NFS exports...${RST}"
exports=$(exportfs -v 2>/dev/null || nsenter -t 1 -m -p -n -i -- exportfs -v 2>/dev/null)
if [ -n "$exports" ]; then
    echo "$exports" | while read line; do
        [ -z "$line" ] && continue
        echo -e "  $line"
    done
    echo ""
    echo "$exports" | grep -q "async" && ok "async exports detected" || warn "All exports using sync (slower for streaming)"
else
    warn "No active exports (exportfs -v returned empty)"
fi

head "NFS SERVER THREADS"
threads=$(cat /proc/fs/nfsd/threads 2>/dev/null || echo "?")
if [ "$threads" -ge 256 ] 2>/dev/null; then
    ok "NFS threads: $threads"
elif [ "$threads" != "?" ]; then
    warn "NFS threads: $threads (recommend 256+)"
else
    warn "Cannot read /proc/fs/nfsd/threads"
fi

head "KERNEL PARAMETERS"
echo -e "${DIM}Critical networking & NFS tuning...${RST}"
check_sysctl() {
    local param=$1 min=$2
    local val=$(sysctl -n "$param" 2>/dev/null || echo "N/A")
    if [ "$val" = "N/A" ]; then
        warn "$param: not available"
    elif [ "$val" -ge "$min" ] 2>/dev/null; then
        ok "$param = $val"
    else
        warn "$param = $val (recommend >= $min)"
    fi
}
check_sysctl_str() {
    local param=$1 expected=$2
    local val=$(sysctl -n "$param" 2>/dev/null || echo "N/A")
    if [ "$val" = "$expected" ]; then
        ok "$param = $val"
    else
        warn "$param = $val (recommend: $expected)"
    fi
}

check_sysctl "sunrpc.tcp_max_slot_table_entries" 128
check_sysctl "net.core.rmem_max" 134217728
check_sysctl "net.core.wmem_max" 134217728
check_sysctl_str "net.ipv4.tcp_congestion_control" "bbr"
check_sysctl_str "net.core.default_qdisc" "fq"
check_sysctl "vm.dirty_ratio" 30
check_sysctl "vm.dirty_background_ratio" 5
check_sysctl "net.core.netdev_budget" 300
check_sysctl "net.core.optmem_max" 262144

head "RPS/XPS STATUS"
ETH_DEV=$(ip -o link show | awk -F': ' '!/lo|docker|br-|veth|wg/{print $2; exit}')
if [ -n "$ETH_DEV" ]; then
    echo -e "  Interface: ${CYAN}$ETH_DEV${RST}"
    rps=$(cat /sys/class/net/$ETH_DEV/queues/rx-0/rps_cpus 2>/dev/null || echo "N/A")
    xps=$(cat /sys/class/net/$ETH_DEV/queues/tx-0/xps_cpus 2>/dev/null || echo "N/A")
    [ "$rps" != "0" ] && [ "$rps" != "00000000" ] && [ "$rps" != "N/A" ] && ok "RPS: $rps" || warn "RPS: $rps (not configured)"
    [ "$xps" != "0" ] && [ "$xps" != "00000000" ] && [ "$xps" != "N/A" ] && ok "XPS: $xps" || warn "XPS: $xps (not configured)"
else
    warn "No primary interface detected"
fi

head "TCP CONNECTIONS (Port 2049)"
nfs_conns=$(ss -ant 2>/dev/null | grep ':2049' | wc -l)
echo -e "  Active NFS connections: ${CYAN}$nfs_conns${RST}"

head "SUMMARY"
echo -e "${DIM}Run this after mounting to verify all performance settings are active.${RST}"
echo ""
