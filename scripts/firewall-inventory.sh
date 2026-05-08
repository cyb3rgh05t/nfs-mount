#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# firewall-inventory.sh
#
# Prints every TCP/UDP socket that is currently exposed on a public interface
# of this host, mapped to its process / Docker container, so you can build a
# Hetzner Robot firewall whitelist.
#
# Output format is grouped by recommended firewall scope:
#   • LOCAL only (loopback)            — never exposed
#   • DOCKER internal (host bridge)    — usually not externally routable
#   • PUBLIC (any other interface)     — needs an explicit firewall rule
#
# Run as root for full process / docker info:
#   sudo bash scripts/firewall-inventory.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Colors (only if attached to a terminal) ──
if [[ -t 1 ]]; then
    BOLD="\033[1m"; DIM="\033[2m"; RST="\033[0m"
    GREEN="\033[32m"; YELLOW="\033[33m"; RED="\033[31m"; CYAN="\033[36m"; MAGENTA="\033[35m"
else
    BOLD=""; DIM=""; RST=""; GREEN=""; YELLOW=""; RED=""; CYAN=""; MAGENTA=""
fi

hr()  { printf "${DIM}─────────────────────────────────────────────────────────────────${RST}\n"; }
head(){ printf "\n${BOLD}${CYAN}━━ %s ━━${RST}\n" "$1"; }

# ── Sanity ──
if ! command -v ss >/dev/null; then
    echo "ss(8) not found — install iproute2." >&2
    exit 1
fi
if [[ $EUID -ne 0 ]]; then
    echo -e "${YELLOW}Note: running as non-root — process names may be hidden. Use sudo for full output.${RST}\n"
fi

# ── 1. Public listening sockets ──
head "Public listening sockets (TCP + UDP)"
printf "${BOLD}%-6s %-22s %-32s %s${RST}\n" "PROTO" "ADDRESS:PORT" "PROCESS" "CONTAINER"
hr

# Build a quick lookup: pid -> container name (if any)
declare -A PID2CONTAINER=()
if command -v docker >/dev/null && docker info >/dev/null 2>&1; then
    while read -r cid name; do
        # all PIDs inside this container, mapped via /proc
        pid=$(docker inspect -f '{{.State.Pid}}' "$cid" 2>/dev/null || echo "")
        [[ -z "$pid" || "$pid" == "0" ]] && continue
        # also include all child PIDs (e.g. nginx workers)
        for child in $(pgrep -P "$pid" 2>/dev/null) "$pid"; do
            PID2CONTAINER[$child]="$name"
        done
    done < <(docker ps --format '{{.ID}} {{.Names}}')
fi

# Collect listening sockets via ss -tulnp
# Format: Netid State Recv-Q Send-Q Local Peer Process
public_count=0
local_count=0
docker_count=0

while IFS= read -r line; do
    proto=$(awk '{print $1}' <<<"$line")
    local=$(awk '{print $5}' <<<"$line")
    proc=$(grep -oP 'users:\(\(\K[^)]+' <<<"$line" || echo "")
    # parse pid out of "name",pid=12345,fd=...
    pid=$(grep -oP 'pid=\K\d+' <<<"$line" || echo "")
    pname=$(awk -F'"' '{print $2}' <<<"\"$proc\"" 2>/dev/null || echo "")
    [[ -z "$pname" ]] && pname=$(awk -F'"' '{print $2}' <<<"$proc" 2>/dev/null || echo "?")

    addr="${local%:*}"
    port="${local##*:}"

    # classify
    if [[ "$addr" == "127.0.0.1" || "$addr" == "[::1]" || "$addr" == "::1" ]]; then
        scope="LOCAL"; color="$DIM"
        ((local_count++))
    elif [[ -n "${PID2CONTAINER[$pid]:-}" ]]; then
        scope="DOCKER"; color="$MAGENTA"
        ((docker_count++))
    else
        scope="PUBLIC"; color="$GREEN"
        ((public_count++))
    fi

    container="${PID2CONTAINER[$pid]:-}"
    printf "${color}%-6s %-22s %-32s %s${RST}\n" "$proto" "$local" "${pname}(${pid:-?})" "$container"
done < <(ss -tulnH -p 2>/dev/null | awk '{$1=$1; print}' | sort -u)

# ── 2. Docker published ports (host-side mapping) ──
head "Docker published ports"
if command -v docker >/dev/null && docker info >/dev/null 2>&1; then
    docker ps --format 'table {{.Names}}\t{{.Ports}}' | sed 's/, /\n          /g'
else
    echo "(docker not available)"
fi

# ── 3. Suggested Hetzner Robot firewall rules ──
head "Suggested Hetzner firewall whitelist"
cat <<EOF
Open these at https://robot.hetzner.com → Server → Firewall (top-down evaluation):

  ${BOLD}#  Action   IP-version  Protocol  Dst-port      Source IP${RST}
  1  ACCEPT   IPv4        TCP       22            <your-static-ips>      # SSH
  2  ACCEPT   IPv4        UDP       51820         0.0.0.0/0              # WireGuard (if used)
  3  ACCEPT   IPv4        TCP       2049          <client-server-ips>    # NFS
  4  ACCEPT   IPv4        TCP       32767-32769   <client-server-ips>    # mountd/nlockmgr/statd
  5  ACCEPT   IPv4        TCP       8080          <your-vpn-subnet>      # nfs-mount WebUI
  6  ACCEPT   IPv4        ICMP      *             0.0.0.0/0              # ping / mtr
  7  ACCEPT   IPv4        TCP       *             0.0.0.0/0   tcp-flags  # established (auto-checkbox)
  8  DISCARD  *           *         *             0.0.0.0/0              # default deny

For every PUBLIC line above, decide:
  • only you / VPN  → narrow source IP
  • only servers    → list their dedicated IPs
  • truly public    → 0.0.0.0/0  (rare for storage hosts)

Total exposed:  ${BOLD}${public_count}${RST} public  +  ${docker_count} docker-bridged  +  ${local_count} loopback
EOF

echo
echo -e "${DIM}Tip: re-run after adding/removing services so your firewall stays in sync.${RST}"
