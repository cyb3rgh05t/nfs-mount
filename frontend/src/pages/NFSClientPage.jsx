import { useState, useEffect } from "react";
import {
  HardDrive,
  Plus,
  Play,
  Square,
  Trash2,
  Edit3,
  X,
  Zap,
  Download,
  RefreshCw,
  Save,
} from "lucide-react";
import api from "../api/client";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmProvider";
import { useCachedState } from "../hooks/useCache";
import InfoBox from "../components/InfoBox";
import Toggle from "../components/Toggle";

const DEFAULT_MOUNT_OPTIONS =
  "vers=4.2,proto=tcp,hard,nconnect=16,rsize=1048576,wsize=1048576,async,noatime,nocto,ac,actimeo=3600";

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-nfs-card border border-nfs-border rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-6 pb-4">
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

const inputClass =
  "w-full px-4 py-2.5 bg-nfs-input border border-nfs-border rounded-lg text-white placeholder-nfs-muted text-sm focus:outline-none focus:ring-2 focus:ring-nfs-primary focus:border-transparent";

export default function NFSClientPage() {
  const [mounts, setMounts] = useCachedState("nfs-mounts", []);
  const [statuses, setStatuses] = useCachedState("nfs-statuses", {});
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();
  const [form, setForm] = useState({
    name: "",
    server_ip: "",
    remote_path: "/",
    local_path: "/mnt/",
    nfs_version: "4.2",
    options: DEFAULT_MOUNT_OPTIONS,
    check_file: "",
    auto_mount: true,
    enabled: true,
  });

  const fetchData = async () => {
    try {
      const [m, s] = await Promise.all([
        api.getNFSMounts(),
        api.getNFSStatus().catch(() => []),
      ]);
      setMounts(m);
      const statusMap = {};
      s.forEach((st) => (statusMap[st.id] = st));
      setStatuses(statusMap);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: "",
      server_ip: "",
      remote_path: "/",
      local_path: "/mnt/",
      nfs_version: "4.2",
      options: DEFAULT_MOUNT_OPTIONS,
      check_file: "",
      auto_mount: true,
      enabled: true,
    });
    setShowForm(true);
  };

  const openEdit = (mount) => {
    setEditing(mount);
    setForm({ ...mount });
    setShowForm(true);
  };

  const handleSave = async () => {
    try {
      if (editing) {
        await api.updateNFSMount(editing.id, form);
        toast.success(`NFS mount "${form.name}" updated`);
      } else {
        await api.createNFSMount(form);
        toast.success(`NFS mount "${form.name}" created`);
      }
      setShowForm(false);
      fetchData();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleDelete = async (id) => {
    const mount = mounts.find((m) => m.id === id);
    const ok = await confirm({
      title: "Delete NFS Mount?",
      message: `This will unmount and remove "${mount?.name || "this mount"}". This action cannot be undone.`,
      variant: "danger",
      confirmText: "Delete",
    });
    if (!ok) return;
    try {
      await api.deleteNFSMount(id);
      toast.success(`NFS mount "${mount?.name}" deleted`);
      fetchData();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleMount = async (id) => {
    const mount = mounts.find((m) => m.id === id);
    setLoading(`mount-${id}`);
    try {
      const result = await api.mountNFS(id);
      if (result.success) {
        toast.success(`NFS mount "${mount?.name}" mounted successfully`);
      } else {
        toast.error(`Mount failed: ${result.error || "Unknown error"}`);
      }
      fetchData();
    } catch (e) {
      toast.error(e.message);
    }
    setLoading("");
  };

  const handleUnmount = async (id) => {
    const mount = mounts.find((m) => m.id === id);
    const ok = await confirm({
      title: "Unmount NFS?",
      message: `Unmount "${mount?.name || "this mount"}"? Active connections will be interrupted.`,
      variant: "warning",
      confirmText: "Unmount",
    });
    if (!ok) return;
    setLoading(`unmount-${id}`);
    try {
      await api.unmountNFS(id);
      toast.success(`NFS mount "${mount?.name}" unmounted`);
      fetchData();
    } catch (e) {
      toast.error(e.message);
    }
    setLoading("");
  };

  const handleMountAll = async () => {
    const ok = await confirm({
      title: "Mount All NFS?",
      message: "This will mount all enabled NFS shares.",
      variant: "info",
      confirmText: "Mount All",
    });
    if (!ok) return;
    setLoading("mount-all");
    try {
      const results = await api.mountAllNFS();
      const ok = results.filter((r) => r.success).length;
      const fail = results.filter((r) => !r.success).length;
      if (fail > 0) {
        toast.warning(`Mounted ${ok}/${results.length} (${fail} failed)`);
      } else {
        toast.success(`All ${ok} NFS mounts mounted successfully`);
      }
      fetchData();
    } catch (e) {
      toast.error(e.message);
    }
    setLoading("");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <div className="p-2 rounded-lg bg-nfs-primary/10">
            <Download className="w-5 h-5 text-nfs-primary" />
          </div>
          NFS Client Mounts
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleMountAll}
            disabled={loading === "mount-all"}
            className="flex items-center gap-2 px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50"
          >
            <Zap className="w-4 h-4 text-nfs-primary" />
            Mount All
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium transition-all"
          >
            <Plus className="w-4 h-4 text-nfs-primary" />
            New Mount
          </button>
          <button
            onClick={async () => {
              setRefreshing(true);
              await fetchData();
              setRefreshing(false);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium transition-all"
          >
            <RefreshCw
              className={`w-4 h-4 text-nfs-primary ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm mb-4">
          <span>{error}</span>
          <button
            onClick={() => setError("")}
            className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* NFS Options Info */}
      <InfoBox type="primary" className="mb-6">
        <strong>Streaming-Optimized:</strong> NFSv4.2 with nconnect=16 (16
        parallel TCP connections), 1MB R/W Buffer, Attribute-Caching (1h),
        nocto, noatime — optimized for 300+ simultaneous streams.
      </InfoBox>

      {mounts.length === 0 ? (
        <div className="bg-nfs-card border border-nfs-border rounded-xl p-12 text-center">
          <Download className="w-12 h-12 text-nfs-muted mx-auto mb-4 opacity-30" />
          <p className="text-nfs-muted mb-4">No NFS mounts configured</p>
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-all mx-auto"
          >
            <Plus className="w-4 h-4 text-nfs-primary" />
            New Mount
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {mounts.map((m) => {
            const st = statuses[m.id];
            const mounted = st?.mounted || false;
            return (
              <div
                key={m.id}
                className="bg-nfs-card border border-nfs-border rounded-xl p-4 flex items-center gap-4 hover:border-nfs-muted transition-all"
              >
                <div
                  className={`w-3 h-3 rounded-full flex-shrink-0 ${
                    mounted ? "bg-emerald-400 animate-pulse" : "bg-nfs-muted"
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">{m.name}</span>
                    {!m.enabled && (
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border bg-slate-500/15 text-slate-400 border-slate-500/30">
                        Deaktiviert
                      </span>
                    )}
                    {m.auto_mount && (
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border bg-nfs-primary/15 text-nfs-primary border-nfs-primary/30">
                        Auto
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-nfs-muted truncate mt-0.5 font-mono">
                    {m.server_ip}:{m.remote_path} → {m.local_path}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-nfs-muted">
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${
                      st?.server_reachable ? "bg-emerald-400" : "bg-red-400"
                    }`}
                  />
                  Server
                </div>
                <div className="flex items-center gap-1">
                  {mounted ? (
                    <button
                      onClick={() => handleUnmount(m.id)}
                      disabled={loading === `unmount-${m.id}`}
                      className="p-2 rounded-lg text-nfs-muted hover:bg-amber-500/10 hover:text-amber-400 transition-all active:scale-90 disabled:opacity-50"
                      title="Unmount"
                    >
                      <Square className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleMount(m.id)}
                      disabled={loading === `mount-${m.id}`}
                      className="p-2 rounded-lg text-nfs-muted hover:bg-emerald-500/10 hover:text-emerald-400 transition-all active:scale-90 disabled:opacity-50"
                      title="Mount"
                    >
                      <Play className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => openEdit(m)}
                    className="p-2 rounded-lg text-nfs-muted hover:bg-nfs-input hover:text-white transition-all active:scale-90"
                    title="Edit"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(m.id)}
                    className="p-2 rounded-lg text-nfs-muted hover:bg-red-500/10 hover:text-red-400 transition-all active:scale-90"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <Modal
          title={editing ? "Edit NFS Mount" : "New NFS Mount"}
          onClose={() => setShowForm(false)}
        >
          <Field label="Name">
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Storage-1"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Server IP">
              <input
                className={inputClass}
                value={form.server_ip}
                onChange={(e) =>
                  setForm({ ...form, server_ip: e.target.value })
                }
                placeholder="192.168.1.100"
              />
            </Field>
            <Field label="NFS Version">
              <select
                className={inputClass}
                value={form.nfs_version}
                onChange={(e) =>
                  setForm({ ...form, nfs_version: e.target.value })
                }
              >
                <option value="4.2">4.2 (recommended)</option>
                <option value="4.1">4.1</option>
                <option value="4">4.0</option>
                <option value="3">3</option>
              </select>
            </Field>
          </div>
          <Field label="Remote Path">
            <input
              className={inputClass}
              value={form.remote_path}
              onChange={(e) =>
                setForm({ ...form, remote_path: e.target.value })
              }
              placeholder="/mnt/raidpool/filesystem/"
            />
          </Field>
          <Field label="Local Mountpoint">
            <input
              className={inputClass}
              value={form.local_path}
              onChange={(e) => setForm({ ...form, local_path: e.target.value })}
              placeholder="/mnt/storage"
            />
          </Field>
          <Field label="Mount Options">
            <textarea
              className={`${inputClass} h-20 font-mono text-xs`}
              value={form.options}
              onChange={(e) => setForm({ ...form, options: e.target.value })}
            />
          </Field>
          <Field label="Check File (optional)">
            <input
              className={inputClass}
              value={form.check_file}
              onChange={(e) => setForm({ ...form, check_file: e.target.value })}
              placeholder="/mnt/storage/.storagecheck/test"
            />
          </Field>
          <div className="flex gap-4 mb-4">
            <Toggle
              checked={form.auto_mount}
              onChange={(val) => setForm({ ...form, auto_mount: val })}
              label="Auto-Mount"
            />
            <Toggle
              checked={form.enabled}
              onChange={(val) => setForm({ ...form, enabled: val })}
              label="Enabled"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium transition-all"
            >
              {editing ? (
                <Save className="w-4 h-4 text-nfs-primary" />
              ) : (
                <Plus className="w-4 h-4 text-nfs-primary" />
              )}
              {editing ? "Save" : "Create"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
