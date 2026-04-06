import { useState, useEffect } from "react";
import { GitMerge, Plus, Play, Square, Trash2, Edit3, X } from "lucide-react";
import api from "../api/client";

const DEFAULT_OPTIONS =
  "rw,async_read=true,use_ino,allow_other,func.getattr=newest,category.action=all,category.create=ff,cache.files=auto-full,cache.readdir=true,cache.statfs=3600,cache.attr=120,cache.entry=120,cache.negative_entry=60,dropcacheonclose=true,minfreespace=10G,fsname=mergerfs";

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

export default function MergerFSPage() {
  const [configs, setConfigs] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
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
      } else {
        await api.createMergerFS(data);
      }
      setShowForm(false);
      fetchData();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("MergerFS Config wirklich löschen?")) return;
    try {
      await api.deleteMergerFS(id);
      fetchData();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleMount = async (id) => {
    setLoading(`mount-${id}`);
    try {
      await api.mountMergerFS(id);
      fetchData();
    } catch (e) {
      setError(e.message);
    }
    setLoading("");
  };

  const handleUnmount = async (id) => {
    setLoading(`unmount-${id}`);
    try {
      await api.unmountMergerFS(id);
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
          <GitMerge className="w-7 h-7 text-purple-400" />
          <h1 className="text-2xl font-bold text-white">MergerFS</h1>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-lg text-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Neue Config
        </button>
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

      {/* Info Box */}
      <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-4 mb-6">
        <p className="text-xs text-gray-400">
          MergerFS vereint mehrere Speicher-Pfade zu einem einzigen Mount.
          Optimiert mit full file caching, readdir cache, 120s attribute caching
          für maximale Streaming-Performance.
        </p>
      </div>

      {configs.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <GitMerge className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Keine MergerFS Configs vorhanden</p>
          <button
            onClick={openCreate}
            className="mt-3 text-purple-400 hover:text-purple-300 text-sm"
          >
            Jetzt erstellen →
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
                className="bg-gray-900 border border-gray-800 rounded-xl p-4"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`w-3 h-3 rounded-full flex-shrink-0 ${
                      mounted ? "bg-emerald-500" : "bg-gray-600"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">{c.name}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          mounted
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-gray-700 text-gray-400"
                        }`}
                      >
                        {mounted ? "Mounted" : "Unmounted"}
                      </span>
                      {c.auto_mount && (
                        <span className="text-xs bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded">
                          Auto
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      → {c.mount_point}
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    {mounted ? (
                      <button
                        onClick={() => handleUnmount(c.id)}
                        disabled={loading === `unmount-${c.id}`}
                        className="p-2 text-orange-400 hover:bg-orange-500/10 rounded-lg transition-colors disabled:opacity-50"
                        title="Unmount"
                      >
                        <Square className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleMount(c.id)}
                        disabled={loading === `mount-${c.id}`}
                        className="p-2 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors disabled:opacity-50"
                        title="Mount"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(c)}
                      className="p-2 text-gray-400 hover:bg-gray-800 rounded-lg transition-colors"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Sources */}
                <div className="mt-3 pl-7">
                  <p className="text-xs text-gray-500 mb-1">Quellen:</p>
                  <div className="flex flex-wrap gap-1">
                    {sources.map((src, i) => (
                      <span
                        key={i}
                        className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded"
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
          title={
            editing ? "MergerFS Config bearbeiten" : "Neue MergerFS Config"
          }
          onClose={() => setShowForm(false)}
        >
          <Field label="Name">
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="z.B. UnionFS"
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
          <Field label="Quellen (getrennt durch :)">
            <input
              className={inputClass}
              value={form.sources}
              onChange={(e) => setForm({ ...form, sources: e.target.value })}
              placeholder="/mnt/downloads:/mnt/storage:/mnt/storage2"
            />
          </Field>
          <Field label="MergerFS Optionen">
            <textarea
              className={`${inputClass} h-24 font-mono text-xs`}
              value={form.options}
              onChange={(e) => setForm({ ...form, options: e.target.value })}
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
              />
              Aktiviert
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white"
            >
              Abbrechen
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm"
            >
              {editing ? "Speichern" : "Erstellen"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
