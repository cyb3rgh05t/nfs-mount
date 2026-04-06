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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="mb-3">
      <label className="block text-sm font-medium text-gray-400 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500";

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
        <div className="flex items-center gap-3">
          <HardDrive className="w-7 h-7 text-blue-400" />
          <h1 className="text-2xl font-bold text-white">NFS Mounts</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleMountAll}
            disabled={loading === "mount-all"}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            <Zap className="w-4 h-4" />
            Mount All
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Neuer Mount
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4 text-red-400 text-sm flex items-center justify-between">
          {error}
          <button
            onClick={() => setError("")}
            className="text-red-400 hover:text-red-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* NFS Options Info */}
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-blue-400">
            Streaming-Optimiert
          </span>
        </div>
        <p className="text-xs text-gray-400">
          NFSv4.2 mit nconnect=16 (16 parallele TCP-Verbindungen), 1MB R/W
          Buffer, Attribute-Caching (1h), nocto, noatime — optimiert für 300+
          gleichzeitige Streams.
        </p>
      </div>

      {/* Mounts Table */}
      {mounts.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <HardDrive className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Keine NFS Mounts konfiguriert</p>
          <button
            onClick={openCreate}
            className="mt-3 text-blue-400 hover:text-blue-300 text-sm"
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
                className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-4"
              >
                {/* Status Indicator */}
                <div
                  className={`w-3 h-3 rounded-full flex-shrink-0 ${
                    mounted ? "bg-emerald-500" : "bg-gray-600"
                  }`}
                />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">{m.name}</span>
                    {!m.enabled && (
                      <span className="text-xs bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded">
                        Deaktiviert
                      </span>
                    )}
                    {m.auto_mount && (
                      <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">
                        Auto
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {m.server_ip}:{m.remote_path} → {m.local_path}
                  </p>
                </div>

                {/* Server Status */}
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${
                      st?.server_reachable ? "bg-emerald-500" : "bg-red-500"
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
                      className="p-2 text-orange-400 hover:bg-orange-500/10 rounded-lg transition-colors disabled:opacity-50"
                      title="Unmount"
                    >
                      <Square className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleMount(m.id)}
                      disabled={loading === `mount-${m.id}`}
                      className="p-2 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors disabled:opacity-50"
                      title="Mount"
                    >
                      <Play className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => openEdit(m)}
                    className="p-2 text-gray-400 hover:bg-gray-800 rounded-lg transition-colors"
                    title="Bearbeiten"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(m.id)}
                    className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
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
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={form.auto_mount}
                onChange={(e) =>
                  setForm({ ...form, auto_mount: e.target.checked })
                }
                className="rounded border-gray-600"
              />
              Auto-Mount
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) =>
                  setForm({ ...form, enabled: e.target.checked })
                }
                className="rounded border-gray-600"
              />
              Aktiviert
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              Abbrechen
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
            >
              {editing ? "Speichern" : "Erstellen"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
