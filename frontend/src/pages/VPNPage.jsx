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
  Save,
} from "lucide-react";
import api from "../api/client";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmProvider";
import { useCachedState } from "../hooks/useCache";
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
  const [configs, setConfigs] = useCachedState("vpn-configs", []);
  const [statuses, setStatuses] = useCachedState("vpn-statuses", {});
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showConfig, setShowConfig] = useState(null);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const toast = useToast();
  const confirmDlg = useConfirm();
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
    toast.success(msg);
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
        toast.success(`VPN "${form.name}" updated`);
      } else {
        await api.createVPNConfig(form);
        toast.success(`VPN "${form.name}" created`);
      }
      setShowForm(false);
      setEditing(null);
      fetchData();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleConnect = async (id) => {
    const cfg = configs.find((c) => c.id === id);
    setLoading(`connect-${id}`);
    try {
      const result = await api.connectVPN(id);
      if (result.success) toast.success(`VPN "${cfg?.name}" connected`);
      else toast.error(result.error || "Connection failed");
      fetchData();
    } catch (e) {
      toast.error(e.message);
    }
    setLoading("");
  };

  const handleDisconnect = async (id) => {
    const cfg = configs.find((c) => c.id === id);
    const ok = await confirmDlg({
      title: "Disconnect VPN?",
      message: `Disconnect "${cfg?.name || "this VPN"}"? Network traffic will no longer be tunneled.`,
      variant: "warning",
      confirmText: "Disconnect",
    });
    if (!ok) return;
    setLoading(`disconnect-${id}`);
    try {
      await api.disconnectVPN(id);
      toast.success(`VPN "${cfg?.name}" disconnected`);
      fetchData();
    } catch (e) {
      toast.error(e.message);
    }
    setLoading("");
  };

  const handleDelete = async (id) => {
    const cfg = configs.find((c) => c.id === id);
    const ok = await confirmDlg({
      title: "Delete VPN Configuration?",
      message: `This will disconnect and remove "${cfg?.name || "this VPN"}". This action cannot be undone.`,
      variant: "danger",
      confirmText: "Delete",
    });
    if (!ok) return;
    try {
      await api.deleteVPNConfig(id);
      toast.success(`VPN "${cfg?.name}" deleted`);
      fetchData();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10">
            <Shield className="w-5 h-5 text-nfs-primary" />
          </div>
          VPN Tunnel
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => openCreate("wireguard")}
            className="flex items-center gap-2 px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium transition-all"
          >
            <Plus className="w-4 h-4 text-nfs-primary" />
            WireGuard
          </button>
          <button
            onClick={() => openCreate("openvpn")}
            className="flex items-center gap-2 px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium transition-all"
          >
            <Plus className="w-4 h-4 text-nfs-primary" />
            OpenVPN
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

      {configs.length === 0 ? (
        <div className="bg-nfs-card border border-nfs-border rounded-xl p-12 text-center">
          <Shield className="w-12 h-12 text-nfs-muted mx-auto mb-4 opacity-30" />
          <p className="text-nfs-muted mb-2">No VPN configurations</p>
          <p className="text-sm text-nfs-muted mb-4">
            Create a WireGuard or OpenVPN configuration
          </p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => openCreate("wireguard")}
              className="px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-all"
            >
              <Plus className="w-4 h-4 text-nfs-primary" />
              WireGuard
            </button>
            <button
              onClick={() => openCreate("openvpn")}
              className="px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-all"
            >
              <Plus className="w-4 h-4 text-nfs-primary" />
              OpenVPN
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {configs.map((cfg) => {
            const st = statuses[cfg.id];
            const active = st?.is_active || false;
            const iface =
              cfg.vpn_type === "wireguard" ? `wg${cfg.id}` : `ovpn${cfg.id}`;

            return (
              <div
                key={cfg.id}
                className="bg-nfs-card border border-nfs-border rounded-xl p-4 hover:border-nfs-muted transition-all"
              >
                {/* Header */}
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-white">
                          {cfg.name}
                        </p>
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full border ${
                            active
                              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                              : "bg-slate-500/15 text-slate-400 border-slate-500/30"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              active
                                ? "bg-emerald-400 animate-pulse"
                                : "bg-slate-400"
                            }`}
                          />
                          {active ? "Connected" : "Disconnected"}
                        </span>
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
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setShowConfig(cfg)}
                      className="p-2 rounded-lg text-nfs-muted hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                      title="View config"
                    >
                      <FileText className="w-4 h-4" />
                    </button>
                    {active ? (
                      <button
                        onClick={() => handleDisconnect(cfg.id)}
                        disabled={loading === `disconnect-${cfg.id}`}
                        className="p-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                        title="Disconnect"
                      >
                        <Square className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleConnect(cfg.id)}
                        disabled={loading === `connect-${cfg.id}`}
                        className="p-2 rounded-lg text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
                        title="Connect"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(cfg)}
                      className="p-2 rounded-lg text-nfs-muted hover:text-nfs-primary hover:bg-nfs-primary/10 transition-colors"
                      title="Edit"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(cfg.id)}
                      className="p-2 rounded-lg text-nfs-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Mini info cards */}
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="bg-nfs-bg/50 rounded-lg px-3 py-2">
                    <p className="text-[10px] text-nfs-muted uppercase tracking-wider">
                      Interface
                    </p>
                    <p className="text-xs text-white font-mono mt-0.5">
                      {iface}
                    </p>
                  </div>
                  <div className="bg-nfs-bg/50 rounded-lg px-3 py-2">
                    <p className="text-[10px] text-nfs-muted uppercase tracking-wider">
                      Endpoint
                    </p>
                    <p className="text-xs text-white font-mono truncate mt-0.5">
                      {st?.endpoint || "—"}
                    </p>
                  </div>
                  <div className="bg-nfs-bg/50 rounded-lg px-3 py-2">
                    <p className="text-[10px] text-nfs-muted uppercase tracking-wider">
                      Transfer
                    </p>
                    <p className="text-xs text-white font-mono truncate mt-0.5">
                      {st?.transfer?.raw || "—"}
                    </p>
                  </div>
                  <div className="bg-nfs-bg/50 rounded-lg px-3 py-2">
                    <p className="text-[10px] text-nfs-muted uppercase tracking-wider">
                      Type
                    </p>
                    <p className="text-xs text-white mt-0.5">
                      {cfg.vpn_type === "wireguard" ? "WireGuard" : "OpenVPN"}
                    </p>
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
              ? "Edit VPN Configuration"
              : `New ${form.vpn_type === "wireguard" ? "WireGuard" : "OpenVPN"} Configuration`
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
                placeholder="e.g. Office VPN"
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

            <Field label="Configuration">
              <textarea
                className={`${inputClass} font-mono text-xs leading-relaxed`}
                value={form.config_content}
                onChange={(e) =>
                  setForm({ ...form, config_content: e.target.value })
                }
                rows={14}
                placeholder="Paste configuration here..."
                spellCheck={false}
              />
            </Field>

            <div className="flex gap-4">
              <Toggle
                checked={form.auto_connect}
                onChange={(val) => setForm({ ...form, auto_connect: val })}
                label="Auto-Connect"
              />
              <Toggle
                checked={form.enabled}
                onChange={(val) => setForm({ ...form, enabled: val })}
                label="Enabled"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white font-semibold rounded-lg text-sm transition-all flex items-center justify-center gap-2"
            >
              {editing ? (
                <Save className="w-4 h-4 text-nfs-primary" />
              ) : (
                <Plus className="w-4 h-4 text-nfs-primary" />
              )}
              {editing ? "Save" : "Create"}
            </button>
          </form>
        </Modal>
      )}

      {/* View Config Modal */}
      {showConfig && (
        <Modal
          title={`${showConfig.name} - Configuration`}
          onClose={() => setShowConfig(null)}
        >
          <div className="relative">
            <button
              onClick={() => {
                navigator.clipboard.writeText(showConfig.config_content);
                toast.success("Copied to clipboard");
              }}
              className="absolute top-2 right-2 p-2 rounded-lg bg-nfs-input/80 text-nfs-muted hover:text-white transition-colors"
              title="Copy"
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
