import { useState, useEffect } from "react";
import {
  HardDrive,
  Plus,
  Play,
  Square,
  Trash2,
  Edit3,
  X,
  RefreshCw,
  Zap,
} from "lucide-react";
import api from "../api/client";

const DEFAULT_OPTIONS =
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

export default function NFSPage() {
  const [mounts, setMounts] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    server_ip: "",
    remote_path: "/",
    local_path: "/mnt/",
    nfs_version: "4.2",
    options: DEFAULT_OPTIONS,
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
      options: DEFAULT_OPTIONS,
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
      } else {
        await api.createNFSMount(form);
      }
      setShowForm(false);
      fetchData();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("NFS Mount wirklich löschen?")) return;
    try {
      await api.deleteNFSMount(id);
      fetchData();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleMount = async (id) => {
    setLoading(`mount-${id}`);
    try {
      await api.mountNFS(id);
      fetchData();
    } catch (e) {
      setError(e.message);
    }
    setLoading("");
  };

  const handleUnmount = async (id) => {
    setLoading(`unmount-${id}`);
    try {
      await api.unmountNFS(id);
      fetchData();
    } catch (e) {
      setError(e.message);
    }
    setLoading("");
  };

  const handleMountAll = async () => {
    setLoading("mount-all");
    try {
      await api.mountAllNFS();
      fetchData();
    } catch (e) {
      setError(e.message);
    }
    setLoading("");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <div className="p-2 rounded-lg bg-nfs-primary/10">
            <HardDrive className="w-5 h-5 text-nfs-primary" />
          </div>
          NFS Mounts
        </h1>
        <div className="flex gap-2">
          <button
            onClick={handleMountAll}
            disabled={loading === "mount-all"}
            className="flex items-center gap-2 px-4 py-2 bg-nfs-card border border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-400 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
          >
            <Zap className="w-4 h-4" />
            Mount All
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-nfs-primary hover:bg-nfs-primary-hover text-black font-medium rounded-lg text-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Neuer Mount
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
      <div className="bg-nfs-card border border-nfs-primary/20 rounded-xl p-4 mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-4 h-4 text-nfs-primary" />
          <span className="text-sm font-medium text-nfs-primary">
            Streaming-Optimiert
          </span>
        </div>
        <p className="text-xs text-nfs-muted leading-relaxed">
          NFSv4.2 mit nconnect=16 (16 parallele TCP-Verbindungen), 1MB R/W
          Buffer, Attribute-Caching (1h), nocto, noatime — optimiert für 300+
          gleichzeitige Streams.
        </p>
      </div>

      {/* Mounts Table */}
      {mounts.length === 0 ? (
        <div className="text-center py-16 text-nfs-muted">
          <HardDrive className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Keine NFS Mounts konfiguriert</p>
          <button
            onClick={openCreate}
            className="mt-3 text-nfs-primary hover:text-nfs-primary-hover text-sm"
          >
            Jetzt erstellen →
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
                {/* Status Indicator */}
                <div
                  className={`w-3 h-3 rounded-full flex-shrink-0 ${
                    mounted ? "bg-emerald-400 animate-pulse" : "bg-nfs-muted"
                  }`}
                />

                {/* Info */}
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

                {/* Server Status */}
                <div className="flex items-center gap-1.5 text-xs text-nfs-muted">
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${
                      st?.server_reachable ? "bg-emerald-400" : "bg-red-400"
                    }`}
                  />
                  Server
                </div>

                {/* Actions */}
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
                    title="Bearbeiten"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(m.id)}
                    className="p-2 rounded-lg text-nfs-muted hover:bg-red-500/10 hover:text-red-400 transition-all active:scale-90"
                    title="Löschen"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <Modal
          title={editing ? "NFS Mount bearbeiten" : "Neuer NFS Mount"}
          onClose={() => setShowForm(false)}
        >
          <Field label="Name">
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="z.B. Storage-1"
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
                <option value="4.2">4.2 (empfohlen)</option>
                <option value="4.1">4.1</option>
                <option value="4">4.0</option>
                <option value="3">3</option>
              </select>
            </Field>
          </div>
          <Field label="Remote Pfad">
            <input
              className={inputClass}
              value={form.remote_path}
              onChange={(e) =>
                setForm({ ...form, remote_path: e.target.value })
              }
              placeholder="/mnt/raidpool/filesystem/"
            />
          </Field>
          <Field label="Lokaler Mountpoint">
            <input
              className={inputClass}
              value={form.local_path}
              onChange={(e) => setForm({ ...form, local_path: e.target.value })}
              placeholder="/mnt/storage"
            />
          </Field>
          <Field label="Mount Optionen">
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
            <label className="flex items-center gap-2 text-sm text-nfs-text">
              <input
                type="checkbox"
                checked={form.auto_mount}
                onChange={(e) =>
                  setForm({ ...form, auto_mount: e.target.checked })
                }
                className="rounded border-nfs-border"
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
                className="rounded border-nfs-border"
              />
              Aktiviert
            </label>
          </div>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-muted text-nfs-text rounded-lg text-sm transition-all"
            >
              Abbrechen
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-nfs-primary hover:bg-nfs-primary-hover text-black font-medium rounded-lg text-sm transition-colors"
            >
              {editing ? "Speichern" : "Erstellen"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
