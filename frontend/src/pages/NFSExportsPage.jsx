import { useState, useEffect } from "react";
import {
  Plus,
  Play,
  Square,
  Trash2,
  Edit3,
  X,
  Zap,
  Upload,
  CheckCircle,
  XCircle,
  RefreshCw,
  Save,
} from "lucide-react";
import api from "../api/client";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmProvider";
import { useCachedState } from "../hooks/useCache";
import InfoBox from "../components/InfoBox";

const DEFAULT_EXPORT_OPTIONS = "rw,sync,no_subtree_check,no_root_squash";

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

export default function NFSExportsPage() {
  const [exports, setExports] = useCachedState("nfs-exports", []);
  const [statuses, setStatuses] = useCachedState("nfs-export-statuses", {});
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();
  const [form, setForm] = useState({
    name: "",
    export_path: "/srv/nfs/",
    allowed_hosts: "*",
    options: DEFAULT_EXPORT_OPTIONS,
    nfs_version: "4.2",
    enabled: true,
  });

  const fetchData = async () => {
    try {
      const [e, s] = await Promise.all([
        api.getNFSExports(),
        api.getNFSExportsStatus().catch(() => []),
      ]);
      setExports(e);
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
      export_path: "/srv/nfs/",
      allowed_hosts: "*",
      options: DEFAULT_EXPORT_OPTIONS,
      nfs_version: "4.2",
      enabled: true,
    });
    setShowForm(true);
  };

  const openEdit = (exp) => {
    setEditing(exp);
    setForm({ ...exp });
    setShowForm(true);
  };

  const handleSave = async () => {
    try {
      if (editing) {
        await api.updateNFSExport(editing.id, form);
        toast.success(`NFS export "${form.name}" updated`);
      } else {
        await api.createNFSExport(form);
        toast.success(`NFS export "${form.name}" created`);
      }
      setShowForm(false);
      fetchData();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleDelete = async (id) => {
    const exp = exports.find((e) => e.id === id);
    const ok = await confirm({
      title: "Delete NFS Export?",
      message: `This will remove "${exp?.name || "this export"}". This action cannot be undone.`,
      variant: "danger",
      confirmText: "Delete",
    });
    if (!ok) return;
    try {
      await api.deleteNFSExport(id);
      toast.success(`NFS export "${exp?.name}" deleted`);
      fetchData();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleEnable = async (id) => {
    const exp = exports.find((e) => e.id === id);
    setLoading(`enable-${id}`);
    try {
      const result = await api.enableNFSExport(id);
      if (result.success) {
        toast.success(`NFS export "${exp?.name}" enabled`);
      } else {
        toast.error(`Enable failed: ${result.error || "Unknown error"}`);
      }
      fetchData();
    } catch (e) {
      toast.error(e.message);
    }
    setLoading("");
  };

  const handleDisable = async (id) => {
    const exp = exports.find((e) => e.id === id);
    setLoading(`disable-${id}`);
    try {
      const result = await api.disableNFSExport(id);
      if (result.success) {
        toast.success(`NFS export "${exp?.name}" disabled`);
      } else {
        toast.error(`Disable failed: ${result.error || "Unknown error"}`);
      }
      fetchData();
    } catch (e) {
      toast.error(e.message);
    }
    setLoading("");
  };

  const handleApplyAll = async () => {
    const ok = await confirm({
      title: "Apply All Exports?",
      message:
        "This will write all exports to /etc/exports and reload the NFS server.",
      variant: "info",
      confirmText: "Apply All",
    });
    if (!ok) return;
    setLoading("apply-all");
    try {
      const result = await api.applyNFSExports();
      if (result.success) {
        toast.success("All NFS exports applied successfully");
      } else {
        toast.error(`Apply failed: ${result.error || "Unknown error"}`);
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
            <Upload className="w-5 h-5 text-nfs-primary" />
          </div>
          NFS Server Exports
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleApplyAll}
            disabled={loading === "apply-all"}
            className="flex items-center gap-2 px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50"
          >
            <Zap className="w-4 h-4 text-nfs-primary" />
            Apply All
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium transition-all"
          >
            <Plus className="w-4 h-4 text-nfs-primary" />
            New Export
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

      {/* Export Info */}
      <InfoBox type="primary" className="mb-6">
        <strong>NFS Server (Exports):</strong> Share directories via NFS.
        Exports are written to /etc/exports and applied with exportfs. Allowed
        hosts can be IPs, subnets (192.168.1.0/24) or * (all).
      </InfoBox>

      {exports.length === 0 ? (
        <div className="bg-nfs-card border border-nfs-border rounded-xl p-12 text-center">
          <Upload className="w-12 h-12 text-nfs-muted mx-auto mb-4 opacity-30" />
          <p className="text-nfs-muted mb-4">No NFS exports configured</p>
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-all mx-auto"
          >
            <Plus className="w-4 h-4 text-nfs-primary" />
            New Export
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {exports.map((exp) => {
            const st = statuses[exp.id];
            const active = st?.is_active || exp.is_active || false;
            return (
              <div
                key={exp.id}
                className="bg-nfs-card border border-nfs-border rounded-xl p-4 flex items-center gap-4 hover:border-nfs-muted transition-all"
              >
                <div
                  className={`w-3 h-3 rounded-full flex-shrink-0 ${
                    active ? "bg-emerald-400 animate-pulse" : "bg-nfs-muted"
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">{exp.name}</span>
                    {!exp.enabled && (
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border bg-slate-500/15 text-slate-400 border-slate-500/30">
                        Disabled
                      </span>
                    )}
                    <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border bg-blue-500/15 text-blue-400 border-blue-500/30">
                      v{exp.nfs_version}
                    </span>
                  </div>
                  <p className="text-xs text-nfs-muted truncate mt-0.5 font-mono">
                    {exp.export_path} → {exp.allowed_hosts}({exp.options})
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-nfs-muted">
                  {active ? (
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-nfs-muted" />
                  )}
                  {active ? "Active" : "Inactive"}
                </div>
                <div className="flex items-center gap-1">
                  {active ? (
                    <button
                      onClick={() => handleDisable(exp.id)}
                      disabled={loading === `disable-${exp.id}`}
                      className="p-2 rounded-lg text-nfs-muted hover:bg-amber-500/10 hover:text-amber-400 transition-all active:scale-90 disabled:opacity-50"
                      title="Disable"
                    >
                      <Square className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleEnable(exp.id)}
                      disabled={loading === `enable-${exp.id}`}
                      className="p-2 rounded-lg text-nfs-muted hover:bg-emerald-500/10 hover:text-emerald-400 transition-all active:scale-90 disabled:opacity-50"
                      title="Enable"
                    >
                      <Play className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => openEdit(exp)}
                    className="p-2 rounded-lg text-nfs-muted hover:bg-nfs-input hover:text-white transition-all active:scale-90"
                    title="Edit"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(exp.id)}
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
          title={editing ? "Edit NFS Export" : "New NFS Export"}
          onClose={() => setShowForm(false)}
        >
          <Field label="Name">
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Media-Share"
            />
          </Field>
          <Field label="Export Path">
            <input
              className={inputClass}
              value={form.export_path}
              onChange={(e) =>
                setForm({ ...form, export_path: e.target.value })
              }
              placeholder="/srv/nfs/media"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Allowed Hosts">
              <input
                className={inputClass}
                value={form.allowed_hosts}
                onChange={(e) =>
                  setForm({ ...form, allowed_hosts: e.target.value })
                }
                placeholder="* or 192.168.1.0/24"
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
          <Field label="Export Options">
            <textarea
              className={`${inputClass} h-20 font-mono text-xs`}
              value={form.options}
              onChange={(e) => setForm({ ...form, options: e.target.value })}
            />
          </Field>
          <div className="flex gap-4 mb-4">
            <label className="flex items-center gap-2 text-sm text-nfs-text">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) =>
                  setForm({ ...form, enabled: e.target.checked })
                }
                className="rounded border-nfs-border"
              />
              Enabled
            </label>
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
                <Save className="w-4 h-4" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              {editing ? "Save" : "Create"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
