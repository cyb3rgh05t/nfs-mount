import { useState, useEffect } from "react";
import {
  Activity,
  Cpu,
  HardDrive,
  MemoryStick,
  Network,
  Shield,
  GitMerge,
  Server,
} from "lucide-react";
import api from "../api/client";

function StatCard({ icon: Icon, label, value, sub, color = "nfs-primary" }) {
  const colorMap = {
    "nfs-primary": "bg-nfs-primary/10 text-nfs-primary",
    emerald: "bg-emerald-500/10 text-emerald-400",
    purple: "bg-purple-500/10 text-purple-400",
    blue: "bg-blue-500/10 text-blue-400",
  };
  return (
    <div className="bg-nfs-card border border-nfs-border rounded-xl p-4 min-w-0 hover:border-nfs-primary/30 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <div
          className={`p-2 rounded-lg ${colorMap[color] || colorMap["nfs-primary"]}`}
        >
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-[10px] font-semibold text-nfs-muted uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className="text-xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-nfs-muted mt-1">{sub}</p>}
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function DashboardPage() {
  const [status, setStatus] = useState(null);
  const [stats, setStats] = useState(null);
  const [nfsStatus, setNfsStatus] = useState([]);
  const [mergerStatus, setMergerStatus] = useState([]);
  const [error, setError] = useState("");

  const fetchData = async () => {
    try {
      const [st, sys, nfs, merger] = await Promise.all([
        api.getSystemStatus(),
        api.getSystemStats(),
        api.getNFSStatus().catch(() => []),
        api.getMergerFSStatus().catch(() => []),
      ]);
      setStatus(st);
      setStats(sys);
      setNfsStatus(nfs);
      setMergerStatus(merger);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          Dashboard
        </h1>
        <div className="flex items-center gap-2 px-4 py-2 bg-nfs-card border border-nfs-border rounded-lg">
          <div
            className={`w-2 h-2 rounded-full ${status ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`}
          />
          <span className="text-sm text-nfs-muted">
            {status ? "System Online" : "Connecting..."}
          </span>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm mb-6">
          {error}
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={Activity}
          label="Uptime"
          value={status ? formatUptime(status.uptime) : "—"}
          color="nfs-primary"
        />
        <StatCard
          icon={Cpu}
          label="CPU"
          value={stats ? `${stats.cpu_percent}%` : "—"}
          sub={
            stats
              ? `Load: ${stats.load_avg.map((l) => l.toFixed(2)).join(", ")}`
              : ""
          }
          color="purple"
        />
        <StatCard
          icon={MemoryStick}
          label="Memory"
          value={stats ? `${stats.memory_percent}%` : "—"}
          sub={
            stats
              ? `${formatBytes(stats.memory_used)} / ${formatBytes(stats.memory_total)}`
              : ""
          }
          color="blue"
        />
        <StatCard
          icon={Network}
          label="Network I/O"
          value={stats ? `↓${formatBytes(stats.network_io.bytes_recv)}` : "—"}
          sub={stats ? `↑${formatBytes(stats.network_io.bytes_sent)}` : ""}
          color="emerald"
        />
      </div>

      {/* Mount Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* NFS Mounts */}
        <div className="bg-nfs-card border border-nfs-border rounded-xl p-5 hover:border-nfs-muted transition-all">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 rounded-lg bg-nfs-primary/10">
              <HardDrive className="w-4 h-4 text-nfs-primary" />
            </div>
            <h2 className="text-lg font-semibold text-white">NFS Mounts</h2>
            <span className="ml-auto text-xs text-nfs-muted">
              {status?.nfs_mounts_active || 0} active
            </span>
          </div>
          {nfsStatus.length === 0 ? (
            <p className="text-nfs-muted text-sm">No NFS mounts configured</p>
          ) : (
            <div className="space-y-2">
              {nfsStatus.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between bg-nfs-input/50 rounded-lg px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-white">{m.name}</p>
                    <p className="text-xs text-nfs-muted">{m.local_path}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5">
                      <Server className="w-3.5 h-3.5 text-nfs-muted" />
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          m.server_reachable ? "bg-emerald-400" : "bg-red-400"
                        }`}
                      />
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border ${
                        m.mounted
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          : "bg-red-500/15 text-red-400 border-red-500/30"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${m.mounted ? "bg-emerald-400" : "bg-red-400"}`}
                      />
                      {m.mounted ? "Mounted" : "Unmounted"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* MergerFS */}
        <div className="bg-nfs-card border border-nfs-border rounded-xl p-5 hover:border-nfs-muted transition-all">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <GitMerge className="w-4 h-4 text-purple-400" />
            </div>
            <h2 className="text-lg font-semibold text-white">MergerFS</h2>
            <span className="ml-auto text-xs text-nfs-muted">
              {status?.mergerfs_mounts_active || 0} active
            </span>
          </div>
          {mergerStatus.length === 0 ? (
            <p className="text-nfs-muted text-sm">
              No MergerFS configs configured
            </p>
          ) : (
            <div className="space-y-2">
              {mergerStatus.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between bg-nfs-input/50 rounded-lg px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-white">{c.name}</p>
                    <p className="text-xs text-nfs-muted">{c.mount_point}</p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border ${
                      c.mounted
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                        : "bg-red-500/15 text-red-400 border-red-500/30"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${c.mounted ? "bg-emerald-400" : "bg-red-400"}`}
                    />
                    {c.mounted ? "Mounted" : "Unmounted"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* VPN & Kernel Info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div className="bg-nfs-card border border-nfs-border rounded-xl p-5 hover:border-nfs-muted transition-all">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <Shield className="w-4 h-4 text-emerald-400" />
            </div>
            <h2 className="text-lg font-semibold text-white">VPN Status</h2>
          </div>
          <div className="flex items-center gap-2 bg-nfs-input/50 rounded-lg px-4 py-3">
            <div
              className={`w-2 h-2 rounded-full ${
                status?.vpn_active
                  ? "bg-emerald-400 animate-pulse"
                  : "bg-nfs-muted"
              }`}
            />
            <span className="text-sm text-nfs-text">
              WireGuard: {status?.vpn_active ? "Connected" : "Not active"}
            </span>
          </div>
        </div>

        <div className="bg-nfs-card border border-nfs-border rounded-xl p-5 hover:border-nfs-muted transition-all">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 rounded-lg bg-nfs-primary/10">
              <Cpu className="w-4 h-4 text-nfs-primary" />
            </div>
            <h2 className="text-lg font-semibold text-white">
              Streaming Optimization
            </h2>
          </div>
          <p className="text-sm text-nfs-muted leading-relaxed">
            Kernel tuning active for 300+ simultaneous streams. NFS nconnect=16,
            1MB R/W Buffer.
          </p>
        </div>
      </div>
    </div>
  );
}
