import { useState, useEffect } from "react";
import { GitMerge, Plus, Play, Square, Trash2, Edit3, X } from "lucide-react";
import api from "../api/client";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmProvider";

const DEFAULT_OPTIONS =
  "rw,async_read=true,use_ino,allow_other,func.getattr=newest,category.action=all,category.create=ff,cache.files=auto-full,cache.readdir=true,cache.statfs=3600,cache.attr=120,cache.entry=120,cache.negative_entry=60,dropcacheonclose=true,minfreespace=10G,fsname=mergerfs";

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
  const [configs, setConfigs] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
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
    const interval = setInterval(fetchData, 5000);
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
        toast.success(`MergerFS config "${form.name}" updated`);
      } else {
        await api.createMergerFS(data);
        toast.success(`MergerFS config "${form.name}" created`);
      }
      setShowForm(false);
      fetchData();
    } catch (e) {
      toast.error(e.message);
    }
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
    try {
      await api.deleteMergerFS(id);
      toast.success(`MergerFS config "${cfg?.name}" deleted`);
      fetchData();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleMount = async (id) => {
    const cfg = configs.find((c) => c.id === id);
    setLoading(`mount-${id}`);
    try {
      const result = await api.mountMergerFS(id);
      if (result.success) {
        toast.success(`MergerFS "${cfg?.name}" mounted successfully`);
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
    const cfg = configs.find((c) => c.id === id);
    const ok = await confirm({
      title: "Unmount MergerFS?",
      message: `Unmount "${cfg?.name || "this config"}"? Active connections will be interrupted.`,
      variant: "warning",
      confirmText: "Unmount",
    });
    if (!ok) return;
    setLoading(`unmount-${id}`);
    try {
      await api.unmountMergerFS(id);
      toast.success(`MergerFS "${cfg?.name}" unmounted`);
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
          <div className="p-2 rounded-lg bg-purple-500/10">
            <GitMerge className="w-5 h-5 text-purple-400" />
          </div>
          MergerFS
        </h1>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-nfs-primary hover:bg-nfs-primary-hover text-black font-medium rounded-lg text-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Config
        </button>
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
      <div className="bg-nfs-card border border-purple-500/20 rounded-xl p-4 mb-6">
        <p className="text-xs text-nfs-muted leading-relaxed">
          MergerFS combines multiple storage paths into a single mount.
          Optimized with full file caching, readdir cache, 120s attribute
          caching for maximum streaming performance.
        </p>
      </div>

      {configs.length === 0 ? (
        <div className="text-center py-16 text-nfs-muted">
          <GitMerge className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No MergerFS configs available</p>
          <button
            onClick={openCreate}
            className="mt-3 text-nfs-primary hover:text-nfs-primary-hover text-sm"
          >
            Create one now →
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
                <div className="flex items-center gap-4">
                  <div
                    className={`w-3 h-3 rounded-full flex-shrink-0 ${
                      mounted ? "bg-emerald-400 animate-pulse" : "bg-nfs-muted"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
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
                      {c.auto_mount && (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border bg-purple-500/15 text-purple-400 border-purple-500/30">
                          Auto
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-nfs-muted mt-0.5 font-mono">
                      → {c.mount_point}
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    {mounted ? (
                      <button
                        onClick={() => handleUnmount(c.id)}
                        disabled={loading === `unmount-${c.id}`}
                        className="p-2 rounded-lg text-nfs-muted hover:bg-amber-500/10 hover:text-amber-400 transition-all active:scale-90 disabled:opacity-50"
                        title="Unmount"
                      >
                        <Square className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleMount(c.id)}
                        disabled={loading === `mount-${c.id}`}
                        className="p-2 rounded-lg text-nfs-muted hover:bg-emerald-500/10 hover:text-emerald-400 transition-all active:scale-90 disabled:opacity-50"
                        title="Mount"
                      >
                        <Play className="w-4 h-4" />
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
                      className="p-2 rounded-lg text-nfs-muted hover:bg-red-500/10 hover:text-red-400 transition-all active:scale-90"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Sources */}
                <div className="mt-3 pl-7">
                  <p className="text-[10px] font-semibold text-nfs-muted uppercase tracking-wider mb-1">
                    Sources
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {sources.map((src, i) => (
                      <span
                        key={i}
                        className="text-xs bg-nfs-input/50 text-nfs-text px-2 py-1 rounded font-mono"
                      >
                        {src}
                      </span>
                    ))}
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
            <label className="flex items-center gap-2 text-sm text-nfs-text">
              <input
                type="checkbox"
                checked={form.auto_mount}
                onChange={(e) =>
                  setForm({ ...form, auto_mount: e.target.checked })
                }
              />
              Auto-Mount
            </label>
            <label className="flex items-center gap-2 text-sm text-nfs-text">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) =>
                  setForm({ ...form, enabled: e.target.checked })
                }
              />
              Enabled
            </label>
          </div>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-muted text-nfs-text rounded-lg text-sm transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-nfs-primary hover:bg-nfs-primary-hover text-black font-medium rounded-lg text-sm transition-colors"
            >
              {editing ? "Save" : "Create"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
