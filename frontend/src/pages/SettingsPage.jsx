import { useState, useEffect } from "react";
import {
  Settings,
  Bell,
  MessageSquare,
  Send,
  Save,
  Trash2,
  TestTube,
  Key,
  Cpu,
  X,
  CheckCircle,
  AlertCircle,
  User,
  Lock,
  Eye,
  EyeOff,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import api from "../api/client";

const inputClass =
  "w-full px-4 py-2.5 bg-nfs-input border border-nfs-border rounded-lg text-white placeholder-nfs-muted text-sm focus:outline-none focus:ring-2 focus:ring-nfs-primary focus:border-transparent";

function Section({ icon: Icon, title, iconColor, children }) {
  return (
    <div className="bg-nfs-card border border-nfs-border rounded-xl p-5 mb-6 hover:border-nfs-muted transition-all">
      <div className="flex items-center gap-3 mb-4">
        <div className={`p-2 rounded-lg ${iconColor}`}>
          <Icon className="w-4 h-4" />
        </div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
      </div>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const { user, updateUser } = useAuth();
  const [configs, setConfigs] = useState([]);
  const [kernelParams, setKernelParams] = useState([]);
  const [apiKey, setApiKey] = useState(localStorage.getItem("apiKey") || "");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [discordForm, setDiscordForm] = useState({
    webhook_url: "",
    enabled: false,
  });
  const [telegramForm, setTelegramForm] = useState({
    bot_token: "",
    chat_id: "",
    topic_id: "",
    enabled: false,
  });

  // Profile
  const [displayName, setDisplayName] = useState(user?.display_name || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);

  const fetchData = async () => {
    try {
      const [notifs, params] = await Promise.all([
        api.getNotificationConfigs().catch(() => []),
        api.getKernelParams().catch(() => []),
      ]);
      setConfigs(notifs);
      setKernelParams(params);

      const discord = notifs.find((n) => n.type === "discord");
      if (discord) {
        setDiscordForm({
          webhook_url: discord.webhook_url,
          enabled: discord.enabled,
        });
      }
      const telegram = notifs.find((n) => n.type === "telegram");
      if (telegram) {
        setTelegramForm({
          bot_token: telegram.bot_token,
          chat_id: telegram.chat_id,
          topic_id: telegram.topic_id,
          enabled: telegram.enabled,
        });
      }
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const showSuccess = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 3000);
  };

  const saveApiKey = () => {
    localStorage.setItem("apiKey", apiKey);
    showSuccess("API key saved");
  };

  const saveProfile = async () => {
    try {
      const updated = await api.updateMe({ display_name: displayName });
      updateUser(updated);
      showSuccess("Profile updated");
    } catch (e) {
      setError(e.message);
    }
  };

  const changePassword = async () => {
    if (!currentPassword || !newPassword) {
      setError("Both password fields are required");
      return;
    }
    try {
      await api.changePassword(currentPassword, newPassword);
      showSuccess("Password changed");
      setCurrentPassword("");
      setNewPassword("");
    } catch (e) {
      setError(e.message);
    }
  };

  const saveDiscord = async () => {
    try {
      const existing = configs.find((c) => c.type === "discord");
      if (existing) {
        await api.updateNotification(existing.id, discordForm);
      } else {
        await api.createNotification({ type: "discord", ...discordForm });
      }
      showSuccess("Discord configuration saved");
      fetchData();
    } catch (e) {
      setError(e.message);
    }
  };

  const saveTelegram = async () => {
    try {
      const existing = configs.find((c) => c.type === "telegram");
      if (existing) {
        await api.updateNotification(existing.id, telegramForm);
      } else {
        await api.createNotification({ type: "telegram", ...telegramForm });
      }
      showSuccess("Telegram configuration saved");
      fetchData();
    } catch (e) {
      setError(e.message);
    }
  };

  const testDiscord = async () => {
    try {
      await api.testNotification("discord", "Test from NFS-MergerFS Manager");
      showSuccess("Discord test sent");
    } catch (e) {
      setError(e.message);
    }
  };

  const testTelegram = async () => {
    try {
      await api.testNotification("telegram", "Test from NFS-MergerFS Manager");
      showSuccess("Telegram test sent");
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-white flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-nfs-primary/10">
          <Settings className="w-5 h-5 text-nfs-primary" />
        </div>
        Settings
      </h1>

      {error && (
        <div className="flex items-center justify-between gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm mb-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError("")}
            className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm mb-4">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Profile */}
      <Section
        icon={User}
        title="Profile"
        iconColor="bg-blue-500/10 text-blue-400"
      >
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-nfs-muted mb-1.5">
              Username
            </label>
            <input
              className={`${inputClass} opacity-60`}
              value={user?.username || ""}
              disabled
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-nfs-muted mb-1.5">
              Display Name
            </label>
            <input
              className={inputClass}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your display name"
            />
          </div>
          <button
            onClick={saveProfile}
            className="px-4 py-2 bg-nfs-card border border-nfs-primary/50 text-nfs-primary hover:bg-nfs-primary/10 hover:border-nfs-primary rounded-lg text-sm font-medium flex items-center gap-2 transition-all"
          >
            <Save className="w-4 h-4" />
            Save Profile
          </button>
        </div>
      </Section>

      {/* Password Change */}
      <Section
        icon={Lock}
        title="Change Password"
        iconColor="bg-red-500/10 text-red-400"
      >
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-nfs-muted mb-1.5">
              Current Password
            </label>
            <div className="relative">
              <input
                className={inputClass}
                type={showCurrentPass ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPass(!showCurrentPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-nfs-muted hover:text-white"
              >
                {showCurrentPass ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-nfs-muted mb-1.5">
              New Password
            </label>
            <div className="relative">
              <input
                className={inputClass}
                type={showNewPass ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowNewPass(!showNewPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-nfs-muted hover:text-white"
              >
                {showNewPass ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
          <button
            onClick={changePassword}
            className="px-4 py-2 bg-nfs-card border border-red-500/50 text-red-400 hover:bg-red-500/10 hover:border-red-500 rounded-lg text-sm font-medium flex items-center gap-2 transition-all"
          >
            <Lock className="w-4 h-4" />
            Change Password
          </button>
        </div>
      </Section>

      {/* API Key */}
      <Section
        icon={Key}
        title="API Key"
        iconColor="bg-nfs-primary/10 text-nfs-primary"
      >
        <p className="text-xs text-nfs-muted mb-3 leading-relaxed">
          Set an API key to secure the REST API. The key is stored in the
          browser.
        </p>
        <div className="flex gap-2">
          <input
            className={inputClass}
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter API key..."
          />
          <button
            onClick={saveApiKey}
            className="px-4 py-2.5 bg-nfs-primary hover:bg-nfs-primary-hover text-black font-medium rounded-lg text-sm flex items-center gap-2 transition-colors shrink-0"
          >
            <Save className="w-4 h-4" />
            Save
          </button>
        </div>
      </Section>

      {/* Discord */}
      <Section
        icon={MessageSquare}
        title="Discord Notifications"
        iconColor="bg-indigo-500/10 text-indigo-400"
      >
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-nfs-text">
            <input
              type="checkbox"
              checked={discordForm.enabled}
              onChange={(e) =>
                setDiscordForm({ ...discordForm, enabled: e.target.checked })
              }
            />
            Enabled
          </label>
          <div>
            <label className="block text-sm font-medium text-nfs-muted mb-1.5">
              Webhook URL
            </label>
            <input
              className={inputClass}
              value={discordForm.webhook_url}
              onChange={(e) =>
                setDiscordForm({ ...discordForm, webhook_url: e.target.value })
              }
              placeholder="https://discord.com/api/webhooks/..."
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={saveDiscord}
              className="px-4 py-2 bg-nfs-card border border-nfs-primary/50 text-nfs-primary hover:bg-nfs-primary/10 hover:border-nfs-primary rounded-lg text-sm font-medium flex items-center gap-2 transition-all"
            >
              <Save className="w-4 h-4" />
              Save
            </button>
            <button
              onClick={testDiscord}
              className="px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-muted text-nfs-text rounded-lg text-sm flex items-center gap-2 transition-all"
            >
              <Send className="w-4 h-4" />
              Test
            </button>
          </div>
        </div>
      </Section>

      {/* Telegram */}
      <Section
        icon={Send}
        title="Telegram Notifications"
        iconColor="bg-blue-500/10 text-blue-400"
      >
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-nfs-text">
            <input
              type="checkbox"
              checked={telegramForm.enabled}
              onChange={(e) =>
                setTelegramForm({ ...telegramForm, enabled: e.target.checked })
              }
            />
            Enabled
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-nfs-muted mb-1.5">
                Bot Token
              </label>
              <input
                className={inputClass}
                type="password"
                value={telegramForm.bot_token}
                onChange={(e) =>
                  setTelegramForm({
                    ...telegramForm,
                    bot_token: e.target.value,
                  })
                }
                placeholder="123456:ABC..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-nfs-muted mb-1.5">
                Chat ID
              </label>
              <input
                className={inputClass}
                value={telegramForm.chat_id}
                onChange={(e) =>
                  setTelegramForm({ ...telegramForm, chat_id: e.target.value })
                }
                placeholder="-100..."
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-nfs-muted mb-1.5">
              Topic ID (optional)
            </label>
            <input
              className={inputClass}
              value={telegramForm.topic_id}
              onChange={(e) =>
                setTelegramForm({ ...telegramForm, topic_id: e.target.value })
              }
              placeholder="Optional"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={saveTelegram}
              className="px-4 py-2 bg-nfs-card border border-nfs-primary/50 text-nfs-primary hover:bg-nfs-primary/10 hover:border-nfs-primary rounded-lg text-sm font-medium flex items-center gap-2 transition-all"
            >
              <Save className="w-4 h-4" />
              Save
            </button>
            <button
              onClick={testTelegram}
              className="px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-muted text-nfs-text rounded-lg text-sm flex items-center gap-2 transition-all"
            >
              <Send className="w-4 h-4" />
              Test
            </button>
          </div>
        </div>
      </Section>

      {/* Kernel Tuning */}
      <Section
        icon={Cpu}
        title="Kernel Tuning (NFS Streaming)"
        iconColor="bg-amber-500/10 text-amber-400"
      >
        <p className="text-xs text-nfs-muted mb-3 leading-relaxed">
          Current kernel parameters for NFS streaming optimization (300+
          streams).
        </p>
        {kernelParams.length > 0 ? (
          <div className="space-y-1">
            {kernelParams.map((p) => (
              <div
                key={p.name}
                className="flex items-center justify-between bg-nfs-input/50 rounded-lg px-4 py-2.5"
              >
                <code className="text-xs text-nfs-text font-mono">
                  {p.name}
                </code>
                <code className="text-xs text-nfs-primary font-mono font-semibold">
                  {p.value}
                </code>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-nfs-muted">Keine Parameter verfügbar</p>
        )}
      </Section>
    </div>
  );
}
