import { useState, useEffect, useRef } from "react";
import {
  Activity,
  Cpu,
  HardDrive,
  MemoryStick,
  LayoutDashboard,
  Lock,
  Network,
  Shield,
  GitMerge,
  RefreshCw,
  Plus,
  Download,
  Upload,
  ScrollText,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import { useCachedState } from "../hooks/useCache";
import InfoBox from "../components/InfoBox";
import ProgressDialog from "../components/ProgressDialog";

const useAutoScroll = (deps) => {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, deps);
  return ref;
};

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
  const navigate = useNavigate();
  const [status, setStatus] = useCachedState("dash-status", null);
  const [stats, setStats] = useCachedState("dash-stats", null);
  const [nfsStatus, setNfsStatus] = useCachedState("dash-nfs", []);
  const [mergerStatus, setMergerStatus] = useCachedState("dash-merger", []);
  const [nfsExports, setNfsExports] = useCachedState("dash-exports", []);
  const [vpnStatus, setVpnStatus] = useCachedState("dash-vpn", []);
  const [kernelParams, setKernelParams] = useCachedState("dash-kernel", []);
  const [rpsXps, setRpsXps] = useCachedState("dash-rpsxps", null);
  const [firewallStatus, setFirewallStatus] = useCachedState(
    "dash-firewall",
    null,
  );
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState(null);
  const [recentLogs, setRecentLogs] = useState([]);
  const logsEndRef = useAutoScroll([recentLogs]);

  const fetchData = async () => {
    try {
      const [st, sys, nfs, merger, exports, vpn, kp, rps, fw, logData] =
        await Promise.all([
          api.getSystemStatus(),
          api.getSystemStats(),
          api.getNFSStatus().catch(() => []),
          api.getMergerFSStatus().catch(() => []),
          api.getNFSExportsStatus().catch(() => []),
          api.getAllVPNStatus().catch(() => []),
          api.getKernelParams().catch(() => []),
          api.getRpsXps().catch(() => null),
          api.getFirewallStatus().catch(() => null),
          api.getLogs(20).catch(() => []),
        ]);
      setStatus(st);
      setStats(sys);
      setNfsStatus(nfs);
      setMergerStatus(merger);
      setNfsExports(exports);
      setVpnStatus(vpn);
      setKernelParams(kp);
      setRpsXps(rps);
      setFirewallStatus(fw);
      setRecentLogs(logData);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10">
            <LayoutDashboard className="w-5 h-5 text-nfs-primary" />
          </div>
          Dashboard
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/nfs/client")}
            className="flex items-center gap-2 px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium transition-all"
          >
            <Download className="w-4 h-4 text-nfs-primary" />
            NFS Mount
          </button>
          <button
            onClick={() => navigate("/mergerfs")}
            className="flex items-center gap-2 px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium transition-all"
          >
            <GitMerge className="w-4 h-4 text-nfs-primary" />
            MergerFS
          </button>
          <button
            onClick={() => navigate("/nfs/exports")}
            className="flex items-center gap-2 px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium transition-all"
          >
            <Upload className="w-4 h-4 text-nfs-primary" />
            NFS Exports
          </button>
          <button
            onClick={() => navigate("/vpn")}
            className="flex items-center gap-2 px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium transition-all"
          >
            <Shield className="w-4 h-4 text-nfs-primary" />
            VPN
          </button>
          <button
            onClick={async () => {
              setRefreshing(true);
              setProgress({
                message: "Refreshing dashboard...",
                status: "loading",
              });
              try {
                await fetchData();
                setProgress({
                  message: "Dashboard refreshed",
                  status: "success",
                });
              } catch (e) {
                setProgress({
                  message: "Refresh failed",
                  status: "error",
                  detail: e.message,
                });
              }
              setRefreshing(false);
              setTimeout(() => setProgress(null), 1500);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium transition-all"
          >
            <RefreshCw
              className={`w-4 h-4 text-nfs-primary ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
          <div className="flex items-center gap-2 px-4 py-2 bg-nfs-card border border-nfs-border rounded-lg">
            <div
              className={`w-2 h-2 rounded-full ${status ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`}
            />
            <span className="text-sm text-nfs-muted">
              {status ? "System Online" : "Connecting..."}
            </span>
          </div>
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* NFS Mounts */}
        <div
          onClick={() => navigate("/nfs/client")}
          className="bg-nfs-card border border-nfs-border rounded-xl p-5 hover:border-nfs-muted transition-all cursor-pointer"
        >
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
            <InfoBox type="warning">No NFS mounts configured</InfoBox>
          ) : (
            <div className="space-y-2">
              {nfsStatus.map((m) => (
                <div
                  key={m.id}
                  className="bg-nfs-input/50 rounded-lg px-4 py-3"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium text-white">{m.name}</p>
                      <p className="text-xs text-nfs-muted">{m.local_path}</p>
                    </div>
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
                  <div className="flex flex-wrap gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        m.server_reachable
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          : "bg-red-500/15 text-red-400 border-red-500/30"
                      }`}
                    >
                      <span
                        className={`w-1 h-1 rounded-full ${m.server_reachable ? "bg-emerald-400" : "bg-red-400"}`}
                      />
                      Server {m.server_reachable ? "Online" : "Offline"}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        m.validated
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                      }`}
                    >
                      <span
                        className={`w-1 h-1 rounded-full ${m.validated ? "bg-emerald-400" : "bg-amber-400"}`}
                      />
                      {m.validated ? "Validated" : "Not Validated"}
                    </span>
                    {m.auto_mount && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-nfs-primary/15 text-nfs-primary border-nfs-primary/30">
                        Auto-Mount
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* MergerFS */}
        <div
          onClick={() => navigate("/mergerfs")}
          className="bg-nfs-card border border-nfs-border rounded-xl p-5 hover:border-nfs-muted transition-all cursor-pointer"
        >
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
            <InfoBox type="warning">No MergerFS configs configured</InfoBox>
          ) : (
            <div className="space-y-2">
              {mergerStatus.map((c) => (
                <div
                  key={c.id}
                  className="bg-nfs-input/50 rounded-lg px-4 py-3"
                >
                  <div className="flex items-center justify-between mb-2">
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
                  {c.auto_mount && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-purple-500/15 text-purple-400 border-purple-500/30">
                        Auto-Mount
                      </span>
                    </div>
                  )}
                  {c.mounted && c.used_percent != null && (
                    <div className="space-y-1.5">
                      <div className="w-full bg-nfs-dark/50 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            c.used_percent > 90
                              ? "bg-red-400"
                              : c.used_percent > 70
                                ? "bg-amber-400"
                                : "bg-emerald-400"
                          }`}
                          style={{ width: `${Math.min(c.used_percent, 100)}%` }}
                        />
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-blue-500/15 text-blue-400 border-blue-500/30">
                          {c.used_space} / {c.total_space}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                          {c.free_space} free
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            c.used_percent > 90
                              ? "bg-red-500/15 text-red-400 border-red-500/30"
                              : c.used_percent > 70
                                ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                                : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          }`}
                        >
                          {c.used_percent}%
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* NFS Exports */}
        <div
          onClick={() => navigate("/nfs/exports")}
          className="bg-nfs-card border border-nfs-border rounded-xl p-5 hover:border-nfs-muted transition-all cursor-pointer"
        >
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Upload className="w-4 h-4 text-blue-400" />
            </div>
            <h2 className="text-lg font-semibold text-white">NFS Exports</h2>
            <span className="ml-auto text-xs text-nfs-muted">
              {nfsExports.filter((e) => e.is_active).length} active
            </span>
          </div>
          {nfsExports.length === 0 ? (
            <InfoBox type="warning">No NFS exports configured</InfoBox>
          ) : (
            <div className="space-y-2">
              {nfsExports.map((e) => (
                <div
                  key={e.id}
                  className="bg-nfs-input/50 rounded-lg px-4 py-3"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium text-white">{e.name}</p>
                      <p className="text-xs text-nfs-muted">{e.export_path}</p>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border ${
                        e.is_active
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          : "bg-red-500/15 text-red-400 border-red-500/30"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${e.is_active ? "bg-emerald-400" : "bg-red-400"}`}
                      />
                      {e.is_active ? "Exported" : "Inactive"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-blue-500/15 text-blue-400 border-blue-500/30">
                      NFS v{e.nfs_version || "4.2"}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-purple-500/15 text-purple-400 border-purple-500/30">
                      {e.allowed_hosts || "*"}
                    </span>
                    {e.auto_enable && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-blue-500/15 text-blue-400 border-blue-500/30">
                        Auto-Enable
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* VPN, Firewall & Kernel Info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <div
          onClick={() => navigate("/vpn")}
          className="bg-nfs-card border border-nfs-border rounded-xl p-5 hover:border-nfs-muted transition-all cursor-pointer"
        >
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <Shield className="w-4 h-4 text-emerald-400" />
            </div>
            <h2 className="text-lg font-semibold text-white">VPN Status</h2>
            <span className="ml-auto text-xs text-nfs-muted">
              {vpnStatus.filter((v) => v.is_active).length} / {vpnStatus.length}{" "}
              active
            </span>
          </div>
          {vpnStatus.length === 0 ? (
            <InfoBox type="warning">No VPN tunnels configured</InfoBox>
          ) : (
            <div className="space-y-2">
              {vpnStatus.map((v) => (
                <InfoBox key={v.id} type={v.is_active ? "success" : "warning"}>
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        v.is_active
                          ? "bg-emerald-400 animate-pulse"
                          : "bg-amber-400"
                      }`}
                    />
                    <span className="font-medium">{v.name}</span>
                    <span className="opacity-60">·</span>
                    <span className="opacity-60 capitalize">{v.vpn_type}</span>
                    <span className="ml-auto">
                      {v.is_active ? "Connected" : "Not active"}
                    </span>
                  </div>
                </InfoBox>
              ))}
            </div>
          )}
        </div>

        {/* Firewall */}
        <div
          onClick={() => navigate("/settings?tab=firewall")}
          className="bg-nfs-card border border-nfs-border rounded-xl p-5 hover:border-nfs-muted transition-all cursor-pointer"
        >
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 rounded-lg bg-orange-500/10">
              <Lock className="w-4 h-4 text-orange-400" />
            </div>
            <h2 className="text-lg font-semibold text-white">Firewall</h2>
            {firewallStatus &&
              (firewallStatus.export_protection?.active ||
                firewallStatus.client_protection?.active) && (
                <span className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Active
                </span>
              )}
          </div>
          {!firewallStatus ? (
            <InfoBox type="warning">No firewall data available</InfoBox>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="text-[11px] font-medium text-nfs-muted uppercase tracking-wider mb-1.5">
                  Protection Status
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(() => {
                    const Badge = ({ active, label }) => (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          active
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                            : "bg-red-500/15 text-red-400 border-red-500/30"
                        }`}
                      >
                        <span
                          className={`w-1 h-1 rounded-full ${active ? "bg-emerald-400" : "bg-red-400"}`}
                        />
                        {label}
                      </span>
                    );
                    return (
                      <>
                        <Badge
                          active={firewallStatus.export_protection?.active}
                          label={`Export ${firewallStatus.export_protection?.active ? "Protected" : "Unprotected"}`}
                        />
                        <Badge
                          active={firewallStatus.client_protection?.active}
                          label={`Client ${firewallStatus.client_protection?.active ? "Protected" : "Unprotected"}`}
                        />
                        <Badge
                          active={firewallStatus.vpn_only}
                          label={`VPN-Only ${firewallStatus.vpn_only ? "ON" : "OFF"}`}
                        />
                      </>
                    );
                  })()}
                </div>
              </div>
              <div>
                <p className="text-[11px] font-medium text-nfs-muted uppercase tracking-wider mb-1.5">
                  Details
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(() => {
                    const Badge = ({ active, label }) => (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          active
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                            : "bg-red-500/15 text-red-400 border-red-500/30"
                        }`}
                      >
                        <span
                          className={`w-1 h-1 rounded-full ${active ? "bg-emerald-400" : "bg-red-400"}`}
                        />
                        {label}
                      </span>
                    );
                    return (
                      <>
                        <Badge
                          active={
                            firewallStatus.export_protection?.rules_count > 0
                          }
                          label={`${firewallStatus.export_protection?.rules_count || 0} Export Rules`}
                        />
                        <Badge
                          active={
                            firewallStatus.client_protection?.rules_count > 0
                          }
                          label={`${firewallStatus.client_protection?.rules_count || 0} Client Rules`}
                        />
                        {firewallStatus.vpn_interfaces?.length > 0 && (
                          <Badge
                            active={true}
                            label={`VPN: ${firewallStatus.vpn_interfaces.join(", ")}`}
                          />
                        )}
                        <Badge
                          active={true}
                          label={`Ports: ${firewallStatus.fixed_ports?.mountd}, ${firewallStatus.fixed_ports?.nlockmgr}, ${firewallStatus.fixed_ports?.statd}`}
                        />
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Streaming Optimization */}
        <div
          onClick={() => navigate("/settings?tab=system")}
          className="bg-nfs-card border border-nfs-border rounded-xl p-5 hover:border-nfs-muted transition-all cursor-pointer"
        >
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 rounded-lg bg-nfs-primary/10">
              <Cpu className="w-4 h-4 text-nfs-primary" />
            </div>
            <h2 className="text-lg font-semibold text-white">
              Streaming Optimization
            </h2>
            {kernelParams.length > 0 && (
              <span className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Active
              </span>
            )}
          </div>

          {/* Kernel Tuning */}
          {(() => {
            const getParam = (name) =>
              kernelParams.find((p) => p.name === name)?.value;
            const congestion = getParam("net.ipv4.tcp_congestion_control");
            const slotTable = getParam("sunrpc.tcp_max_slot_table_entries");
            const rmemMax = getParam("net.core.rmem_max");
            const wmemMax = getParam("net.core.wmem_max");
            const qdisc = getParam("net.core.default_qdisc");
            const dirtyRatio = getParam("vm.dirty_ratio");
            const cachePress = getParam("vm.vfs_cache_pressure");

            const isBBR = congestion === "bbr";
            const isHighSlots = slotTable && parseInt(slotTable) >= 128;
            const isHighBuf = rmemMax && parseInt(rmemMax) >= 16777216;
            const rpsActive =
              rpsXps &&
              rpsXps.rps_cpus &&
              rpsXps.rps_cpus !== "0" &&
              rpsXps.rps_cpus !== "00";
            const xpsActive =
              rpsXps &&
              rpsXps.xps_cpus &&
              rpsXps.xps_cpus !== "0" &&
              rpsXps.xps_cpus !== "00";

            const Badge = ({ active, label }) => (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  active
                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                    : "bg-red-500/15 text-red-400 border-red-500/30"
                }`}
              >
                <span
                  className={`w-1 h-1 rounded-full ${active ? "bg-emerald-400" : "bg-red-400"}`}
                />
                {label}
              </span>
            );

            return (
              <div className="space-y-3">
                {kernelParams.length === 0 ? (
                  <InfoBox type="warning">
                    No kernel tuning data available
                  </InfoBox>
                ) : (
                  <>
                    <div>
                      <p className="text-[11px] font-medium text-nfs-muted uppercase tracking-wider mb-1.5">
                        Kernel Tuning
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge
                          active={isBBR}
                          label={
                            congestion
                              ? `TCP ${congestion.toUpperCase()}`
                              : "TCP Not Set"
                          }
                        />
                        <Badge
                          active={isHighSlots}
                          label={
                            slotTable
                              ? `NFS Slots ${slotTable}`
                              : "NFS Slots Not Set"
                          }
                        />
                        <Badge
                          active={isHighBuf}
                          label={
                            rmemMax
                              ? `Buffer ${parseInt(rmemMax) / 1048576}MB`
                              : "Buffer Not Set"
                          }
                        />
                        <Badge
                          active={!!qdisc}
                          label={qdisc ? `QDisc ${qdisc}` : "QDisc Not Set"}
                        />
                        <Badge
                          active={dirtyRatio && parseInt(dirtyRatio) >= 30}
                          label={
                            dirtyRatio
                              ? `Dirty ${dirtyRatio}%`
                              : "Dirty Not Set"
                          }
                        />
                        <Badge
                          active={cachePress && parseInt(cachePress) <= 50}
                          label={
                            cachePress
                              ? `Cache Press ${cachePress}`
                              : "Cache Press Not Set"
                          }
                        />
                      </div>
                    </div>

                    <div>
                      <p className="text-[11px] font-medium text-nfs-muted uppercase tracking-wider mb-1.5">
                        CPU Load Balancing
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge
                          active={rpsActive}
                          label={`RPS ${rpsActive ? "Enabled" : "Disabled"}`}
                        />
                        <Badge
                          active={xpsActive}
                          label={`XPS ${xpsActive ? "Enabled" : "Disabled"}`}
                        />
                        {rpsXps && (
                          <>
                            <Badge
                              active={true}
                              label={`${rpsXps.cpu_count} CPUs`}
                            />
                            <Badge
                              active={!!rpsXps.interface}
                              label={rpsXps.interface || "No Interface"}
                            />
                            <Badge
                              active={
                                rpsXps.mtu && parseInt(rpsXps.mtu) >= 1500
                              }
                              label={
                                rpsXps.mtu ? `MTU ${rpsXps.mtu}` : "MTU Not Set"
                              }
                            />
                          </>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Live Logs */}
      <div className="bg-nfs-card border border-nfs-border rounded-xl p-5 mt-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <ScrollText className="w-4 h-4 text-purple-400" />
            </div>
            <h2 className="text-lg font-semibold text-white">Recent Logs</h2>
            <span className="text-xs text-nfs-muted">
              Last {recentLogs.length} entries
            </span>
          </div>
          <button
            onClick={() => navigate("/logs")}
            className="text-sm text-nfs-primary hover:text-nfs-primary/80 transition-colors"
          >
            View All →
          </button>
        </div>
        <div className="bg-[#0d1117] rounded-lg overflow-hidden">
          <div
            ref={logsEndRef}
            className="overflow-auto max-h-[420px] p-3 font-mono text-[11px] leading-relaxed"
          >
            {recentLogs.length === 0 ? (
              <div className="text-center text-nfs-muted py-8">
                No log entries
              </div>
            ) : (
              recentLogs.map((entry, i) => (
                <div
                  key={i}
                  className="flex gap-2 py-0.5 hover:bg-white/[0.02]"
                >
                  <span className="text-nfs-muted/50 shrink-0 w-[52px]">
                    {entry.timestamp ? entry.timestamp.split(" ")[1] || "" : ""}
                  </span>
                  <span
                    className={`shrink-0 w-[60px] text-center rounded px-0.5 ${
                      entry.level === "ERROR" || entry.level === "CRITICAL"
                        ? "text-red-400 bg-red-400/10"
                        : entry.level === "WARNING"
                          ? "text-yellow-400 bg-yellow-400/10"
                          : entry.level === "INFO"
                            ? "text-emerald-400 bg-emerald-400/10"
                            : "text-cyan-400 bg-cyan-400/10"
                    }`}
                  >
                    {entry.level}
                  </span>
                  <span className="text-slate-300 truncate">
                    {entry.message}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <ProgressDialog progress={progress} />
    </div>
  );
}
