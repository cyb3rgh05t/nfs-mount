import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
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
  FileText,
  Loader2,
} from "lucide-react";
import api from "../api/client";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmProvider";
import InfoBox from "../components/InfoBox";
import Toggle from "../components/Toggle";
import ProgressDialog from "../components/ProgressDialog";
import CustomSelect from "../components/CustomSelect";

const DEFAULT_EXPORT_OPTIONS =
  "rw,async,no_subtree_check,all_squash,anonuid=1000,anongid=1000";

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
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState("");
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");
  const toast = useToast();
  const confirm = useConfirm();
  const [form, setForm] = useState({
    name: "",
    export_path: "/srv/nfs/",
    allowed_hosts: "*",
    options: DEFAULT_EXPORT_OPTIONS,
    nfs_version: "4.2",
    enabled: true,
    auto_enable: true,
  });

  const {
    data: queryData,
    isFetching,
    refetch,
    error: queryError,
  } = useQuery({
    queryKey: ["nfs", "exports"],
    queryFn: async () => {
      const [e, s, sys] = await Promise.all([
        api.getNFSExports(),
        api.getNFSExportsStatus().catch(() => []),
        api.getSystemExports().catch(() => []),
      ]);
      const statusMap = {};
      s.forEach((st) => (statusMap[st.id] = st));
      return { exports: e, statuses: statusMap, systemExports: sys };
    },
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const exports = queryData?.exports ?? [];
  const statuses = queryData?.statuses ?? {};
  const systemExports = queryData?.systemExports ?? [];
  const refreshing = isFetching;
  const fetchData = () => refetch();

  useEffect(() => {
    if (queryError) setError(queryError.message);
  }, [queryError]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: "",
      export_path: "/srv/nfs/",
      allowed_hosts: "*",
      options: DEFAULT_EXPORT_OPTIONS,
      nfs_version: "4.2",
      enabled: true,
      auto_enable: true,
    });
    setShowForm(true);
  };

  const openEdit = (exp) => {
    setEditing(exp);
    setForm({ ...exp });
    setShowForm(true);
  };

  const handleSave = async () => {
    const action = editing ? "Updating" : "Creating";
    setLoading("save");
    setProgress({ message: `${action} "${form.name}"...`, status: "loading" });
    try {
      if (editing) {
        await api.updateNFSExport(editing.id, form);
        setProgress({
          message: `"${form.name}" updated successfully`,
          status: "success",
        });
      } else {
        await api.createNFSExport(form);
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
    const exp = exports.find((e) => e.id === id);
    const ok = await confirm({
      title: "Delete NFS Export?",
      message: `This will remove "${exp?.name || "this export"}". This action cannot be undone.`,
      variant: "danger",
      confirmText: "Delete",
    });
    if (!ok) return;
    setLoading(`delete-${id}`);
    setProgress({ message: `Deleting "${exp?.name}"...`, status: "loading" });
    try {
      await api.deleteNFSExport(id);
      setProgress({ message: `"${exp?.name}" deleted`, status: "success" });
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

  const handleEnable = async (id) => {
    const exp = exports.find((e) => e.id === id);
    setLoading(`enable-${id}`);
    setProgress({ message: `Enabling "${exp?.name}"...`, status: "loading" });
    try {
      const result = await api.enableNFSExport(id);
      if (result.success) {
        setProgress({ message: `"${exp?.name}" enabled`, status: "success" });
      } else {
        setProgress({
          message: "Enable failed",
          status: "error",
          detail: result.error || "Unknown error",
        });
      }
      fetchData();
    } catch (e) {
      setProgress({
        message: "Enable failed",
        status: "error",
        detail: e.message,
      });
    }
    setLoading("");
    setTimeout(() => setProgress(null), 1500);
  };

  const handleDisable = async (id) => {
    const exp = exports.find((e) => e.id === id);
    setLoading(`disable-${id}`);
    setProgress({ message: `Disabling "${exp?.name}"...`, status: "loading" });
    try {
      const result = await api.disableNFSExport(id);
      if (result.success) {
        setProgress({ message: `"${exp?.name}" disabled`, status: "success" });
      } else {
        setProgress({
          message: "Disable failed",
          status: "error",
          detail: result.error || "Unknown error",
        });
      }
      fetchData();
    } catch (e) {
      setProgress({
        message: "Disable failed",
        status: "error",
        detail: e.message,
      });
    }
    setLoading("");
    setTimeout(() => setProgress(null), 1500);
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
    setProgress({ message: "Applying all NFS exports...", status: "loading" });
    try {
      const result = await api.applyNFSExports();
      if (result.success) {
        setProgress({
          message: "All NFS exports applied successfully",
          status: "success",
        });
      } else {
        setProgress({
          message: "Apply failed",
          status: "error",
          detail: result.error || "Unknown error",
        });
      }
      fetchData();
    } catch (e) {
      setProgress({
        message: "Apply failed",
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
            {loading === "apply-all" ? (
              <Loader2 className="w-4 h-4 text-nfs-primary animate-spin" />
            ) : (
              <Zap className="w-4 h-4 text-nfs-primary" />
            )}
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
              setProgress({
                message: "Refreshing NFS exports...",
                status: "loading",
              });
              try {
                await refetch();
                setProgress({
                  message: "NFS exports refreshed",
                  status: "success",
                });
              } catch (e) {
                setProgress({
                  message: "Refresh failed",
                  status: "error",
                  detail: e.message,
                });
              }
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
                className="bg-nfs-card border border-nfs-border rounded-xl p-4 hover:border-nfs-muted transition-all"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`w-3 h-3 rounded-full flex-shrink-0 ${
                      active ? "bg-emerald-400 animate-pulse" : "bg-nfs-muted"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">
                        {exp.name}
                      </span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${
                          active
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                            : "bg-red-500/15 text-red-400 border-red-500/30"
                        }`}
                      >
                        {active ? "Active" : "Inactive"}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border bg-blue-500/15 text-blue-400 border-blue-500/30">
                        NFSv{exp.nfs_version}
                      </span>
                      {!exp.enabled && (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border bg-slate-500/15 text-slate-400 border-slate-500/30">
                          Disabled
                        </span>
                      )}
                      {exp.auto_enable ? (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border bg-blue-500/15 text-blue-400 border-blue-500/30">
                          Auto-Enable
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border bg-slate-500/15 text-slate-400 border-slate-500/30">
                          No Auto-Enable
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {active ? (
                      <button
                        onClick={() => handleDisable(exp.id)}
                        disabled={loading === `disable-${exp.id}`}
                        className="p-2 rounded-lg text-nfs-muted hover:bg-amber-500/10 hover:text-amber-400 transition-all active:scale-90 disabled:opacity-50"
                        title="Disable"
                      >
                        {loading === `disable-${exp.id}` ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleEnable(exp.id)}
                        disabled={loading === `enable-${exp.id}`}
                        className="p-2 rounded-lg text-nfs-muted hover:bg-emerald-500/10 hover:text-emerald-400 transition-all active:scale-90 disabled:opacity-50"
                        title="Enable"
                      >
                        {loading === `enable-${exp.id}` ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
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
                      disabled={loading === `delete-${exp.id}`}
                      className="p-2 rounded-lg text-nfs-muted hover:bg-red-500/10 hover:text-red-400 transition-all active:scale-90 disabled:opacity-50"
                      title="Delete"
                    >
                      {loading === `delete-${exp.id}` ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Mini info cards */}
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div className="bg-nfs-input/80 border border-nfs-border/50 rounded-lg px-3 py-2">
                    <p className="text-[10px] text-nfs-muted uppercase tracking-wider">
                      Export Path
                    </p>
                    <p className="text-xs text-white font-mono truncate mt-0.5">
                      {exp.export_path}
                    </p>
                  </div>
                  <div className="bg-nfs-input/80 border border-nfs-border/50 rounded-lg px-3 py-2">
                    <p className="text-[10px] text-nfs-muted uppercase tracking-wider">
                      Allowed Hosts
                    </p>
                    <p className="text-xs text-white font-mono truncate mt-0.5">
                      {exp.allowed_hosts}
                    </p>
                  </div>
                  <div className="bg-nfs-input/80 border border-nfs-border/50 rounded-lg px-3 py-2 sm:col-span-1 col-span-2">
                    <p className="text-[10px] text-nfs-muted uppercase tracking-wider">
                      Options
                    </p>
                    <p className="text-xs text-white font-mono truncate mt-0.5">
                      {exp.options}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* System Exports (manual /etc/exports entries) */}
      {systemExports.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-nfs-muted uppercase tracking-wider mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            System Exports (manual)
          </h2>
          <div className="space-y-2">
            {systemExports.map((exp, i) => (
              <div
                key={i}
                className="bg-nfs-card/50 border border-nfs-border/50 rounded-xl p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-400 flex-shrink-0" />
                  <span className="font-mono text-sm text-white flex-1 truncate">
                    {exp.export_path}
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border bg-blue-500/15 text-blue-400 border-blue-500/30">
                    System
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="bg-nfs-input/80 border border-nfs-border/50 rounded-lg px-3 py-2">
                    <p className="text-[10px] text-nfs-muted uppercase tracking-wider">
                      Allowed Hosts
                    </p>
                    <p className="text-xs text-white font-mono truncate mt-0.5">
                      {exp.allowed_hosts}
                    </p>
                  </div>
                  <div className="bg-nfs-input/80 border border-nfs-border/50 rounded-lg px-3 py-2">
                    <p className="text-[10px] text-nfs-muted uppercase tracking-wider">
                      Options
                    </p>
                    <p className="text-xs text-white font-mono truncate mt-0.5">
                      {exp.options || "—"}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
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
              <CustomSelect
                value={form.nfs_version}
                onChange={(val) => setForm({ ...form, nfs_version: val })}
                options={[
                  { value: "4.2", label: "4.2 (recommended)" },
                  { value: "4.1", label: "4.1" },
                  { value: "4", label: "4.0" },
                  { value: "3", label: "3" },
                ]}
              />
            </Field>
          </div>
          <Field label="Export Options">
            <textarea
              className={`${inputClass} h-20 font-mono text-xs`}
              value={form.options}
              onChange={(e) => setForm({ ...form, options: e.target.value })}
            />
          </Field>
          <div className="flex gap-6 mb-4">
            <Toggle
              checked={form.enabled}
              onChange={(v) => setForm({ ...form, enabled: v })}
              label="Enabled"
            />
            <Toggle
              checked={form.auto_enable}
              onChange={(v) => setForm({ ...form, auto_enable: v })}
              label="Auto Enable"
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
