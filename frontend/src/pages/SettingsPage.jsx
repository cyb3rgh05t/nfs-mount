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
} from "lucide-react";
import api from "../api/client";

const inputClass =
  "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500";

function Section({ icon: Icon, title, color, children }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Icon className={`w-5 h-5 text-${color}-400`} />
        <h2 className="text-lg font-semibold text-white">{title}</h2>
      </div>
      {children}
    </div>
  );
}

export default function SettingsPage() {
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
    showSuccess("API Key gespeichert");
  };

  const saveDiscord = async () => {
    try {
      const existing = configs.find((c) => c.type === "discord");
      if (existing) {
        await api.updateNotification(existing.id, discordForm);
      } else {
        await api.createNotification({ type: "discord", ...discordForm });
      }
      showSuccess("Discord Konfiguration gespeichert");
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
      showSuccess("Telegram Konfiguration gespeichert");
      fetchData();
    } catch (e) {
      setError(e.message);
    }
  };

  const testDiscord = async () => {
    try {
      await api.testNotification("discord", "Test von NFS-MergerFS Manager");
      showSuccess("Discord Test gesendet");
    } catch (e) {
      setError(e.message);
    }
  };

  const testTelegram = async () => {
    try {
      await api.testNotification("telegram", "Test von NFS-MergerFS Manager");
      showSuccess("Telegram Test gesendet");
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Settings className="w-7 h-7 text-gray-400" />
        <h1 className="text-2xl font-bold text-white">Einstellungen</h1>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4 text-red-400 text-sm flex items-center justify-between">
          {error}
          <button onClick={() => setError("")}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {success && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 mb-4 text-emerald-400 text-sm">
          {success}
        </div>
      )}

      {/* API Key */}
      <Section icon={Key} title="API Key" color="yellow">
        <p className="text-xs text-gray-500 mb-3">
          Setze einen API Key um die REST API abzusichern. Der Key wird im
          Browser gespeichert.
        </p>
        <div className="flex gap-2">
          <input
            className={inputClass}
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="API Key eingeben..."
          />
          <button
            onClick={saveApiKey}
            className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            Speichern
          </button>
        </div>
      </Section>

      {/* Discord */}
      <Section
        icon={MessageSquare}
        title="Discord Benachrichtigungen"
        color="indigo"
      >
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={discordForm.enabled}
              onChange={(e) =>
                setDiscordForm({ ...discordForm, enabled: e.target.checked })
              }
            />
            Aktiviert
          </label>
          <div>
            <label className="block text-sm text-gray-400 mb-1">
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
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              Speichern
            </button>
            <button
              onClick={testDiscord}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              Test
            </button>
          </div>
        </div>
      </Section>

      {/* Telegram */}
      <Section icon={Send} title="Telegram Benachrichtigungen" color="blue">
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={telegramForm.enabled}
              onChange={(e) =>
                setTelegramForm({ ...telegramForm, enabled: e.target.checked })
              }
            />
            Aktiviert
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">
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
              <label className="block text-sm text-gray-400 mb-1">
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
            <label className="block text-sm text-gray-400 mb-1">
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
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              Speichern
            </button>
            <button
              onClick={testTelegram}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              Test
            </button>
          </div>
        </div>
      </Section>

      {/* Kernel Tuning */}
      <Section icon={Cpu} title="Kernel Tuning (NFS Streaming)" color="orange">
        <p className="text-xs text-gray-500 mb-3">
          Aktuelle Kernel-Parameter für NFS Streaming-Optimierung (300+
          Streams).
        </p>
        {kernelParams.length > 0 ? (
          <div className="space-y-1">
            {kernelParams.map((p) => (
              <div
                key={p.name}
                className="flex items-center justify-between bg-gray-800/50 rounded-lg px-3 py-2"
              >
                <code className="text-xs text-gray-300">{p.name}</code>
                <code className="text-xs text-emerald-400 font-mono">
                  {p.value}
                </code>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">Keine Parameter verfügbar</p>
        )}
      </Section>
    </div>
  );
}
