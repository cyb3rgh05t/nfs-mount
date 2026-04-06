import { useState, useEffect } from "react";
import {
  Shield,
  Plus,
  Play,
  Square,
  Trash2,
  Edit3,
  X,
  RefreshCw,
  Eye,
  EyeOff,
  CheckCircle,
  AlertCircle,
  Wifi,
  WifiOff,
  Copy,
  FileText,
} from "lucide-react";
import api from "../api/client";

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

const inputClass =
  "w-full px-4 py-2.5 bg-nfs-input border border-nfs-border rounded-lg text-white placeholder-nfs-muted text-sm focus:outline-none focus:ring-2 focus:ring-nfs-primary focus:border-transparent";

const WG_TEMPLATE = `[Interface]
PrivateKey = YOUR_PRIVATE_KEY
Address = 10.0.0.2/24
DNS = 1.1.1.1

[Peer]
PublicKey = SERVER_PUBLIC_KEY
Endpoint = vpn.example.com:51820
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25`;

const OVPN_TEMPLATE = `client
dev tun
proto udp
remote vpn.example.com 1194
resolv-retry infinite
nobind
persist-key
persist-tun
ca ca.crt
cert client.crt
key client.key
cipher AES-256-GCM
auth SHA256
verb 3`;

export default function VPNPage() {
  const [configs, setConfigs] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showConfig, setShowConfig] = useState(null);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({
    name: "",
    vpn_type: "wireguard",
    config_content: "",
    auto_connect: false,
    enabled: true,
  });

  const fetchData = async () => {
    try {
      const [cfgs, sts] = await Promise.all([
        api.getVPNConfigs(),
        api.getAllVPNStatus().catch(() => []),
      ]);
      setConfigs(cfgs);
      const statusMap = {};
      sts.forEach((s) => (statusMap[s.id] = s));
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

  const showSuccessMsg = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 3000);
  };

  const openCreate = (type = "wireguard") => {
    setForm({
      name: "",
      vpn_type: type,
      config_content: type === "wireguard" ? WG_TEMPLATE : OVPN_TEMPLATE,
      auto_connect: false,
      enabled: true,
    });
    setEditing(null);
    setShowForm(true);
  };

  const openEdit = (cfg) => {
    setForm({
      name: cfg.name,
      vpn_type: cfg.vpn_type,
      config_content: cfg.config_content,
      auto_connect: cfg.auto_connect,
      enabled: cfg.enabled,
    });
    setEditing(cfg);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      if (editing) {
        await api.updateVPNConfig(editing.id, {
          name: form.name,
          config_content: form.config_content,
          auto_connect: form.auto_connect,
          enabled: form.enabled,
        });
        showSuccessMsg("VPN Konfiguration aktualisiert");
      } else {
        await api.createVPNConfig(form);
        showSuccessMsg("VPN Konfiguration erstellt");
      }
      setShowForm(false);
      setEditing(null);
      fetchData();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleConnect = async (id) => {
    setLoading(`connect-${id}`);
    try {
      const result = await api.connectVPN(id);
      if (result.success) showSuccessMsg("VPN verbunden");
      else setError(result.error || "Verbindung fehlgeschlagen");
      fetchData();
    } catch (e) {
      setError(e.message);
    }
    setLoading("");
  };

  const handleDisconnect = async (id) => {
    setLoading(`disconnect-${id}`);
    try {
      await api.disconnectVPN(id);
      showSuccessMsg("VPN getrennt");
      fetchData();
    } catch (e) {
      setError(e.message);
    }
    setLoading("");
  };

  const handleDelete = async (id) => {
    if (!confirm("VPN Konfiguration wirklich löschen?")) return;
    try {
      await api.deleteVPNConfig(id);
      showSuccessMsg("VPN Konfiguration gelöscht");
      fetchData();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10">
            <Shield className="w-5 h-5 text-emerald-400" />
          </div>
          VPN Tunnel
        </h1>
        <div className="flex gap-2">
          <button
            onClick={() => openCreate("wireguard")}
            className="px-4 py-2.5 bg-nfs-primary hover:bg-nfs-primary-hover text-black font-medium rounded-lg text-sm flex items-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            WireGuard
          </button>
          <button
            onClick={() => openCreate("openvpn")}
            className="px-4 py-2.5 bg-nfs-card border border-nfs-primary/50 text-nfs-primary hover:bg-nfs-primary/10 rounded-lg text-sm font-medium flex items-center gap-2 transition-all"
          >
            <Plus className="w-4 h-4" />
            OpenVPN
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm mb-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError("")}>
            <X className="w-4 h-4 opacity-60 hover:opacity-100" />
          </button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm mb-4">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {configs.length === 0 ? (
        <div className="bg-nfs-card border border-nfs-border rounded-xl p-12 text-center">
          <Shield className="w-12 h-12 text-nfs-muted mx-auto mb-4" />
          <p className="text-nfs-muted mb-2">Keine VPN Konfigurationen</p>
          <p className="text-sm text-nfs-muted">
            Erstelle eine WireGuard oder OpenVPN Konfiguration
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {configs.map((cfg) => {
            const st = statuses[cfg.id];
            const active = st?.is_active || false;

            return (
              <div
                key={cfg.id}
                className="bg-nfs-card border border-nfs-border rounded-xl p-4 hover:border-nfs-muted transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className={`p-2.5 rounded-xl ${
                        active
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-nfs-input text-nfs-muted"
                      }`}
                    >
                      {active ? (
                        <Wifi className="w-5 h-5" />
                      ) : (
                        <WifiOff className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-white">
                          {cfg.name}
                        </p>
                        <span
                          className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${
                            cfg.vpn_type === "wireguard"
                              ? "bg-purple-500/20 text-purple-400"
                              : "bg-orange-500/20 text-orange-400"
                          }`}
                        >
                          {cfg.vpn_type === "wireguard"
                            ? "WireGuard"
                            : "OpenVPN"}
                        </span>
                        {cfg.auto_connect && (
                          <span className="px-2 py-0.5 text-[10px] font-semibold bg-blue-500/20 text-blue-400 rounded-full">
                            Auto
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs ${
                            active ? "text-emerald-400" : "text-nfs-muted"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              active
                                ? "bg-emerald-400 animate-pulse"
                                : "bg-nfs-muted"
                            }`}
                          />
                          {active ? "Verbunden" : "Getrennt"}
                        </span>
                        {st?.endpoint && (
                          <span className="text-xs text-nfs-muted">
                            {st.endpoint}
                          </span>
                        )}
                        {st?.transfer?.raw && (
                          <span className="text-xs text-nfs-muted">
                            {st.transfer.raw}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* View Config */}
                    <button
                      onClick={() => setShowConfig(cfg)}
                      className="p-2 rounded-lg text-nfs-muted hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                      title="Config anzeigen"
                    >
                      <FileText className="w-4 h-4" />
                    </button>

                    {/* Connect/Disconnect */}
                    {active ? (
                      <button
                        onClick={() => handleDisconnect(cfg.id)}
                        disabled={loading === `disconnect-${cfg.id}`}
                        className="p-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                        title="Trennen"
                      >
                        <Square className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleConnect(cfg.id)}
                        disabled={loading === `connect-${cfg.id}`}
                        className="p-2 rounded-lg text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
                        title="Verbinden"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    )}

                    {/* Edit */}
                    <button
                      onClick={() => openEdit(cfg)}
                      className="p-2 rounded-lg text-nfs-muted hover:text-nfs-primary hover:bg-nfs-primary/10 transition-colors"
                      title="Bearbeiten"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(cfg.id)}
                      className="p-2 rounded-lg text-nfs-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Löschen"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Peers info for WireGuard */}
                {active && st?.peers?.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-nfs-border">
                    <p className="text-xs text-nfs-muted mb-2">Peers:</p>
                    <div className="space-y-1">
                      {st.peers.map((peer, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between bg-nfs-input/50 rounded-lg px-3 py-2"
                        >
                          <code className="text-xs text-nfs-text font-mono truncate max-w-[200px]">
                            {peer.public_key}
                          </code>
                          <div className="flex items-center gap-3 text-xs text-nfs-muted">
                            {peer.endpoint && <span>{peer.endpoint}</span>}
                            {peer.latest_handshake && (
                              <span>{peer.latest_handshake}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <Modal
          title={
            editing
              ? "VPN Konfiguration bearbeiten"
              : `Neue ${form.vpn_type === "wireguard" ? "WireGuard" : "OpenVPN"} Konfiguration`
          }
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Name">
              <input
                className={inputClass}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="z.B. Office VPN"
                required
              />
            </Field>

            {!editing && (
              <Field label="VPN Typ">
                <select
                  className={inputClass}
                  value={form.vpn_type}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      vpn_type: e.target.value,
                      config_content:
                        e.target.value === "wireguard"
                          ? WG_TEMPLATE
                          : OVPN_TEMPLATE,
                    })
                  }
                >
                  <option value="wireguard">WireGuard</option>
                  <option value="openvpn">OpenVPN</option>
                </select>
              </Field>
            )}

            <Field label="Konfiguration">
              <textarea
                className={`${inputClass} font-mono text-xs leading-relaxed`}
                value={form.config_content}
                onChange={(e) =>
                  setForm({ ...form, config_content: e.target.value })
                }
                rows={14}
                placeholder="Konfiguration hier einfügen..."
                spellCheck={false}
              />
            </Field>

            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-nfs-text">
                <input
                  type="checkbox"
                  checked={form.auto_connect}
                  onChange={(e) =>
                    setForm({ ...form, auto_connect: e.target.checked })
                  }
                />
                Auto-Connect
              </label>
              <label className="flex items-center gap-2 text-sm text-nfs-text">
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

            <button
              type="submit"
              className="w-full py-2.5 bg-nfs-primary hover:bg-nfs-primary-hover text-black font-semibold rounded-lg text-sm transition-colors"
            >
              {editing ? "Speichern" : "Erstellen"}
            </button>
          </form>
        </Modal>
      )}

      {/* View Config Modal */}
      {showConfig && (
        <Modal
          title={`${showConfig.name} - Konfiguration`}
          onClose={() => setShowConfig(null)}
        >
          <div className="relative">
            <button
              onClick={() => {
                navigator.clipboard.writeText(showConfig.config_content);
                showSuccessMsg("In Zwischenablage kopiert");
              }}
              className="absolute top-2 right-2 p-2 rounded-lg bg-nfs-input/80 text-nfs-muted hover:text-white transition-colors"
              title="Kopieren"
            >
              <Copy className="w-4 h-4" />
            </button>
            <pre className="bg-nfs-input border border-nfs-border rounded-lg p-4 text-xs text-nfs-text font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[60vh] overflow-y-auto">
              {showConfig.config_content}
            </pre>
          </div>
        </Modal>
      )}
    </div>
  );
}
