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

function StatCard({ icon: Icon, label, value, sub, color = "blue" }) {
  const colors = {
    blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    green: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    purple: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    orange: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    red: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return (
    <div className={`rounded-xl border p-5 ${colors[color]}`}>
      <div className="flex items-center justify-between mb-3">
        <Icon className="w-5 h-5 opacity-80" />
        <span className="text-xs opacity-60 uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs opacity-60 mt-1">{sub}</p>}
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
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${status ? "bg-emerald-500" : "bg-red-500"}`}
          />
          <span className="text-sm text-gray-400">
            {status ? "System Online" : "Connecting..."}
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-6 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={Activity}
          label="Uptime"
          value={status ? formatUptime(status.uptime) : "—"}
          color="blue"
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
          color="orange"
        />
        <StatCard
          icon={Network}
          label="Network I/O"
          value={stats ? `↓${formatBytes(stats.network_io.bytes_recv)}` : "—"}
          sub={stats ? `↑${formatBytes(stats.network_io.bytes_sent)}` : ""}
          color="green"
        />
      </div>

      {/* Mount Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* NFS Mounts */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <HardDrive className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-white">NFS Mounts</h2>
            <span className="ml-auto text-sm text-gray-500">
              {status?.nfs_mounts_active || 0} aktiv
            </span>
          </div>
          {nfsStatus.length === 0 ? (
            <p className="text-gray-500 text-sm">
              Keine NFS Mounts konfiguriert
            </p>
          ) : (
            <div className="space-y-2">
              {nfsStatus.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between bg-gray-800/50 rounded-lg px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-white">{m.name}</p>
                    <p className="text-xs text-gray-500">{m.local_path}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5">
                      <Server className="w-3.5 h-3.5 text-gray-500" />
                      <span
                        className={`w-2 h-2 rounded-full ${
                          m.server_reachable ? "bg-emerald-500" : "bg-red-500"
                        }`}
                      />
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        m.mounted
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-red-500/20 text-red-400"
                      }`}
                    >
                      {m.mounted ? "Mounted" : "Unmounted"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* MergerFS */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <GitMerge className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-semibold text-white">MergerFS</h2>
            <span className="ml-auto text-sm text-gray-500">
              {status?.mergerfs_mounts_active || 0} aktiv
            </span>
          </div>
          {mergerStatus.length === 0 ? (
            <p className="text-gray-500 text-sm">
              Keine MergerFS Configs konfiguriert
            </p>
          ) : (
            <div className="space-y-2">
              {mergerStatus.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between bg-gray-800/50 rounded-lg px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-white">{c.name}</p>
                    <p className="text-xs text-gray-500">{c.mount_point}</p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      c.mounted
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-red-500/20 text-red-400"
                    }`}
                  >
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
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-green-400" />
            <h2 className="text-lg font-semibold text-white">VPN Status</h2>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full ${
                status?.vpn_active ? "bg-emerald-500" : "bg-gray-600"
              }`}
            />
            <span className="text-sm text-gray-300">
              WireGuard: {status?.vpn_active ? "Verbunden" : "Nicht aktiv"}
            </span>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Cpu className="w-5 h-5 text-orange-400" />
            <h2 className="text-lg font-semibold text-white">
              Streaming Optimierung
            </h2>
          </div>
          <p className="text-sm text-gray-400">
            Kernel-Tuning aktiv für 300+ gleichzeitige Streams. NFS nconnect=16,
            1MB R/W Buffer.
          </p>
        </div>
      </div>
    </div>
  );
}
