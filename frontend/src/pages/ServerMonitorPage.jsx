import { useState, useEffect, useRef } from "react";
import {
  Monitor,
  Plus,
  Trash2,
  Edit3,
  X,
  RefreshCw,
  Cpu,
  HardDrive,
  MemoryStick,
  Wifi,
  WifiOff,
  Clock,
  Server,
  Activity,
  Database,
  CheckCircle,
  AlertCircle,
  KeyRound,
  Upload,
  Download,
  ChevronDown,
  Shield,
  Layers,
  GitMerge,
} from "lucide-react";
import api from "../api/client";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmProvider";
import { useCachedState } from "../hooks/useCache";
import InfoBox from "../components/InfoBox";
import Toggle from "../components/Toggle";

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-nfs-card border border-nfs-border rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 pb-4 sticky top-0 bg-nfs-card z-10">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-nfs-muted hover:text-white hover:bg-nfs-input transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 pb-6">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="mb-3">
      <label className="block text-sm font-medium text-nfs-muted mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function ProgressBar({ value, color = "nfs-primary", label }) {
  const clampedValue = Math.min(100, Math.max(0, value || 0));
  const getColor = () => {
    if (clampedValue >= 90) return "bg-red-500";
    if (clampedValue >= 75) return "bg-amber-500";
    return `bg-${color}`;
  };
  return (
    <div>
      {label && (
        <div className="flex justify-between text-xs text-nfs-muted mb-1">
          <span>{label}</span>
          <span>{clampedValue.toFixed(1)}%</span>
        </div>
      )}
      <div className="h-2 bg-nfs-input rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${getColor()}`}
          style={{ width: `${clampedValue}%` }}
        />
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "text-nfs-primary",
}) {
  return (
    <div className="bg-nfs-input/50 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-3.5 h-3.5 ${color}`} />
        <span className="text-xs text-nfs-muted">{label}</span>
      </div>
      <p className="text-sm font-semibold text-white">{value ?? "—"}</p>
      {sub && <p className="text-[10px] text-nfs-muted mt-0.5">{sub}</p>}
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

const inputClass =
  "w-full bg-nfs-input border border-nfs-border rounded-lg px-3 py-2 text-sm text-white focus:border-nfs-primary focus:outline-none transition-colors";

export default function ServerMonitorPage() {
  const [servers, setServers] = useCachedState("monitor-servers", []);
  const [metrics, setMetrics] = useCachedState("monitor-metrics", {});
  const [sshKeys, setSSHKeys] = useCachedState("monitor-sshkeys", []);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [testing, setTesting] = useState(null);
  const [keysOpen, setKeysOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const intervalRef = useRef(null);
  const toast = useToast();
  const confirm = useConfirm();

  const fetchServers = async () => {
    try {
      const data = await api.getMonitorServers();
      setServers(data);
    } catch (e) {
      toast.error("Failed to load servers");
    }
  };

  const fetchMetrics = async () => {
    try {
      const data = await api.getMonitorMetrics();
      const map = {};
      data.forEach((m) => (map[m.server_id] = m));
      setMetrics(map);
    } catch {
      // silently fail on metric fetch
    }
  };

  const fetchAll = async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    await fetchServers();
    await fetchMetrics();
    await fetchSSHKeys();
    if (showSpinner) setRefreshing(false);
  };

  const fetchSSHKeys = async () => {
    try {
      const data = await api.getSSHKeys();
      setSSHKeys(data);
    } catch {
      // silently fail
    }
  };

  const handleUploadKey = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await api.uploadSSHKey(file);
      toast.success(`SSH key "${file.name}" uploaded`);
      await fetchSSHKeys();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDownloadKey = async (name) => {
    try {
      const url = api.downloadSSHKey(name);
      const headers = {};
      const token = localStorage.getItem("token");
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const apiKey = localStorage.getItem("apiKey");
      if (apiKey) headers["X-API-Key"] = apiKey;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDeleteKey = async (name) => {
    const ok = await confirm({
      title: "Delete SSH Key",
      message: `Delete key "${name}"? This cannot be undone.`,
      confirmText: "Delete",
      type: "danger",
    });
    if (!ok) return;
    try {
      await api.deleteSSHKey(name);
      toast.success(`Key "${name}" deleted`);
      await fetchSSHKeys();
    } catch (err) {
      toast.error(err.message);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchAll().finally(() => setLoading(false));
    // Auto-refresh metrics every 30 seconds
    intervalRef.current = setInterval(fetchMetrics, 30000);
    return () => clearInterval(intervalRef.current);
  }, []);

  const openCreate = () => {
    setForm({
      name: "",
      host: "",
      port: 22,
      username: "root",
      ssh_key_path: "/config/ssh/id_rsa",
      enabled: true,
    });
    setModal("create");
  };

  const openEdit = (s) => {
    setForm({ ...s });
    setModal("edit");
  };

  const handleSave = async () => {
    try {
      if (modal === "create") {
        await api.createMonitorServer(form);
        toast.success("Server added");
      } else {
        await api.updateMonitorServer(form.id, form);
        toast.success("Server updated");
      }
      setModal(null);
      await fetchAll();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleDelete = async (s) => {
    const ok = await confirm({
      title: "Delete Server",
      message: `Remove "${s.name}" from monitoring?`,
      confirmText: "Delete",
      type: "danger",
    });
    if (!ok) return;
    try {
      await api.deleteMonitorServer(s.id);
      toast.success("Server removed");
      await fetchAll();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleTest = async (s) => {
    setTesting(s.id);
    try {
      const result = await api.testMonitorServer(s.id);
      if (result.success) {
        toast.success(`Connection OK — hostname: ${result.hostname}`);
      } else {
        toast.error(`Connection failed: ${result.error}`);
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setTesting(null);
    }
  };

  const formFields = (
    <div className="space-y-3">
      <Field label="Name">
        <input
          className={inputClass}
          value={form.name || ""}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="My Server"
        />
      </Field>
      <Field label="Host / IP">
        <input
          className={inputClass}
          value={form.host || ""}
          onChange={(e) => setForm({ ...form, host: e.target.value })}
          placeholder="192.168.1.100"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="SSH Port">
          <input
            className={inputClass}
            type="number"
            value={form.port || 22}
            onChange={(e) =>
              setForm({ ...form, port: parseInt(e.target.value) || 22 })
            }
          />
        </Field>
        <Field label="Username">
          <input
            className={inputClass}
            value={form.username || ""}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            placeholder="root"
          />
        </Field>
      </div>
      <Field label="SSH Key">
        <select
          className={inputClass}
          value={form.ssh_key_path || ""}
          onChange={(e) => setForm({ ...form, ssh_key_path: e.target.value })}
        >
          <option value="">Select SSH Key...</option>
          {sshKeys.map((k) => (
            <option key={k.name} value={`/config/ssh/${k.name}`}>
              {k.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex gap-4 pt-1">
        <Toggle
          checked={form.enabled ?? true}
          onChange={(val) => setForm({ ...form, enabled: val })}
          label="Enabled"
        />
      </div>
      <div className="flex justify-end gap-3 pt-3">
        <button
          onClick={() => setModal(null)}
          className="flex items-center gap-2 px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium transition-all"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium transition-all"
        >
          {modal === "create" ? "Add Server" : "Save Changes"}
        </button>
      </div>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <div className="p-2 rounded-lg bg-nfs-primary/10">
            <Monitor className="w-5 h-5 text-nfs-primary" />
          </div>
          Server Monitor
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium transition-all"
          >
            <Plus className="w-4 h-4 text-nfs-primary" />
            Add Server
          </button>
          <button
            onClick={() => fetchAll(true)}
            className="flex items-center gap-2 px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium transition-all"
          >
            <RefreshCw
              className={`w-4 h-4 text-nfs-primary ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>
      </div>

      {/* Info Box */}
      <InfoBox type="primary" className="mb-6">
        <strong>Remote Server Monitoring</strong> via SSH. Servers are polled
        every 30s for CPU, RAM, Disk, Network and ZFS ARC stats. SSH keys must
        be mounted at{" "}
        <code className="px-1.5 py-0.5 bg-nfs-primary/20 rounded text-nfs-primary text-xs font-mono">
          /config/ssh/
        </code>
        .
      </InfoBox>

      {/* SSH Keys Section */}
      <div className="bg-nfs-card border border-nfs-border rounded-xl mb-6 overflow-hidden">
        <button
          onClick={() => setKeysOpen(!keysOpen)}
          className="flex items-center gap-3 w-full p-4 text-left hover:bg-nfs-input/30 transition-colors"
        >
          <div className="p-2 rounded-lg bg-nfs-primary/10">
            <KeyRound className="w-4 h-4 text-nfs-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-white">SSH Keys</h3>
            <p className="text-xs text-nfs-muted">
              {sshKeys.length} key{sshKeys.length !== 1 ? "s" : ""} in
              /config/ssh/
            </p>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-nfs-muted transition-transform ${keysOpen ? "rotate-180" : ""}`}
          />
        </button>
        {keysOpen && (
          <div className="border-t border-nfs-border p-4">
            <div className="flex items-center gap-2 mb-3">
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleUploadKey}
                className="hidden"
                accept=".pem,.key,.pub,.ppk,*"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 px-3 py-1.5 bg-nfs-input border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-xs font-medium transition-all"
              >
                {uploading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-nfs-primary" />
                ) : (
                  <Upload className="w-3.5 h-3.5 text-nfs-primary" />
                )}
                Upload Key
              </button>
            </div>
            {sshKeys.length === 0 ? (
              <InfoBox type="warning">
                No SSH keys found. Upload a key to get started.
              </InfoBox>
            ) : (
              <div className="space-y-1.5">
                {sshKeys.map((k) => (
                  <div
                    key={k.name}
                    className="flex items-center justify-between bg-nfs-input/50 rounded-lg px-3 py-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <KeyRound className="w-3.5 h-3.5 text-nfs-muted flex-shrink-0" />
                      <span className="text-sm text-white font-mono truncate">
                        {k.name}
                      </span>
                      <span className="text-[10px] text-nfs-muted flex-shrink-0">
                        {k.size}B · {k.permissions}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleDownloadKey(k.name)}
                        className="p-1.5 rounded-lg text-nfs-muted hover:text-nfs-primary hover:bg-nfs-input transition-colors"
                        title="Download"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteKey(k.name)}
                        className="p-1.5 rounded-lg text-nfs-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {loading && servers.length === 0 ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-nfs-primary/30 border-t-nfs-primary rounded-full animate-spin" />
        </div>
      ) : servers.length === 0 ? (
        <div className="bg-nfs-card border border-nfs-border rounded-xl p-12 text-center">
          <Server className="w-12 h-12 text-nfs-muted mx-auto mb-4 opacity-30" />
          <p className="text-nfs-muted mb-4">No servers configured</p>
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-all mx-auto"
          >
            <Plus className="w-4 h-4 text-nfs-primary" />
            Add Server
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {servers.map((s) => {
            const m = metrics[s.id];
            const online = m?.online ?? false;
            return (
              <div
                key={s.id}
                className="bg-nfs-card border border-nfs-border rounded-xl overflow-hidden"
              >
                {/* Server Header */}
                <div className="flex items-center justify-between p-4 border-b border-nfs-border">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-lg ${online ? "bg-emerald-500/10" : "bg-red-500/10"}`}
                    >
                      {online ? (
                        <Wifi className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <WifiOff className="w-4 h-4 text-red-400" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">{s.name}</h3>
                      <p className="text-xs text-nfs-muted">
                        {s.host}:{s.port} · {s.username}
                      </p>
                    </div>
                    {!s.enabled && (
                      <span className="px-2 py-0.5 bg-nfs-input text-nfs-muted text-[10px] font-bold uppercase rounded">
                        Disabled
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleTest(s)}
                      disabled={testing === s.id}
                      className="p-2 rounded-lg text-nfs-muted hover:text-nfs-primary hover:bg-nfs-input transition-colors"
                      title="Test Connection"
                    >
                      {testing === s.id ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Activity className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => openEdit(s)}
                      className="p-2 rounded-lg text-nfs-muted hover:text-nfs-primary hover:bg-nfs-input transition-colors"
                      title="Edit"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(s)}
                      className="p-2 rounded-lg text-nfs-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Metrics */}
                {online ? (
                  <div className="p-4">
                    {/* Top row: hostname + uptime */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs text-nfs-muted">
                        <Server className="w-3 h-3 inline mr-1" />
                        {m.hostname}
                      </span>
                      {m.uptime_human && (
                        <span className="text-xs text-nfs-muted">
                          <Clock className="w-3 h-3 inline mr-1" />
                          Uptime: {m.uptime_human}
                        </span>
                      )}
                    </div>

                    {/* CPU + Memory bars */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                      <ProgressBar
                        value={m.cpu_usage}
                        label={`CPU (${m.cpu_cores || "?"} cores)`}
                      />
                      <ProgressBar
                        value={m.mem_usage_pct}
                        label={`RAM (${m.mem_used_mb?.toFixed(0) || "?"}MB / ${m.mem_total_mb?.toFixed(0) || "?"}MB)`}
                      />
                    </div>

                    {/* Metric cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <MetricCard
                        icon={Cpu}
                        label="Load (1/5/15)"
                        value={
                          m.load_1 !== null
                            ? `${m.load_1} / ${m.load_5} / ${m.load_15}`
                            : null
                        }
                      />
                      <MetricCard
                        icon={Activity}
                        label="Network RX / TX"
                        value={
                          m.net_rx_bytes !== null
                            ? `${formatBytes(m.net_rx_bytes)} / ${formatBytes(m.net_tx_bytes)}`
                            : null
                        }
                        color="text-blue-400"
                      />
                      {m.arc_size_mb !== null && (
                        <MetricCard
                          icon={Database}
                          label="ZFS ARC"
                          value={`${m.arc_size_mb} MB`}
                          sub={
                            m.arc_hit_pct !== null
                              ? `Hit Rate: ${m.arc_hit_pct}%`
                              : null
                          }
                          color="text-purple-400"
                        />
                      )}
                      {m.disks && m.disks.length > 0 && (
                        <MetricCard
                          icon={HardDrive}
                          label={`Disks (${m.disks.length})`}
                          value={m.disks[0]?.usage_pct || "—"}
                          sub={m.disks[0]?.mount}
                          color="text-amber-400"
                        />
                      )}
                    </div>

                    {/* Disk details */}
                    {m.disks && m.disks.length > 1 && (
                      <div className="mt-3 space-y-1.5">
                        <p className="text-xs text-nfs-muted font-medium">
                          All Disks
                        </p>
                        {m.disks.map((d, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between text-xs bg-nfs-input/50 rounded-lg px-3 py-1.5"
                          >
                            <span className="text-nfs-text font-mono">
                              {d.mount}
                            </span>
                            <span className="text-nfs-muted">
                              {d.used} / {d.total} ({d.usage_pct})
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* ZFS Pools */}
                    {m.zfs_pools && m.zfs_pools.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        <p className="text-xs text-nfs-muted font-medium flex items-center gap-1.5">
                          <Database className="w-3 h-3" /> ZFS Pools
                        </p>
                        {m.zfs_pools.map((pool, i) => (
                          <div
                            key={i}
                            className="bg-nfs-input/50 rounded-lg px-3 py-2"
                          >
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <span className="text-white font-semibold">
                                  {pool.name}
                                </span>
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                    pool.health === "ONLINE"
                                      ? "bg-emerald-500/15 text-emerald-400"
                                      : pool.health === "DEGRADED"
                                        ? "bg-amber-500/15 text-amber-400"
                                        : "bg-red-500/15 text-red-400"
                                  }`}
                                >
                                  {pool.health}
                                </span>
                              </div>
                              <span className="text-nfs-muted">
                                {pool.allocated} / {pool.size} (
                                {pool.capacity_pct}%)
                              </span>
                            </div>
                            {/* Pool disks */}
                            {m.zfs_pool_disks &&
                              m.zfs_pool_disks[pool.name] && (
                                <div className="mt-1.5 flex flex-wrap gap-1">
                                  {m.zfs_pool_disks[pool.name].map((d, j) => (
                                    <span
                                      key={j}
                                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                                        d.state === "online"
                                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                          : d.state === "degraded"
                                            ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                            : "bg-red-500/10 text-red-400 border-red-500/20"
                                      }`}
                                    >
                                      <span
                                        className={`w-1 h-1 rounded-full ${
                                          d.state === "online"
                                            ? "bg-emerald-400"
                                            : d.state === "degraded"
                                              ? "bg-amber-400"
                                              : "bg-red-400"
                                        }`}
                                      />
                                      {d.name}
                                    </span>
                                  ))}
                                </div>
                              )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* RAID Arrays */}
                    {m.raid_arrays && m.raid_arrays.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        <p className="text-xs text-nfs-muted font-medium flex items-center gap-1.5">
                          <Shield className="w-3 h-3" /> RAID Arrays
                        </p>
                        {m.raid_arrays.map((raid, i) => (
                          <div
                            key={i}
                            className="bg-nfs-input/50 rounded-lg px-3 py-2"
                          >
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <span className="text-white font-semibold">
                                  {raid.device}
                                </span>
                                <span className="text-nfs-muted uppercase">
                                  {raid.level}
                                </span>
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                    raid.health === "healthy"
                                      ? "bg-emerald-500/15 text-emerald-400"
                                      : raid.health === "recovering"
                                        ? "bg-amber-500/15 text-amber-400"
                                        : "bg-red-500/15 text-red-400"
                                  }`}
                                >
                                  {raid.health || raid.status}
                                </span>
                              </div>
                              <span className="text-nfs-muted">
                                {raid.active_disks !== undefined
                                  ? `${raid.active_disks}/${raid.total_disks} active`
                                  : ""}
                                {raid.size_gb ? ` · ${raid.size_gb} GB` : ""}
                              </span>
                            </div>
                            {raid.recovery_pct !== undefined && (
                              <div className="mt-1.5">
                                <div className="flex items-center justify-between text-[10px] text-amber-400 mb-0.5">
                                  <span>Rebuilding...</span>
                                  <span>{raid.recovery_pct}%</span>
                                </div>
                                <div className="w-full h-1.5 bg-nfs-border rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-amber-400 rounded-full transition-all"
                                    style={{ width: `${raid.recovery_pct}%` }}
                                  />
                                </div>
                              </div>
                            )}
                            {raid.disks && raid.disks.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {raid.disks.map((d, j) => (
                                  <span
                                    key={j}
                                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                                      d.state === "active"
                                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                        : d.state === "spare"
                                          ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                          : "bg-red-500/10 text-red-400 border-red-500/20"
                                    }`}
                                  >
                                    <span
                                      className={`w-1 h-1 rounded-full ${
                                        d.state === "active"
                                          ? "bg-emerald-400"
                                          : d.state === "spare"
                                            ? "bg-blue-400"
                                            : "bg-red-400"
                                      }`}
                                    />
                                    {d.name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* UnionFS / MergerFS Mounts */}
                    {m.union_mounts && m.union_mounts.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        <p className="text-xs text-nfs-muted font-medium flex items-center gap-1.5">
                          <GitMerge className="w-3 h-3" /> Union Mounts
                        </p>
                        {m.union_mounts.map((u, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between text-xs bg-nfs-input/50 rounded-lg px-3 py-2"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-white font-mono">
                                {u.mount}
                              </span>
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-nfs-primary/15 text-nfs-primary border border-nfs-primary/20">
                                {u.type}
                              </span>
                            </div>
                            <span
                              className="text-nfs-muted text-[10px] font-mono max-w-[50%] truncate"
                              title={u.sources}
                            >
                              {u.sources}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4">
                    <div className="flex items-center gap-2 text-sm text-red-400">
                      <AlertCircle className="w-4 h-4" />
                      {m?.error || "Server offline or unreachable"}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {modal && (
        <Modal
          title={modal === "create" ? "Add Server" : "Edit Server"}
          onClose={() => setModal(null)}
        >
          {formFields}
        </Modal>
      )}
    </div>
  );
}
