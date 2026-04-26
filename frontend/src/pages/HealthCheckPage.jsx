import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  HeartPulse,
  RefreshCw,
  Cpu,
  MemoryStick,
  HardDrive,
  GitMerge,
  Network,
  Terminal,
  Database,
  Container,
  Activity,
  Timer,
  ChevronDown,
  ChevronRight,
  Server,
  Gauge,
} from "lucide-react";
import { useToast } from "../components/ToastProvider";
import Toggle from "../components/Toggle";
import api from "../api/client";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (
    parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + " " + sizes[i]
  );
}

function statusColor(percent) {
  if (percent < 60) return "text-green-400";
  if (percent < 85) return "text-yellow-400";
  return "text-red-400";
}

function barColor(percent) {
  if (percent < 60) return "bg-green-500";
  if (percent < 85) return "bg-yellow-500";
  return "bg-red-500";
}

// ── Collapsible Section ──────────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  iconColor,
  defaultOpen = true,
  badge,
  children,
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-nfs-card border border-nfs-border rounded-xl overflow-hidden hover:border-nfs-muted transition-all">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-nfs-input/50 transition-colors"
      >
        <div className={`p-2 rounded-lg ${iconColor}`}>
          <Icon className="w-4 h-4" />
        </div>
        <h2 className="text-base font-semibold text-white flex-1">{title}</h2>
        {badge && (
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-nfs-input border border-nfs-border text-nfs-muted">
            {badge}
          </span>
        )}
        {open ? (
          <ChevronDown className="w-4 h-4 text-nfs-muted" />
        ) : (
          <ChevronRight className="w-4 h-4 text-nfs-muted" />
        )}
      </button>
      {open && <div className="px-4 pb-4 pt-0">{children}</div>}
    </div>
  );
}

// ── Stat Mini Card ───────────────────────────────────────────────────────────

function Stat({ label, value, sub, color = "text-white" }) {
  return (
    <div className="bg-nfs-input border border-nfs-border rounded-lg p-3 min-w-0">
      <p className="text-[10px] font-semibold text-nfs-muted uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className={`text-lg font-bold font-mono ${color}`}>{value}</p>
      {sub && <p className="text-xs text-nfs-muted mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Key/Value Row ────────────────────────────────────────────────────────────

function KV({ label, value, mono = false }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-nfs-border/50 last:border-b-0">
      <span className="text-sm text-nfs-muted">{label}</span>
      <span className={`text-sm text-white ${mono ? "font-mono" : ""}`}>
        {value}
      </span>
    </div>
  );
}

// ── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ percent, label }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-nfs-muted">{label}</span>
        <span className={statusColor(percent)}>{percent}%</span>
      </div>
      <div className="h-2 bg-nfs-input rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor(percent)}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function HealthCheckPage() {
  const toast = useToast();
  const [autoRefresh, setAutoRefresh] = useState(false);

  const {
    data,
    isFetching: loading,
    refetch,
    error,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ["health"],
    queryFn: () => api.getHealthCheck(),
    enabled: autoRefresh,
    refetchInterval: autoRefresh ? 30_000 : false,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    if (error) toast.error(error.message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const lastUpdate = dataUpdatedAt ? new Date(dataUpdatedAt) : null;
  const runCheck = () => refetch();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <HeartPulse className="w-6 h-6 text-emerald-400" />
            </div>
            Server Health
          </h1>
          <p className="text-nfs-muted mt-1">
            Live system status — memory, CPU, NFS, MergerFS, kernel, network
            &amp; storage.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdate && (
            <span className="text-xs text-nfs-muted">
              {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          <Toggle
            checked={autoRefresh}
            onChange={setAutoRefresh}
            label="Auto (10s)"
          />
          <button
            onClick={runCheck}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium transition-all"
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin text-nfs-primary" />
            ) : (
              <HeartPulse className="w-4 h-4 text-nfs-primary" />
            )}
            {loading ? "Checking..." : "Run Health Check"}
          </button>
        </div>
      </div>

      {/* Empty State */}
      {!data && !loading && (
        <div className="bg-nfs-card border border-nfs-border rounded-xl p-12 text-center">
          <HeartPulse className="w-12 h-12 text-nfs-muted mx-auto mb-4" />
          <p className="text-nfs-muted">
            Click{" "}
            <span className="text-white font-medium">Run Health Check</span> to
            scan your server.
          </p>
        </div>
      )}

      {data && (
        <div className="space-y-4">
          {/* ── System Overview ──────────────────────────────── */}
          <Section
            icon={Server}
            title="System Overview"
            iconColor="bg-blue-500/10 text-blue-400"
            badge={data.system?.uptime}
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat
                label="CPU Usage"
                value={`${data.system?.cpu_percent ?? 0}%`}
                color={statusColor(data.system?.cpu_percent ?? 0)}
                sub={`${data.system?.cpu_cores} cores`}
              />
              <Stat
                label="Load Average"
                value={
                  data.system?.load_avg?.map((l) => l.toFixed(1)).join(" / ") ??
                  "N/A"
                }
                sub="1m / 5m / 15m"
              />
              {data.vmstat && (
                <>
                  <Stat
                    label="I/O Wait"
                    value={`${data.vmstat.cpu_wa}%`}
                    color={
                      data.vmstat.cpu_wa > 20
                        ? "text-red-400"
                        : data.vmstat.cpu_wa > 10
                          ? "text-yellow-400"
                          : "text-green-400"
                    }
                    sub={`${data.vmstat.procs_b} blocked`}
                  />
                  <Stat
                    label="CPU Split"
                    value={`${data.vmstat.cpu_us}us / ${data.vmstat.cpu_sy}sy`}
                    sub={`${data.vmstat.cpu_id}% idle`}
                  />
                </>
              )}
            </div>
          </Section>

          {/* ── Memory ───────────────────────────────────────── */}
          <Section
            icon={MemoryStick}
            title="Memory"
            iconColor="bg-purple-500/10 text-purple-400"
            badge={`${formatBytes(data.memory?.available)} available`}
          >
            <div className="space-y-4">
              <ProgressBar
                percent={data.memory?.percent ?? 0}
                label={`RAM: ${formatBytes(data.memory?.used)} / ${formatBytes(data.memory?.total)}`}
              />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Total" value={formatBytes(data.memory?.total)} />
                <Stat
                  label="Used"
                  value={formatBytes(data.memory?.used)}
                  color={statusColor(data.memory?.percent ?? 0)}
                />
                <Stat
                  label="Free"
                  value={formatBytes(data.memory?.free)}
                  color="text-green-400"
                />
                <Stat
                  label="Buff/Cache"
                  value={formatBytes(data.memory?.buff_cache)}
                  color="text-cyan-400"
                />
              </div>
              {data.memory?.swap_total > 0 && (
                <div className="pt-2 border-t border-nfs-border/50">
                  <ProgressBar
                    percent={data.memory?.swap_percent ?? 0}
                    label={`Swap: ${formatBytes(data.memory?.swap_used)} / ${formatBytes(data.memory?.swap_total)}`}
                  />
                </div>
              )}
            </div>
          </Section>

          {/* ── NFS Mounts ───────────────────────────────────── */}
          <Section
            icon={HardDrive}
            title="NFS Mounts"
            iconColor="bg-blue-500/10 text-blue-400"
            badge={`${data.nfs_mounts?.length ?? 0} mounts`}
          >
            {!data.nfs_mounts || data.nfs_mounts.length === 0 ? (
              <p className="text-nfs-muted text-sm">No NFS mounts found.</p>
            ) : (
              <div className="space-y-3">
                {data.nfs_mounts.map((m, i) => (
                  <div
                    key={i}
                    className="bg-nfs-input border border-nfs-border rounded-lg p-3"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        {m.fs_type}
                      </span>
                      <code className="text-sm text-white font-mono">
                        {m.server}:{m.export}
                      </code>
                      <span className="text-nfs-muted text-xs">→</span>
                      <code className="text-sm text-nfs-primary font-mono">
                        {m.mount_point}
                      </code>
                      {data.nfs_connections?.per_server?.[m.server] && (
                        <span className="ml-auto text-xs font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                          {data.nfs_connections.per_server[m.server]} conn
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-nfs-muted font-mono break-all">
                      {m.options}
                    </p>
                  </div>
                ))}
              </div>
            )}
            {/* NFS Stats Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
              <Stat
                label="RPC Slots"
                value={data.nfs_rpc_slots ?? "N/A"}
                mono
              />
              <Stat
                label="Total Connections"
                value={data.nfs_connections?.total ?? 0}
              />
              <Stat
                label="RPC Calls"
                value={data.nfs_stats?.rpc_calls?.toLocaleString() ?? "N/A"}
              />
              <Stat
                label="Retransmits"
                value={data.nfs_stats?.retransmits?.toLocaleString() ?? "N/A"}
                color={
                  data.nfs_stats?.retransmits > 0
                    ? "text-yellow-400"
                    : "text-green-400"
                }
              />
            </div>
            {/* Read-Ahead */}
            {data.nfs_read_ahead?.length > 0 && (
              <div className="mt-3 pt-3 border-t border-nfs-border/50">
                <p className="text-xs text-nfs-muted mb-2 uppercase tracking-wider font-semibold">
                  Read-Ahead per BDI
                </p>
                <div className="flex flex-wrap gap-2">
                  {data.nfs_read_ahead.map((ra, i) => (
                    <span
                      key={i}
                      className={`text-xs font-mono px-2 py-1 rounded border ${
                        ra.read_ahead_kb >= 16384
                          ? "bg-green-500/10 text-green-400 border-green-500/20"
                          : "bg-red-500/10 text-red-400 border-red-500/20"
                      }`}
                    >
                      {ra.device}: {ra.read_ahead_kb} KB
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Section>

          {/* ── MergerFS ─────────────────────────────────────── */}
          <Section
            icon={GitMerge}
            title="MergerFS"
            iconColor="bg-purple-500/10 text-purple-400"
            badge={
              data.mergerfs?.running
                ? `PID ${data.mergerfs.pid}`
                : "not running"
            }
          >
            {!data.mergerfs?.running ? (
              <p className="text-nfs-muted text-sm">MergerFS is not running.</p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Stat
                    label="Mount Point"
                    value={data.mergerfs.mount_point || "N/A"}
                    mono
                  />
                  <Stat
                    label="Version"
                    value={data.mergerfs.version || "N/A"}
                    mono
                  />
                  <Stat
                    label="Branches"
                    value={data.mergerfs.branches?.length ?? 0}
                  />
                </div>
                {data.mergerfs.branches?.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {data.mergerfs.branches.map((b, i) => (
                      <span
                        key={i}
                        className="text-xs font-mono px-2 py-1 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20"
                      >
                        {b}
                      </span>
                    ))}
                  </div>
                )}
                {data.mergerfs.options && (
                  <div className="bg-nfs-input border border-nfs-border rounded-lg p-3">
                    <p className="text-xs text-nfs-muted mb-2 uppercase tracking-wider font-semibold">
                      Active Options
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(data.mergerfs.options).map(([k, v]) => {
                        const isCache = k.startsWith("cache.");
                        const isBool = v === true;
                        return (
                          <span
                            key={k}
                            className={`text-xs font-mono px-2 py-0.5 rounded border ${
                              isCache
                                ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                                : "bg-nfs-card text-nfs-text border-nfs-border"
                            }`}
                          >
                            {isBool ? k : `${k}=${v}`}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Section>

          {/* ── Kernel Tuning ────────────────────────────────── */}
          <Section
            icon={Terminal}
            title="Kernel Parameters"
            iconColor="bg-indigo-500/10 text-indigo-400"
            defaultOpen={false}
          >
            {data.kernel ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6">
                {Object.entries(data.kernel).map(([param, value]) => (
                  <KV key={param} label={param} value={value ?? "N/A"} mono />
                ))}
              </div>
            ) : (
              <p className="text-nfs-muted text-sm">No kernel data.</p>
            )}
          </Section>

          {/* ── Network ──────────────────────────────────────── */}
          <Section
            icon={Network}
            title="Network"
            iconColor="bg-cyan-500/10 text-cyan-400"
            badge={data.network?.interface}
            defaultOpen={false}
          >
            {data.network ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat
                  label="RX"
                  value={formatBytes(data.network.bytes_recv)}
                  color="text-green-400"
                  sub={`${data.network.packets_recv?.toLocaleString()} pkts`}
                />
                <Stat
                  label="TX"
                  value={formatBytes(data.network.bytes_sent)}
                  color="text-blue-400"
                  sub={`${data.network.packets_sent?.toLocaleString()} pkts`}
                />
                <Stat
                  label="Interface"
                  value={data.network.interface ?? "N/A"}
                  mono
                />
                <Stat
                  label="RPS CPUs"
                  value={data.network.rps_cpus ?? "N/A"}
                  mono
                />
              </div>
            ) : (
              <p className="text-nfs-muted text-sm">No network data.</p>
            )}
          </Section>

          {/* ── Storage ──────────────────────────────────────── */}
          <Section
            icon={HardDrive}
            title="Storage (/mnt)"
            iconColor="bg-orange-500/10 text-orange-400"
            badge={`${data.storage?.length ?? 0} mounts`}
          >
            {!data.storage || data.storage.length === 0 ? (
              <p className="text-nfs-muted text-sm">No /mnt storage found.</p>
            ) : (
              <div className="space-y-3">
                {data.storage.map((s, i) => {
                  const pct = parseInt(s.use_percent) || 0;
                  return (
                    <div
                      key={i}
                      className="bg-nfs-input border border-nfs-border rounded-lg p-3"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <code className="text-xs font-mono text-white truncate mr-2">
                          {s.mount_point}
                        </code>
                        <span className="text-xs text-nfs-muted whitespace-nowrap">
                          {s.filesystem}
                        </span>
                      </div>
                      <ProgressBar
                        percent={pct}
                        label={`${formatBytes(s.used)} / ${formatBytes(s.size)} (${formatBytes(s.avail)} free)`}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* ── Docker ───────────────────────────────────────── */}
          <Section
            icon={Container}
            title="Docker Containers"
            iconColor="bg-sky-500/10 text-sky-400"
            badge={`${data.docker?.length ?? 0} running`}
            defaultOpen={false}
          >
            {!data.docker || data.docker.length === 0 ? (
              <p className="text-nfs-muted text-sm">
                No running containers found.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-nfs-muted border-b border-nfs-border">
                      <th className="pb-2 font-medium">Name</th>
                      <th className="pb-2 font-medium">Image</th>
                      <th className="pb-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.docker.map((c, i) => (
                      <tr key={i} className="border-b border-nfs-border/30">
                        <td className="py-2 font-mono text-white">{c.name}</td>
                        <td className="py-2 font-mono text-nfs-muted">
                          {c.image}
                        </td>
                        <td className="py-2">
                          <span
                            className={`text-xs px-2 py-0.5 rounded ${
                              c.status?.toLowerCase().includes("up")
                                ? "bg-green-500/10 text-green-400"
                                : "bg-red-500/10 text-red-400"
                            }`}
                          >
                            {c.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* ── Database ─────────────────────────────────────── */}
          <Section
            icon={Database}
            title="Database Config"
            iconColor="bg-teal-500/10 text-teal-400"
            defaultOpen={false}
          >
            {data.database?.mergerfs_configs?.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-nfs-muted mb-2 uppercase tracking-wider font-semibold">
                  MergerFS Configs
                </p>
                {data.database.mergerfs_configs.map((cfg, i) => (
                  <div
                    key={i}
                    className="bg-nfs-input border border-nfs-border rounded-lg p-3 mb-2"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-white">
                        {cfg.name}
                      </span>
                      <code className="text-xs text-nfs-primary font-mono">
                        {cfg.mount_point}
                      </code>
                    </div>
                    <p className="text-xs text-nfs-muted font-mono">
                      Sources: {cfg.sources}
                    </p>
                    <p className="text-xs text-nfs-muted font-mono break-all mt-1">
                      {cfg.options}
                    </p>
                  </div>
                ))}
              </div>
            )}
            {data.database?.nfs_mounts?.length > 0 && (
              <div>
                <p className="text-xs text-nfs-muted mb-2 uppercase tracking-wider font-semibold">
                  NFS Mounts
                </p>
                {data.database.nfs_mounts.map((m, i) => (
                  <div
                    key={i}
                    className="bg-nfs-input border border-nfs-border rounded-lg p-3 mb-2"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-white">
                        {m.name}
                      </span>
                      <code className="text-xs text-blue-400 font-mono">
                        {m.server}:{m.remote_path}
                      </code>
                      <span className="text-nfs-muted text-xs">→</span>
                      <code className="text-xs text-nfs-primary font-mono">
                        {m.local_path}
                      </code>
                    </div>
                    <p className="text-xs text-nfs-muted font-mono break-all">
                      {m.options}
                    </p>
                  </div>
                ))}
              </div>
            )}
            {!data.database?.mergerfs_configs?.length &&
              !data.database?.nfs_mounts?.length && (
                <p className="text-nfs-muted text-sm">
                  No database entries found.
                </p>
              )}
          </Section>
        </div>
      )}
    </div>
  );
}
