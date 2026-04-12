import { useState, useEffect } from "react";
import {
  GitMerge,
  Plus,
  Play,
  Square,
  Trash2,
  Edit3,
  X,
  Zap,
  RefreshCw,
  Save,
  Loader2,
} from "lucide-react";
import api from "../api/client";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmProvider";
import { useCachedState } from "../hooks/useCache";
import InfoBox from "../components/InfoBox";
import Toggle from "../components/Toggle";
import ProgressDialog from "../components/ProgressDialog";

const DEFAULT_OPTIONS =
  "rw,use_ino,allow_other,statfs_ignore=nc,func.getattr=newest,category.action=all,category.create=ff,cache.files=partial,cache.entry=60,cache.negative_entry=60,cache.attr=60,cache.statfs=60,dropcacheonclose=true,kernel_cache,splice_move,splice_read,fsname=mergerfs";

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

export default function MergerFSPage() {
  const [configs, setConfigs] = useCachedState("mergerfs-configs", []);
  const [statuses, setStatuses] = useCachedState("mergerfs-statuses", {});
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState("");
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();
  const [form, setForm] = useState({
    name: "",
    mount_point: "/mnt/unionfs",
    sources: "",
    options: DEFAULT_OPTIONS,
    auto_mount: true,
    enabled: true,
  });

  const fetchData = async () => {
    try {
      const [c, s] = await Promise.all([
        api.getMergerFSConfigs(),
        api.getMergerFSStatus().catch(() => []),
      ]);
      setConfigs(c);
      const statusMap = {};
      s.forEach((st) => (statusMap[st.id] = st));
      setStatuses(statusMap);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: "",
      mount_point: "/mnt/unionfs",
      sources: "/mnt/downloads:/mnt/storage:/mnt/storage2",
      options: DEFAULT_OPTIONS,
      auto_mount: true,
      enabled: true,
    });
    setShowForm(true);
  };

  const openEdit = (config) => {
    setEditing(config);
    const sources = Array.isArray(config.sources)
      ? config.sources.join(":")
      : config.sources;
    setForm({ ...config, sources });
    setShowForm(true);
  };

  const handleSave = async () => {
    const action = editing ? "Updating" : "Creating";
    setLoading("save");
    setProgress({ message: `${action} "${form.name}"...`, status: "loading" });
    try {
      const data = {
        ...form,
        sources: form.sources
          .split(":")
          .map((s) => s.trim())
          .filter(Boolean),
      };
      if (editing) {
        await api.updateMergerFS(editing.id, data);
        setProgress({
          message: `"${form.name}" updated successfully`,
          status: "success",
        });
      } else {
        await api.createMergerFS(data);
        setProgress({
          message: `"${form.name}" created successfully`,
          status: "success",
        });
      }
      setShowForm(false);
      fetchData();
    } catch (e) {
      setProgress({
        message: `${action} failed`,
        status: "error",
        detail: e.message,
      });
    }
    setLoading("");
    setTimeout(() => setProgress(null), 1500);
  };

  const handleDelete = async (id) => {
    const cfg = configs.find((c) => c.id === id);
    const ok = await confirm({
      title: "Delete MergerFS Config?",
      message: `This will unmount and remove "${cfg?.name || "this config"}". This action cannot be undone.`,
      variant: "danger",
      confirmText: "Delete",
    });
    if (!ok) return;
    setLoading(`delete-${id}`);
    setProgress({ message: `Deleting "${cfg?.name}"...`, status: "loading" });
    try {
      await api.deleteMergerFS(id);
      setProgress({ message: `"${cfg?.name}" deleted`, status: "success" });
      fetchData();
    } catch (e) {
      setProgress({
        message: "Delete failed",
        status: "error",
        detail: e.message,
      });
    }
    setLoading("");
    setTimeout(() => setProgress(null), 1500);
  };

  const handleMount = async (id) => {
    const cfg = configs.find((c) => c.id === id);
    setLoading(`mount-${id}`);
    setProgress({ message: `Mounting "${cfg?.name}"...`, status: "loading" });
    try {
      const result = await api.mountMergerFS(id);
      if (result.success) {
        setProgress({
          message: `"${cfg?.name}" mounted successfully`,
          status: "success",
        });
      } else {
        setProgress({
          message: "Mount failed",
          status: "error",
          detail: result.error || "Unknown error",
        });
      }
      fetchData();
    } catch (e) {
      setProgress({
        message: "Mount failed",
        status: "error",
        detail: e.message,
      });
    }
    setLoading("");
    setTimeout(() => setProgress(null), 1500);
  };

  const handleUnmount = async (id) => {
    const cfg = configs.find((c) => c.id === id);
    const ok = await confirm({
      title: "Unmount MergerFS?",
      message: `Unmount "${cfg?.name || "this config"}"? Active connections will be interrupted.`,
      variant: "warning",
      confirmText: "Unmount",
    });
    if (!ok) return;
    setLoading(`unmount-${id}`);
    setProgress({ message: `Unmounting "${cfg?.name}"...`, status: "loading" });
    try {
      await api.unmountMergerFS(id);
      setProgress({ message: `"${cfg?.name}" unmounted`, status: "success" });
      fetchData();
    } catch (e) {
      setProgress({
        message: "Unmount failed",
        status: "error",
        detail: e.message,
      });
    }
    setLoading("");
    setTimeout(() => setProgress(null), 1500);
  };

  const handleMountAll = async () => {
    const ok = await confirm({
      title: "Mount All MergerFS?",
      message: "This will mount all enabled MergerFS configs.",
      variant: "info",
      confirmText: "Mount All",
    });
    if (!ok) return;
    setLoading("mount-all");
    setProgress({
      message: "Mounting all MergerFS configs...",
      status: "loading",
    });
    try {
      const results = await api.mountAllMergerFS();
      const succeeded = results.filter((r) => r.success).length;
      const fail = results.filter((r) => !r.success).length;
      if (fail > 0) {
        setProgress({
          message: `Mounted ${succeeded}/${results.length}`,
          status: "error",
          detail: `${fail} failed`,
        });
      } else {
        setProgress({
          message: `All ${succeeded} MergerFS configs mounted`,
          status: "success",
        });
      }
      fetchData();
    } catch (e) {
      setProgress({
        message: "Mount all failed",
        status: "error",
        detail: e.message,
      });
    }
    setLoading("");
    setTimeout(() => setProgress(null), 1500);
  };

  const handleUnmountAll = async () => {
    const ok = await confirm({
      title: "Unmount All MergerFS?",
      message:
        "This will unmount all MergerFS configs. Active connections will be interrupted.",
      variant: "warning",
      confirmText: "Unmount All",
    });
    if (!ok) return;
    setLoading("unmount-all");
    setProgress({
      message: "Unmounting all MergerFS configs...",
      status: "loading",
    });
    try {
      const results = await api.unmountAllMergerFS();
      const succeeded = results.filter((r) => r.success).length;
      const fail = results.filter((r) => !r.success).length;
      if (fail > 0) {
        setProgress({
          message: `Unmounted ${succeeded}/${results.length}`,
          status: "error",
          detail: `${fail} failed`,
        });
      } else {
        setProgress({
          message: `All ${succeeded} MergerFS configs unmounted`,
          status: "success",
        });
      }
      fetchData();
    } catch (e) {
      setProgress({
        message: "Unmount all failed",
        status: "error",
        detail: e.message,
      });
    }
    setLoading("");
    setTimeout(() => setProgress(null), 1500);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <div className="p-2 rounded-lg bg-nfs-primary/10 text-nfs-primary">
            <GitMerge className="w-5 h-5" />
          </div>
          MergerFS
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleMountAll}
            disabled={loading === "mount-all"}
            className="flex items-center gap-2 px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50"
          >
            {loading === "mount-all" ? (
              <Loader2 className="w-4 h-4 text-nfs-primary animate-spin" />
            ) : (
              <Zap className="w-4 h-4 text-nfs-primary" />
            )}
            Mount All
          </button>
          <button
            onClick={handleUnmountAll}
            disabled={loading === "unmount-all"}
            className="flex items-center gap-2 px-4 py-2 bg-nfs-card border border-nfs-border hover:border-amber-500 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50"
          >
            {loading === "unmount-all" ? (
              <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
            ) : (
              <Square className="w-4 h-4 text-amber-400" />
            )}
            Unmount All
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium transition-all"
          >
            <Plus className="w-4 h-4 text-nfs-primary" />
            New Config
          </button>
          <button
            onClick={async () => {
              setRefreshing(true);
              setProgress({
                message: "Refreshing MergerFS configs...",
                status: "loading",
              });
              try {
                await fetchData();
                setProgress({
                  message: "MergerFS configs refreshed",
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

      {/* Info Box */}
      <InfoBox type="primary" className="mb-6">
        MergerFS combines multiple storage paths into a single mount. Optimized
        with full file caching, readdir cache, 120s attribute caching for
        maximum streaming performance.
      </InfoBox>

      {configs.length === 0 ? (
        <div className="bg-nfs-card border border-nfs-border rounded-xl p-12 text-center">
          <GitMerge className="w-12 h-12 text-nfs-muted mx-auto mb-4 opacity-30" />
          <p className="text-nfs-muted mb-4">No MergerFS configs available</p>
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-all mx-auto"
          >
            <Plus className="w-4 h-4 text-nfs-primary" />
            Create Config
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {configs.map((c) => {
            const st = statuses[c.id];
            const mounted = st?.mounted || false;
            const sources = Array.isArray(c.sources) ? c.sources : [];
            return (
              <div
                key={c.id}
                className="bg-nfs-card border border-nfs-border rounded-xl p-4 hover:border-nfs-muted transition-all"
              >
                {/* Header */}
                <div className="flex items-center gap-4">
                  <div
                    className={`w-3 h-3 rounded-full flex-shrink-0 ${
                      mounted ? "bg-emerald-400 animate-pulse" : "bg-nfs-muted"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-white">{c.name}</span>
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border ${
                          mounted
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                            : "bg-slate-500/15 text-slate-400 border-slate-500/30"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${mounted ? "bg-emerald-400" : "bg-slate-400"}`}
                        />
                        {mounted ? "Mounted" : "Unmounted"}
                      </span>
                      {c.auto_mount ? (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border bg-purple-500/15 text-purple-400 border-purple-500/30">
                          Auto-Mount
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border bg-slate-500/15 text-slate-400 border-slate-500/30">
                          No Auto-Mount
                        </span>
                      )}
                      {!c.enabled && (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border bg-slate-500/15 text-slate-400 border-slate-500/30">
                          Disabled
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {mounted ? (
                      <button
                        onClick={() => handleUnmount(c.id)}
                        disabled={loading === `unmount-${c.id}`}
                        className="p-2 rounded-lg text-nfs-muted hover:bg-amber-500/10 hover:text-amber-400 transition-all active:scale-90 disabled:opacity-50"
                        title="Unmount"
                      >
                        {loading === `unmount-${c.id}` ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleMount(c.id)}
                        disabled={loading === `mount-${c.id}`}
                        className="p-2 rounded-lg text-nfs-muted hover:bg-emerald-500/10 hover:text-emerald-400 transition-all active:scale-90 disabled:opacity-50"
                        title="Mount"
                      >
                        {loading === `mount-${c.id}` ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(c)}
                      className="p-2 rounded-lg text-nfs-muted hover:bg-nfs-input hover:text-white transition-all active:scale-90"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      disabled={loading === `delete-${c.id}`}
                      className="p-2 rounded-lg text-nfs-muted hover:bg-red-500/10 hover:text-red-400 transition-all active:scale-90 disabled:opacity-50"
                      title="Delete"
                    >
                      {loading === `delete-${c.id}` ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Mini info cards */}
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="bg-nfs-input/80 border border-nfs-border/50 rounded-lg px-3 py-2">
                    <p className="text-[10px] text-nfs-muted uppercase tracking-wider">
                      Mount Point
                    </p>
                    <p className="text-xs text-white font-mono truncate mt-0.5">
                      {c.mount_point}
                    </p>
                  </div>
                  <div className="bg-nfs-input/80 border border-nfs-border/50 rounded-lg px-3 py-2">
                    <p className="text-[10px] text-nfs-muted uppercase tracking-wider">
                      Sources
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {sources.map((src, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center text-[10px] bg-blue-500/10 border border-blue-500/25 rounded-full px-2.5 py-0.5 font-mono text-blue-300 truncate max-w-[160px]"
                        >
                          {src}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="bg-nfs-input/80 border border-nfs-border/50 rounded-lg px-3 py-2">
                    <p className="text-[10px] text-nfs-muted uppercase tracking-wider">
                      Used Space
                    </p>
                    {mounted && st?.used_space ? (
                      <div className="mt-0.5">
                        <div className="flex items-baseline justify-between">
                          <p className="text-xs text-white font-mono">
                            {st.used_space}
                          </p>
                          <p
                            className={`text-[10px] font-medium ${
                              (st.used_percent || 0) > 90
                                ? "text-red-400"
                                : (st.used_percent || 0) > 70
                                  ? "text-amber-400"
                                  : "text-emerald-400"
                            }`}
                          >
                            {st.used_percent}%
                          </p>
                        </div>
                        <div className="w-full bg-nfs-card rounded-full h-1.5 mt-1">
                          <div
                            className={`h-1.5 rounded-full ${
                              (st.used_percent || 0) > 90
                                ? "bg-red-400"
                                : (st.used_percent || 0) > 70
                                  ? "bg-amber-400"
                                  : "bg-emerald-400"
                            }`}
                            style={{ width: `${st.used_percent || 0}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-nfs-muted mt-0.5">—</p>
                    )}
                  </div>
                  <div className="bg-nfs-input/80 border border-nfs-border/50 rounded-lg px-3 py-2">
                    <p className="text-[10px] text-nfs-muted uppercase tracking-wider">
                      Free Space
                    </p>
                    {mounted && st?.free_space ? (
                      <p className="text-xs text-emerald-400 font-mono mt-0.5">
                        {st.free_space}
                      </p>
                    ) : (
                      <p className="text-xs text-nfs-muted mt-0.5">—</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <Modal
          title={editing ? "Edit MergerFS Config" : "New MergerFS Config"}
          onClose={() => setShowForm(false)}
        >
          <Field label="Name">
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. UnionFS"
            />
          </Field>
          <Field label="Mount Point">
            <input
              className={inputClass}
              value={form.mount_point}
              onChange={(e) =>
                setForm({ ...form, mount_point: e.target.value })
              }
              placeholder="/mnt/unionfs"
            />
          </Field>
          <Field label="Sources (separated by :)">
            <input
              className={inputClass}
              value={form.sources}
              onChange={(e) => setForm({ ...form, sources: e.target.value })}
              placeholder="/mnt/downloads:/mnt/storage:/mnt/storage2"
            />
          </Field>
          <Field label="MergerFS Options">
            <textarea
              className={`${inputClass} h-24 font-mono text-xs`}
              value={form.options}
              onChange={(e) => setForm({ ...form, options: e.target.value })}
            />
          </Field>
          <div className="flex gap-4 mb-4">
            <Toggle
              checked={form.enabled}
              onChange={(val) => setForm({ ...form, enabled: val })}
              label="Enabled"
            />
            <Toggle
              checked={form.auto_mount}
              onChange={(val) => setForm({ ...form, auto_mount: val })}
              label="Auto-Mount"
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
              disabled={loading === "save"}
              className="flex items-center gap-2 px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50"
            >
              {loading === "save" ? (
                <Loader2 className="w-4 h-4 text-nfs-primary animate-spin" />
              ) : editing ? (
                <Save className="w-4 h-4 text-nfs-primary" />
              ) : (
                <Plus className="w-4 h-4 text-nfs-primary" />
              )}
              {editing ? "Save" : "Create"}
            </button>
          </div>
        </Modal>
      )}
      <ProgressDialog progress={progress} />
    </div>
  );
}
