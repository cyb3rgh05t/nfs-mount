import { useState, useEffect, useRef } from "react";
import {
  Settings,
  Bell,
  MessageSquare,
  Send,
  Save,
  Key,
  Cpu,
  User,
  Users,
  Lock,
  Eye,
  EyeOff,
  Wrench,
  BookOpen,
  HardDrive,
  GitMerge,
  Shield,
  ShieldOff,
  ShieldCheck,
  ShieldAlert,
  ChevronDown,
  ChevronRight,
  Terminal,
  Globe,
  Layers,
  Info,
  ExternalLink,
  Heart,
  FolderSync,
  Database,
  Activity,
  Box,
  Plus,
  Trash2,
  Copy,
  Circle,
  Edit3,
  X,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Zap,
  Network,
  KeyRound,
  Upload,
  Download,
  Flame,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmProvider";
import { useSearchParams } from "react-router-dom";
import api from "../api/client";
import { useCachedState } from "../hooks/useCache";
import InfoBox from "../components/InfoBox";
import ProgressDialog from "../components/ProgressDialog";
import CustomSelect from "../components/CustomSelect";

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

function CollapsibleSection({
  icon: Icon,
  title,
  iconColor,
  defaultOpen = false,
  children,
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-nfs-card border border-nfs-border rounded-xl mb-4 hover:border-nfs-muted transition-all overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-5 text-left"
      >
        <div className={`p-2 rounded-lg ${iconColor}`}>
          <Icon className="w-4 h-4" />
        </div>
        <h2 className="text-lg font-semibold text-white flex-1">{title}</h2>
        {open ? (
          <ChevronDown className="w-5 h-5 text-nfs-muted" />
        ) : (
          <ChevronRight className="w-5 h-5 text-nfs-muted" />
        )}
      </button>
      {open && (
        <div className="px-5 pb-5 text-sm text-nfs-text leading-relaxed space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}

function Code({ children }) {
  return (
    <code className="px-1.5 py-0.5 bg-nfs-input border border-nfs-border rounded text-xs text-nfs-primary font-mono">
      {children}
    </code>
  );
}

function CodeBlock({ children }) {
  return (
    <pre className="bg-nfs-input border border-nfs-border rounded-lg p-4 text-xs text-nfs-text font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">
      {children}
    </pre>
  );
}

const tabs = [
  { id: "profile", label: "User Management", icon: Users },
  { id: "security", label: "Security", icon: Key },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "system", label: "System", icon: Wrench },
  { id: "firewall", label: "Firewall", icon: Flame },
  { id: "sshkeys", label: "SSH Keys", icon: KeyRound },
  { id: "howto", label: "How To", icon: BookOpen },
  { id: "about", label: "About", icon: Info },
];

export default function SettingsPage() {
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => {
    const tabParam = searchParams.get("tab");
    const validTabs = tabs.map((t) => t.id);
    return tabParam && validTabs.includes(tabParam) ? tabParam : "profile";
  });
  const [configs, setConfigs] = useCachedState("settings-notifs", []);
  const [kernelParams, setKernelParams] = useCachedState("settings-kernel", []);
  const [dockerInfo, setDockerInfo] = useCachedState("settings-docker", null);
  const [rpsXps, setRpsXps] = useCachedState("settings-rpsxps", null);
  const [nfsThreads, setNfsThreads] = useCachedState(
    "settings-nfsthreads",
    null,
  );
  const [appSettings, setAppSettings] = useCachedState("settings-app", null);
  const [apiKeys, setApiKeys] = useCachedState("settings-apikeys", []);
  const [sshKeys, setSSHKeys] = useCachedState("settings-sshkeys", []);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState(null);
  const [firewallStatus, setFirewallStatus] = useCachedState(
    "settings-firewall",
    null,
  );
  const [firewallLoading, setFirewallLoading] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState(null);
  const [showNewKeyForm, setShowNewKeyForm] = useState(false);
  const [discordForm, setDiscordForm] = useState({
    webhook_url: "",
    enabled: false,
  });
  const [showDiscordWebhook, setShowDiscordWebhook] = useState(false);
  const [telegramForm, setTelegramForm] = useState({
    bot_token: "",
    chat_id: "",
    topic_id: "",
    enabled: false,
  });
  const [showTelegramToken, setShowTelegramToken] = useState(false);

  // Profile
  const [displayName, setDisplayName] = useState(user?.display_name || "");
  const [username, setUsername] = useState(user?.username || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);

  // Users management (admin)
  const [allUsers, setAllUsers] = useState([]);
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userForm, setUserForm] = useState({
    username: "",
    password: "",
    display_name: "",
    is_admin: false,
  });
  const [showUserPass, setShowUserPass] = useState(false);
  const [showPwChange, setShowPwChange] = useState(null);
  const [resetPassword, setResetPassword] = useState("");
  const confirmDlg = useConfirm();

  const fetchData = async () => {
    try {
      const [
        notifs,
        params,
        docker,
        keys,
        users,
        rpsxps,
        fwStatus,
        nfsT,
        appS,
      ] = await Promise.all([
        api.getNotificationConfigs().catch(() => []),
        api.getKernelParams().catch(() => []),
        api.getDockerInfo().catch(() => null),
        api.getApiKeys().catch(() => []),
        user?.is_admin ? api.getUsers().catch(() => []) : Promise.resolve([]),
        api.getRpsXps().catch(() => null),
        api.getFirewallStatus().catch(() => null),
        api.getNfsThreads().catch(() => null),
        api.getAppSettings().catch(() => null),
      ]);
      setConfigs(notifs);
      setKernelParams(params);
      setDockerInfo(docker);
      setApiKeys(keys);
      setAllUsers(users);
      setRpsXps(rpsxps);
      setFirewallStatus(fwStatus);
      setNfsThreads(nfsT);
      setAppSettings(appS);

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
      toast.error(e.message);
    }
  };

  useEffect(() => {
    fetchData();
    fetchSSHKeys();
  }, []);

  // SSH Key handlers
  const fetchSSHKeys = async () => {
    try {
      const data = await api.getSSHKeys();
      setSSHKeys(data);
    } catch {
      // silently fail
    }
  };

  const handleUploadKey = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await api.uploadSSHKey(file);
      toast.success(`SSH key "${file.name}" uploaded`);
      await fetchSSHKeys();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDownloadKey = async (name) => {
    try {
      const url = api.downloadSSHKey(name);
      const headers = {};
      const token = localStorage.getItem("token");
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const apiKey = localStorage.getItem("apiKey");
      if (apiKey) headers["X-API-Key"] = apiKey;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDeleteKey = async (name) => {
    const ok = await confirmDlg({
      title: "Delete SSH Key",
      message: `Delete key "${name}"? This cannot be undone.`,
      confirmText: "Delete",
      type: "danger",
    });
    if (!ok) return;
    try {
      await api.deleteSSHKey(name);
      toast.success(`Key "${name}" deleted`);
      await fetchSSHKeys();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const saveApiKey = async () => {
    if (!newKeyName.trim()) {
      toast.warning("Please enter a name for the API key");
      return;
    }
    try {
      const result = await api.createApiKey(newKeyName.trim());
      setCreatedKey(result.key);
      setNewKeyName("");
      setShowNewKeyForm(false);
      fetchData();
      toast.success("API key created");
    } catch (e) {
      toast.error(e.message);
    }
  };

  const toggleApiKey = async (id) => {
    try {
      await api.toggleApiKey(id);
      fetchData();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const deleteApiKey = async (id) => {
    try {
      await api.deleteApiKey(id);
      fetchData();
      toast.success("API key deleted");
    } catch (e) {
      toast.error(e.message);
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      // Fallback for non-HTTPS contexts
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        toast.success("Copied to clipboard");
      } catch {
        toast.error("Failed to copy to clipboard");
      }
      document.body.removeChild(ta);
    }
  };

  const saveProfile = async () => {
    try {
      const data = { display_name: displayName };
      if (username !== user?.username) {
        data.username = username;
      }
      const updated = await api.updateMe(data);
      updateUser(updated);
      toast.success("Profile updated");
    } catch (e) {
      toast.error(e.message);
    }
  };

  const changePassword = async () => {
    if (!currentPassword || !newPassword) {
      toast.warning("Both password fields are required");
      return;
    }
    try {
      await api.changePassword(currentPassword, newPassword);
      toast.success("Password changed");
      setCurrentPassword("");
      setNewPassword("");
    } catch (e) {
      toast.error(e.message);
    }
  };

  // User management handlers (admin)
  const openCreateUser = () => {
    setUserForm({
      username: "",
      password: "",
      display_name: "",
      is_admin: false,
    });
    setEditingUser(null);
    setShowUserForm(true);
  };

  const openEditUser = (u) => {
    setUserForm({
      username: u.username,
      password: "",
      display_name: u.display_name,
      is_admin: u.is_admin,
    });
    setEditingUser(u);
    setShowUserForm(true);
  };

  const handleUserSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingUser) {
        const update = {
          username: userForm.username,
          display_name: userForm.display_name,
          is_admin: userForm.is_admin,
        };
        if (userForm.password) update.password = userForm.password;
        await api.updateUser(editingUser.id, update);
        toast.success("User updated");
      } else {
        await api.createUser(userForm);
        toast.success("User created");
      }
      setShowUserForm(false);
      setEditingUser(null);
      fetchData();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleDeleteUser = async (userId) => {
    const u = allUsers.find((x) => x.id === userId);
    const ok = await confirmDlg({
      title: "Delete User?",
      message: `This will permanently delete "${u?.display_name || u?.username}". This action cannot be undone.`,
      variant: "danger",
      confirmText: "Delete",
    });
    if (!ok) return;
    try {
      await api.deleteUser(userId);
      toast.success(`User "${u?.display_name || u?.username}" deleted`);
      fetchData();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleResetPassword = async (userId) => {
    if (!resetPassword) return;
    try {
      await api.updateUser(userId, { password: resetPassword });
      toast.success("Password reset");
      setShowPwChange(null);
      setResetPassword("");
    } catch (e) {
      toast.error(e.message);
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
      toast.success("Discord configuration saved");
      fetchData();
    } catch (e) {
      toast.error(e.message);
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
      toast.success("Telegram configuration saved");
      fetchData();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const testDiscord = async () => {
    try {
      await api.testNotification("discord", "Test from NFS-MergerFS Manager");
      toast.success("Discord test sent");
    } catch (e) {
      toast.error(e.message);
    }
  };

  const testTelegram = async () => {
    try {
      await api.testNotification("telegram", "Test from NFS-MergerFS Manager");
      toast.success("Telegram test sent");
    } catch (e) {
      toast.error(e.message);
    }
  };

  const updateKernelParam = (index, value) => {
    setKernelParams((prev) =>
      prev.map((p, i) => (i === index ? { ...p, value } : p)),
    );
  };

  const applyKernelTuning = async () => {
    try {
      const results = await api.applyKernelTuning(
        kernelParams.map((p) => ({ name: p.name, value: p.value })),
      );
      const failed = results.filter((r) => !r.success);
      if (failed.length === 0) {
        toast.success("All kernel parameters applied");
      } else {
        toast.warning(
          `${results.length - failed.length} applied, ${failed.length} failed`,
        );
      }
      // Reload current values
      const fresh = await api.getKernelParams().catch(() => []);
      setKernelParams(fresh);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const refreshKernelParams = async () => {
    try {
      const params = await api.getKernelParams();
      setKernelParams(params);
      toast.success("Kernel parameters refreshed");
    } catch (e) {
      toast.error(e.message);
    }
  };

  const updateRpsXpsField = (field, value) => {
    setRpsXps((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const applyRpsXps = async () => {
    if (!rpsXps) return;
    try {
      const result = await api.applyRpsXps({
        rps_cpus: rpsXps.rps_cpus,
        xps_cpus: rpsXps.xps_cpus,
        mtu: rpsXps.mtu,
      });
      if (result.success) {
        toast.success("RPS/XPS settings applied");
      } else {
        toast.error(result.error || "Failed to apply RPS/XPS");
      }
      const fresh = await api.getRpsXps().catch(() => null);
      setRpsXps(fresh);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const refreshRpsXps = async () => {
    try {
      const data = await api.getRpsXps();
      setRpsXps(data);
      toast.success("RPS/XPS info refreshed");
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 rounded-lg bg-nfs-primary/10">
              <Settings className="w-5 h-5 text-nfs-primary" />
            </div>
            Settings
          </h1>
          <p className="text-sm text-nfs-muted mt-1 ml-12">
            Manage your account and system settings
          </p>
        </div>
        <button
          onClick={async () => {
            setRefreshing(true);
            setProgress({
              message: "Refreshing settings...",
              status: "loading",
            });
            try {
              await fetchData();
              setProgress({ message: "Settings refreshed", status: "success" });
            } catch (e) {
              setProgress({
                message: "Refresh failed",
                status: "error",
                detail: e.message,
              });
            }
            setRefreshing(false);
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

      {/* Tabs */}
      <div className="bg-nfs-card border border-nfs-border rounded-xl p-2 mb-6 flex items-center gap-2 overflow-x-auto">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full transition-all whitespace-nowrap ${
              activeTab === id
                ? "bg-nfs-primary text-black"
                : "text-nfs-muted hover:text-white hover:bg-nfs-input/50"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* User Management Tab */}
      {activeTab === "profile" && (
        <>
          <Section
            icon={User}
            title="My Profile"
            iconColor=" bg-nfs-primary/10 text-nfs-primary"
          >
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-nfs-muted mb-1.5">
                  Username
                </label>
                <input
                  className={inputClass}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username"
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
                className="px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-all"
              >
                <Save className="w-4 h-4 text-nfs-primary" />
                Save Profile
              </button>
            </div>
          </Section>

          <Section
            icon={Lock}
            title="Change Password"
            iconColor=" bg-nfs-primary/10 text-nfs-primary"
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
                className="px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-all"
              >
                <Lock className="w-4 h-4 text-nfs-primary" />
                Change Password
              </button>
            </div>
          </Section>

          {/* Users section (admin only) */}
          {user?.is_admin && (
            <div className="bg-nfs-card border border-nfs-border rounded-xl p-5 mb-6 hover:border-nfs-muted transition-all">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-nfs-primary/10 text-nfs-primary">
                    <Users className="w-4 h-4" />
                  </div>
                  <h2 className="text-lg font-semibold text-white">Users</h2>
                </div>
                <button
                  onClick={openCreateUser}
                  className="px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-all"
                >
                  <Plus className="w-4 h-4 text-nfs-primary" />
                  New User
                </button>
              </div>

              <div className="space-y-2">
                {allUsers.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between px-4 py-3 bg-nfs-input border border-nfs-border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-nfs-primary/20 flex items-center justify-center">
                        <span className="text-sm font-bold text-nfs-primary uppercase">
                          {u.display_name?.[0] || u.username[0]}
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-white">
                            {u.display_name || u.username}
                          </p>
                          {u.is_admin && (
                            <span className="px-2 py-0.5 text-[10px] font-semibold bg-nfs-primary/20 text-nfs-primary rounded-full">
                              Admin
                            </span>
                          )}
                          {!u.is_active && (
                            <span className="px-2 py-0.5 text-[10px] font-semibold bg-red-500/20 text-red-400 rounded-full">
                              Disabled
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-nfs-muted">@{u.username}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {showPwChange === u.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="password"
                            value={resetPassword}
                            onChange={(e) => setResetPassword(e.target.value)}
                            placeholder="New password"
                            className="px-3 py-1.5 bg-nfs-bg border border-nfs-border rounded-lg text-white text-xs w-36 focus:outline-none focus:ring-1 focus:ring-nfs-primary"
                          />
                          <button
                            onClick={() => handleResetPassword(u.id)}
                            className="p-1.5 rounded-lg bg-nfs-primary/10 text-nfs-primary hover:bg-nfs-primary/20"
                            title="Save"
                          >
                            <Save className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setShowPwChange(null);
                              setResetPassword("");
                            }}
                            className="p-1.5 rounded-lg text-nfs-muted hover:text-white hover:bg-nfs-input"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowPwChange(u.id)}
                          className="p-2 rounded-lg text-nfs-muted hover:text-nfs-primary hover:bg-nfs-primary/10 transition-colors"
                          title="Reset password"
                        >
                          <Key className="w-4 h-4" />
                        </button>
                      )}

                      <button
                        onClick={() => openEditUser(u)}
                        className="p-2 rounded-lg text-nfs-muted hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                        title="Edit"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      {u.id !== user.id && (
                        <button
                          onClick={() => handleDeleteUser(u.id)}
                          className="p-2 rounded-lg text-nfs-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* User Create/Edit Modal */}
          {showUserForm && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-nfs-card border border-nfs-border rounded-2xl w-full max-w-lg shadow-2xl">
                <div className="flex items-center justify-between p-6 pb-4">
                  <h3 className="text-lg font-semibold text-white">
                    {editingUser ? "Edit User" : "New User"}
                  </h3>
                  <button
                    onClick={() => {
                      setShowUserForm(false);
                      setEditingUser(null);
                    }}
                    className="p-1.5 rounded-lg text-nfs-muted hover:text-white hover:bg-nfs-input transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <form
                  onSubmit={handleUserSubmit}
                  className="px-6 pb-6 space-y-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-nfs-muted mb-1.5">
                      Username
                    </label>
                    <input
                      className={inputClass}
                      value={userForm.username}
                      onChange={(e) =>
                        setUserForm({ ...userForm, username: e.target.value })
                      }
                      placeholder="username"
                      required={!editingUser}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-nfs-muted mb-1.5">
                      Display Name
                    </label>
                    <input
                      className={inputClass}
                      value={userForm.display_name}
                      onChange={(e) =>
                        setUserForm({
                          ...userForm,
                          display_name: e.target.value,
                        })
                      }
                      placeholder="John Doe"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-nfs-muted mb-1.5">
                      Password {editingUser && "(empty = no change)"}
                    </label>
                    <div className="relative">
                      <input
                        className={inputClass}
                        type={showUserPass ? "text" : "password"}
                        value={userForm.password}
                        onChange={(e) =>
                          setUserForm({ ...userForm, password: e.target.value })
                        }
                        placeholder="••••••••"
                        required={!editingUser}
                      />
                      <button
                        type="button"
                        onClick={() => setShowUserPass(!showUserPass)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-nfs-muted hover:text-white"
                      >
                        {showUserPass ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  <label className="flex items-center gap-3 text-sm text-nfs-text cursor-pointer">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={userForm.is_admin}
                      onClick={() =>
                        setUserForm({
                          ...userForm,
                          is_admin: !userForm.is_admin,
                        })
                      }
                      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                        userForm.is_admin ? "bg-nfs-primary" : "bg-nfs-border"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                          userForm.is_admin ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                    Administrator
                  </label>
                  <button
                    type="submit"
                    className="w-full py-2.5 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white font-semibold rounded-lg text-sm transition-all flex items-center justify-center gap-2"
                  >
                    {editingUser ? (
                      <Save className="w-4 h-4 text-nfs-primary" />
                    ) : (
                      <Plus className="w-4 h-4 text-nfs-primary" />
                    )}
                    {editingUser ? "Save" : "Create"}
                  </button>
                </form>
              </div>
            </div>
          )}
        </>
      )}

      {/* Security Tab */}
      {activeTab === "security" && (
        <div className="bg-nfs-card border border-nfs-border rounded-xl p-5 mb-6 hover:border-nfs-muted transition-all">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-nfs-primary/10 text-nfs-primary">
                <Key className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">API Keys</h2>
                <p className="text-xs text-nfs-muted">
                  Use API keys to access the API from external tools without JWT
                  login
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setShowNewKeyForm(true);
                setCreatedKey(null);
              }}
              className="px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-all"
            >
              <Plus className="w-4 h-4 text-nfs-primary" />
              New Key
            </button>
          </div>

          {/* Created key banner – shown once after creation */}
          {createdKey && (
            <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
              <p className="text-xs text-emerald-400 mb-2 font-medium">
                API key created! Copy it now — it won't be shown again.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-nfs-input border border-nfs-border rounded text-sm text-white font-mono select-all">
                  {createdKey}
                </code>
                <button
                  onClick={() => copyToClipboard(createdKey)}
                  className="px-3 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm flex items-center gap-2 transition-all shrink-0"
                >
                  <Copy className="w-4 h-4 text-nfs-primary" />
                  Copy
                </button>
              </div>
            </div>
          )}

          {/* New key form */}
          {showNewKeyForm && (
            <div className="mb-4 p-3 bg-nfs-input border border-nfs-border rounded-lg">
              <label className="block text-sm font-medium text-nfs-muted mb-1.5">
                Key Name
              </label>
              <div className="flex gap-2">
                <input
                  className={inputClass}
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g. Kometa Dashboard"
                  onKeyDown={(e) => e.key === "Enter" && saveApiKey()}
                  autoFocus
                />
                <button
                  onClick={saveApiKey}
                  className="px-4 py-2.5 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white font-medium rounded-lg text-sm flex items-center gap-2 transition-all shrink-0"
                >
                  <Plus className="w-4 h-4 text-nfs-primary" />
                  Create
                </button>
              </div>
            </div>
          )}

          {/* Key list */}
          <div className="space-y-2">
            {apiKeys.length === 0 && !showNewKeyForm ? (
              <div className="text-center py-8 text-nfs-muted text-sm">
                No API keys created yet
              </div>
            ) : (
              apiKeys.map((k) => (
                <div
                  key={k.id}
                  className="flex items-center gap-3 px-4 py-3 bg-nfs-input border border-nfs-border rounded-lg"
                >
                  <Circle
                    className={`w-3 h-3 shrink-0 ${k.is_active ? "text-emerald-400 fill-emerald-400" : "text-nfs-muted fill-nfs-muted"}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">
                      {k.name}
                    </p>
                    <p className="text-xs text-nfs-muted font-mono">
                      {k.key_prefix}...{k.key_suffix}
                    </p>
                  </div>
                  <button
                    onClick={() => toggleApiKey(k.id)}
                    className={`text-xs px-2 py-1 rounded font-medium ${
                      k.is_active
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                        : "bg-red-500/10 text-red-400 border border-red-500/30"
                    }`}
                  >
                    {k.is_active ? "Active" : "Inactive"}
                  </button>
                  <button
                    onClick={() => deleteApiKey(k.id)}
                    className="p-1.5 text-nfs-muted hover:text-red-400 transition-colors"
                    title="Delete key"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Notifications Tab */}
      {activeTab === "notifications" && (
        <>
          <Section
            icon={MessageSquare}
            title="Discord Notifications"
            iconColor=" bg-nfs-primary/10 text-nfs-primary"
          >
            <div className="space-y-3">
              <label className="flex items-center gap-3 text-sm text-nfs-text cursor-pointer">
                <button
                  type="button"
                  role="switch"
                  aria-checked={discordForm.enabled}
                  onClick={() =>
                    setDiscordForm({
                      ...discordForm,
                      enabled: !discordForm.enabled,
                    })
                  }
                  className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                    discordForm.enabled ? "bg-nfs-primary" : "bg-nfs-border"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                      discordForm.enabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
                Enabled
              </label>
              <div>
                <label className="block text-sm font-medium text-nfs-muted mb-1.5">
                  Webhook URL
                </label>
                <div className="relative">
                  <input
                    className={inputClass + " pr-10"}
                    type={showDiscordWebhook ? "text" : "password"}
                    value={discordForm.webhook_url}
                    onChange={(e) =>
                      setDiscordForm({
                        ...discordForm,
                        webhook_url: e.target.value,
                      })
                    }
                    placeholder="https://discord.com/api/webhooks/1234567890/aBcDeFgHiJkLmNoPqRsT"
                  />
                  <button
                    type="button"
                    onClick={() => setShowDiscordWebhook(!showDiscordWebhook)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-nfs-muted hover:text-white transition-colors"
                  >
                    {showDiscordWebhook ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={saveDiscord}
                  className="px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-all"
                >
                  <Save className="w-4 h-4 text-nfs-primary" />
                  Save
                </button>
                <button
                  onClick={testDiscord}
                  className="px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-all"
                >
                  <Send className="w-4 h-4 text-nfs-primary" />
                  Test
                </button>
              </div>
            </div>
          </Section>

          <Section
            icon={Send}
            title="Telegram Notifications"
            iconColor=" bg-nfs-primary/10 text-nfs-primary"
          >
            <div className="space-y-3">
              <label className="flex items-center gap-3 text-sm text-nfs-text cursor-pointer">
                <button
                  type="button"
                  role="switch"
                  aria-checked={telegramForm.enabled}
                  onClick={() =>
                    setTelegramForm({
                      ...telegramForm,
                      enabled: !telegramForm.enabled,
                    })
                  }
                  className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                    telegramForm.enabled ? "bg-nfs-primary" : "bg-nfs-border"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                      telegramForm.enabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
                Enabled
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-nfs-muted mb-1.5">
                    Bot Token
                  </label>
                  <div className="relative">
                    <input
                      className={inputClass + " pr-10"}
                      type={showTelegramToken ? "text" : "password"}
                      value={telegramForm.bot_token}
                      onChange={(e) =>
                        setTelegramForm({
                          ...telegramForm,
                          bot_token: e.target.value,
                        })
                      }
                      placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                    />
                    <button
                      type="button"
                      onClick={() => setShowTelegramToken(!showTelegramToken)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-nfs-muted hover:text-white transition-colors"
                    >
                      {showTelegramToken ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-nfs-muted mb-1.5">
                    Chat ID
                  </label>
                  <input
                    className={inputClass}
                    value={telegramForm.chat_id}
                    onChange={(e) =>
                      setTelegramForm({
                        ...telegramForm,
                        chat_id: e.target.value,
                      })
                    }
                    placeholder="-1001234567890"
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
                    setTelegramForm({
                      ...telegramForm,
                      topic_id: e.target.value,
                    })
                  }
                  placeholder="12345 (optional, for forum topics)"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={saveTelegram}
                  className="px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-all"
                >
                  <Save className="w-4 h-4 text-nfs-primary" />
                  Save
                </button>
                <button
                  onClick={testTelegram}
                  className="px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-all"
                >
                  <Send className="w-4 h-4 text-nfs-primary" />
                  Test
                </button>
              </div>
            </div>
          </Section>
        </>
      )}

      {/* System Tab */}
      {activeTab === "system" && (
        <>
          {/* Application Settings */}
          <div className="bg-nfs-card border border-nfs-border rounded-xl p-5 mb-6 hover:border-nfs-muted transition-all">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
                  <Settings className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Application Settings
                  </h2>
                  <p className="text-xs text-nfs-muted">
                    Log level and timezone (persisted to DB, overrides
                    docker-compose env)
                  </p>
                </div>
              </div>
              <button
                onClick={async () => {
                  if (!appSettings) return;
                  try {
                    const res = await api.updateAppSettings({
                      log_level: appSettings.log_level,
                      timezone: appSettings.timezone,
                    });
                    if (res.success) {
                      toast.success("Application settings saved");
                      const fresh = await api
                        .getAppSettings()
                        .catch(() => null);
                      if (fresh) setAppSettings(fresh);
                    } else {
                      toast.error(res.error || "Failed to save settings");
                    }
                  } catch (e) {
                    toast.error(e.message);
                  }
                }}
                className="px-3 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-all"
              >
                <Save className="w-4 h-4 text-nfs-primary" />
                Save
              </button>
            </div>

            {appSettings ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 bg-nfs-input/50 rounded-lg px-4 py-2">
                  <span className="text-xs text-nfs-text flex-1 min-w-0">
                    Log Level
                  </span>
                  <CustomSelect
                    value={appSettings.log_level}
                    onChange={(val) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        log_level: val,
                      }))
                    }
                    options={(appSettings.valid_log_levels || []).map(
                      (lvl) => ({
                        value: lvl,
                        label: lvl,
                      }),
                    )}
                    className="w-52"
                  />
                </div>
                <div className="flex items-center gap-3 bg-nfs-input/50 rounded-lg px-4 py-2">
                  <span className="text-xs text-nfs-text flex-1 min-w-0">
                    Timezone
                  </span>
                  <CustomSelect
                    value={appSettings.timezone}
                    onChange={(val) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        timezone: val,
                      }))
                    }
                    options={(appSettings.valid_timezones || []).map((tz) => ({
                      value: tz,
                      label: tz,
                    }))}
                    className="w-52"
                  />
                </div>
              </div>
            ) : (
              <p className="text-sm text-nfs-muted">Loading...</p>
            )}
          </div>

          <div className="bg-nfs-card border border-nfs-border rounded-xl p-5 mb-6 hover:border-nfs-muted transition-all">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                  <Cpu className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Kernel Tuning
                  </h2>
                  <p className="text-xs text-nfs-muted">
                    NFS streaming optimization (300+ streams)
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={refreshKernelParams}
                  className="px-3 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-all"
                  title="Reload current values"
                >
                  <RefreshCw className="w-4 h-4 text-nfs-primary" />
                  Refresh
                </button>
                <button
                  onClick={applyKernelTuning}
                  className="px-3 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-all"
                >
                  <Zap className="w-4 h-4 text-nfs-primary" />
                  Apply
                </button>
              </div>
            </div>

            {kernelParams.length > 0 ? (
              <div className="space-y-1">
                {kernelParams.map((p, i) => (
                  <div
                    key={p.name}
                    className="flex items-center gap-3 bg-nfs-input/50 rounded-lg px-4 py-2"
                  >
                    <code className="text-xs text-nfs-text font-mono flex-1 min-w-0">
                      {p.name}
                    </code>
                    <input
                      className="px-3 py-1.5 bg-nfs-input border border-nfs-border rounded-lg text-xs text-nfs-primary font-mono font-semibold text-right w-52 focus:outline-none focus:ring-1 focus:ring-nfs-primary"
                      value={p.value}
                      onChange={(e) => updateKernelParam(i, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-nfs-muted">No parameters available</p>
            )}
          </div>

          {/* NFS Server Threads */}
          <div className="bg-nfs-card border border-nfs-border rounded-xl p-5 mb-6 hover:border-nfs-muted transition-all">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    NFS Server Threads
                  </h2>
                  <p className="text-xs text-nfs-muted">
                    Worker threads for NFS export serving (default: 512)
                  </p>
                </div>
              </div>
              <button
                onClick={async () => {
                  try {
                    const val = nfsThreads?.current || 512;
                    const result = await api.setNfsThreads(val);
                    if (result.success) {
                      toast.success(`NFS threads set to ${val}`);
                      const fresh = await api.getNfsThreads().catch(() => null);
                      setNfsThreads(fresh);
                    } else {
                      toast.error(result.error || "Failed to set NFS threads");
                    }
                  } catch (e) {
                    toast.error(e.message);
                  }
                }}
                className="px-3 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-all"
              >
                <Zap className="w-4 h-4 text-nfs-primary" />
                Apply
              </button>
            </div>
            <div className="flex items-center gap-3 bg-nfs-input/50 rounded-lg px-4 py-2">
              <span className="text-xs text-nfs-text flex-1 min-w-0">
                Active NFS Threads
              </span>
              <input
                type="number"
                min="1"
                max="4096"
                className="px-3 py-1.5 bg-nfs-input border border-nfs-border rounded-lg text-xs text-nfs-primary font-mono font-semibold text-right w-52 focus:outline-none focus:ring-1 focus:ring-nfs-primary"
                value={nfsThreads?.current ?? ""}
                onChange={(e) =>
                  setNfsThreads((prev) => ({
                    ...prev,
                    current: parseInt(e.target.value) || 0,
                  }))
                }
              />
            </div>
            <p className="text-[10px] text-nfs-muted mt-2 px-1">
              More threads = more parallel NFS client requests. For 80+ streams
              use 512+. Default via NFS_THREADS env var.
            </p>
          </div>

          {/* RPS/XPS CPU Load Balancing */}
          <div className="bg-nfs-card border border-nfs-border rounded-xl p-5 mb-6 hover:border-nfs-muted transition-all">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-nfs-primary/10 text-nfs-primary">
                  <Network className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    CPU Load Balancing (RPS/XPS)
                  </h2>
                  <p className="text-xs text-nfs-muted">
                    Distribute network IRQs across CPUs
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={refreshRpsXps}
                  className="px-3 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-all"
                  title="Reload current values"
                >
                  <RefreshCw className="w-4 h-4 text-nfs-primary" />
                  Refresh
                </button>
                <button
                  onClick={applyRpsXps}
                  className="px-3 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-all"
                >
                  <Zap className="w-4 h-4 text-nfs-primary" />
                  Apply
                </button>
              </div>
            </div>

            {rpsXps ? (
              <div className="space-y-1">
                {[
                  {
                    label: "Network Interface",
                    key: "interface",
                    editable: false,
                  },
                  { label: "CPU Count", key: "cpu_count", editable: false },
                  { label: "RPS CPU Mask", key: "rps_cpus", editable: true },
                  {
                    label: "XPS CPU Mask",
                    key: "xps_cpus",
                    editable: rpsXps.xps_cpus && rpsXps.xps_cpus !== "N/A",
                  },
                  { label: "MTU", key: "mtu", editable: true },
                ].map(({ label, key, editable }) => (
                  <div
                    key={key}
                    className="flex items-center gap-3 bg-nfs-input/50 rounded-lg px-4 py-2"
                  >
                    <span className="text-xs text-nfs-text flex-1 min-w-0">
                      {label}
                    </span>
                    {editable ? (
                      <input
                        className="px-3 py-1.5 bg-nfs-input border border-nfs-border rounded-lg text-xs text-nfs-primary font-mono font-semibold text-right w-52 focus:outline-none focus:ring-1 focus:ring-nfs-primary"
                        value={rpsXps[key] || ""}
                        onChange={(e) => updateRpsXpsField(key, e.target.value)}
                      />
                    ) : (
                      <code className="text-xs text-nfs-primary font-mono font-semibold">
                        {rpsXps[key] === "N/A"
                          ? "Not Supported"
                          : (rpsXps[key] ?? "N/A")}
                      </code>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-nfs-muted">
                No network interface detected
              </p>
            )}
          </div>

          {/* Docker Info */}
          <Section
            icon={Box}
            title="Docker Environment"
            iconColor=" bg-nfs-primary/10 text-nfs-primary"
          >
            <p className="text-xs text-nfs-muted mb-3 leading-relaxed">
              Container and runtime information.
            </p>
            {dockerInfo ? (
              <div className="space-y-1">
                {[
                  ["Docker Version", dockerInfo.docker_version],
                  ["Container ID", dockerInfo.container_id],
                  ["Image", dockerInfo.image],
                  ["OS", dockerInfo.os],
                  ["Architecture", dockerInfo.arch],
                  [
                    "Running in Docker",
                    dockerInfo.running_in_docker ? "Yes" : "No",
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between bg-nfs-input/50 rounded-lg px-4 py-2.5"
                  >
                    <span className="text-xs text-nfs-text">{label}</span>
                    <code className="text-xs text-nfs-primary font-mono font-semibold">
                      {value || "N/A"}
                    </code>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-nfs-muted">Loading Docker info...</p>
            )}
          </Section>
        </>
      )}

      {/* Firewall Tab */}
      {activeTab === "firewall" && (
        <>
          {/* Info Box */}
          <InfoBox variant="info" className="mb-6">
            NFS Firewall protection restricts access to NFS ports (111, 2049,
            mountd, nlockmgr, statd) using iptables. Only explicitly allowed
            hosts from your exports/mounts can reach these services. Rules are
            auto-applied on startup and when exports/mounts change.
          </InfoBox>

          {/* Export (Server) Protection */}
          <div className="bg-nfs-card border border-nfs-border rounded-xl p-5 mb-6 hover:border-nfs-muted transition-all">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2 rounded-lg ${firewallStatus?.export_protection?.active ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}
                >
                  {firewallStatus?.export_protection?.active ? (
                    <ShieldCheck className="w-5 h-5" />
                  ) : (
                    <ShieldAlert className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    NFS Export Protection (Server)
                  </h2>
                  <p className="text-xs text-nfs-muted">
                    Blocks unauthorized access to NFS server ports
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                    firewallStatus?.export_protection?.active
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                      : "bg-red-500/15 text-red-400 border-red-500/30"
                  }`}
                >
                  {firewallStatus?.export_protection?.active
                    ? "Active"
                    : "Inactive"}
                </span>
                <button
                  disabled={firewallLoading}
                  onClick={async () => {
                    setFirewallLoading(true);
                    try {
                      if (firewallStatus?.export_protection?.active) {
                        await api.removeExportFirewall();
                        toast.success("Export firewall removed");
                      } else {
                        await api.applyExportFirewall();
                        toast.success("Export firewall applied");
                      }
                      const s = await api.getFirewallStatus();
                      setFirewallStatus(s);
                    } catch (e) {
                      toast.error(e.message);
                    } finally {
                      setFirewallLoading(false);
                    }
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all border ${
                    firewallStatus?.export_protection?.active
                      ? "bg-red-500/10 border-red-500/30 hover:border-red-400 text-red-400"
                      : "bg-emerald-500/10 border-emerald-500/30 hover:border-emerald-400 text-emerald-400"
                  } disabled:opacity-50`}
                >
                  {firewallStatus?.export_protection?.active ? (
                    <>
                      <ShieldOff className="w-4 h-4" /> Disable
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" /> Enable
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Rules summary */}
            {firewallStatus?.export_protection?.active && (
              <div className="mt-3 space-y-1">
                <p className="text-xs text-nfs-muted mb-2">
                  {firewallStatus.export_protection.rules_count} active iptables
                  rules in chain{" "}
                  <code className="text-nfs-primary">
                    {firewallStatus.export_protection.chain}
                  </code>
                </p>
                <div className="max-h-40 overflow-y-auto bg-nfs-input/50 rounded-lg p-3">
                  {firewallStatus.export_protection.rules.map((rule, i) => (
                    <div
                      key={i}
                      className="text-xs font-mono text-nfs-text py-0.5"
                    >
                      {rule}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Client Protection */}
          <div className="bg-nfs-card border border-nfs-border rounded-xl p-5 mb-6 hover:border-nfs-muted transition-all">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2 rounded-lg ${firewallStatus?.client_protection?.active ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}
                >
                  {firewallStatus?.client_protection?.active ? (
                    <ShieldCheck className="w-5 h-5" />
                  ) : (
                    <ShieldAlert className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    NFS Client Protection
                  </h2>
                  <p className="text-xs text-nfs-muted">
                    Restricts outbound NFS traffic to known servers only
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                    firewallStatus?.client_protection?.active
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                      : "bg-red-500/15 text-red-400 border-red-500/30"
                  }`}
                >
                  {firewallStatus?.client_protection?.active
                    ? "Active"
                    : "Inactive"}
                </span>
                <button
                  disabled={firewallLoading}
                  onClick={async () => {
                    setFirewallLoading(true);
                    try {
                      if (firewallStatus?.client_protection?.active) {
                        await api.removeClientFirewall();
                        toast.success("Client firewall removed");
                      } else {
                        await api.applyClientFirewall();
                        toast.success("Client firewall applied");
                      }
                      const s = await api.getFirewallStatus();
                      setFirewallStatus(s);
                    } catch (e) {
                      toast.error(e.message);
                    } finally {
                      setFirewallLoading(false);
                    }
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all border ${
                    firewallStatus?.client_protection?.active
                      ? "bg-red-500/10 border-red-500/30 hover:border-red-400 text-red-400"
                      : "bg-emerald-500/10 border-emerald-500/30 hover:border-emerald-400 text-emerald-400"
                  } disabled:opacity-50`}
                >
                  {firewallStatus?.client_protection?.active ? (
                    <>
                      <ShieldOff className="w-4 h-4" /> Disable
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" /> Enable
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Rules summary */}
            {firewallStatus?.client_protection?.active && (
              <div className="mt-3 space-y-1">
                <p className="text-xs text-nfs-muted mb-2">
                  {firewallStatus.client_protection.rules_count} active iptables
                  rules in chain{" "}
                  <code className="text-nfs-primary">
                    {firewallStatus.client_protection.chain}
                  </code>
                </p>
                <div className="max-h-40 overflow-y-auto bg-nfs-input/50 rounded-lg p-3">
                  {firewallStatus.client_protection.rules.map((rule, i) => (
                    <div
                      key={i}
                      className="text-xs font-mono text-nfs-text py-0.5"
                    >
                      {rule}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* VPN-Only Mode */}
          <div
            className={`bg-nfs-card border rounded-xl p-5 mb-6 transition-all ${
              firewallStatus?.vpn_only
                ? "border-purple-500/50 hover:border-purple-400"
                : "border-nfs-border hover:border-nfs-muted"
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2 rounded-lg ${
                    firewallStatus?.vpn_only
                      ? "bg-purple-500/10 text-purple-400"
                      : "bg-nfs-input text-nfs-muted"
                  }`}
                >
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    VPN-Only Mode
                  </h2>
                  <p className="text-xs text-nfs-muted">
                    NFS server ports only accessible via VPN tunnel — encrypts
                    all NFS traffic
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {firewallStatus?.vpn_only && (
                  <span className="px-3 py-1 rounded-full text-xs font-semibold border bg-purple-500/15 text-purple-400 border-purple-500/30">
                    Enforced
                  </span>
                )}
                <button
                  disabled={firewallLoading}
                  onClick={async () => {
                    setFirewallLoading(true);
                    try {
                      const newState = !firewallStatus?.vpn_only;
                      await api.toggleVPNOnly(newState);
                      toast.success(
                        newState
                          ? "VPN-Only mode enabled — NFS only accessible via VPN"
                          : "VPN-Only mode disabled",
                      );
                      const s = await api.getFirewallStatus();
                      setFirewallStatus(s);
                    } catch (e) {
                      toast.error(e.message);
                    } finally {
                      setFirewallLoading(false);
                    }
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all border ${
                    firewallStatus?.vpn_only
                      ? "bg-red-500/10 border-red-500/30 hover:border-red-400 text-red-400"
                      : "bg-purple-500/10 border-purple-500/30 hover:border-purple-400 text-purple-400"
                  } disabled:opacity-50`}
                >
                  {firewallStatus?.vpn_only ? (
                    <>
                      <ShieldOff className="w-4 h-4" /> Disable
                    </>
                  ) : (
                    <>
                      <Shield className="w-4 h-4" /> Enable
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* VPN interfaces info */}
            {firewallStatus?.vpn_interfaces?.length > 0 ? (
              <div className="flex flex-wrap gap-2 mt-2">
                <span className="text-xs text-nfs-muted">
                  Active VPN interfaces:
                </span>
                {firewallStatus.vpn_interfaces.map((iface) => (
                  <span
                    key={iface}
                    className="px-2 py-0.5 rounded bg-purple-500/15 text-purple-400 text-xs font-mono border border-purple-500/30"
                  >
                    {iface}
                  </span>
                ))}
              </div>
            ) : (
              <div className="mt-2">
                <InfoBox variant="warning" className="!mb-0">
                  No active VPN interfaces detected. Connect a VPN tunnel first,
                  then enable VPN-Only mode.
                </InfoBox>
              </div>
            )}
          </div>

          {/* Fixed NFS Ports */}
          <div className="bg-nfs-card border border-nfs-border rounded-xl p-5 mb-6 hover:border-nfs-muted transition-all">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-nfs-primary/10 text-nfs-primary">
                <Network className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Fixed NFS Ports
                </h2>
                <p className="text-xs text-nfs-muted">
                  Auxiliary services pinned to fixed ports for reliable firewall
                  rules
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: "rpcbind", port: "111", proto: "TCP/UDP" },
                { label: "nfsd", port: "2049", proto: "TCP/UDP" },
                {
                  label: "mountd",
                  port: String(firewallStatus?.fixed_ports?.mountd || 32767),
                  proto: "TCP/UDP",
                },
                {
                  label: "nlockmgr",
                  port: String(firewallStatus?.fixed_ports?.nlockmgr || 32768),
                  proto: "TCP/UDP",
                },
                {
                  label: "statd",
                  port: String(firewallStatus?.fixed_ports?.statd || 32769),
                  proto: "TCP/UDP",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="bg-nfs-input/50 rounded-lg p-3"
                >
                  <p className="text-xs text-nfs-muted">{item.label}</p>
                  <p className="text-sm font-mono text-nfs-primary font-semibold">
                    {item.port}
                  </p>
                  <p className="text-xs text-nfs-muted">{item.proto}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="bg-nfs-card border border-nfs-border rounded-xl p-5 hover:border-nfs-muted transition-all">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Quick Actions
                </h2>
                <p className="text-xs text-nfs-muted">
                  Manage all firewall rules at once
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                disabled={firewallLoading}
                onClick={async () => {
                  setFirewallLoading(true);
                  try {
                    await api.applyAllFirewall();
                    toast.success("All firewall rules applied");
                    const s = await api.getFirewallStatus();
                    setFirewallStatus(s);
                  } catch (e) {
                    toast.error(e.message);
                  } finally {
                    setFirewallLoading(false);
                  }
                }}
                className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 hover:border-emerald-400 text-emerald-400 rounded-lg text-sm font-medium flex items-center gap-2 transition-all disabled:opacity-50"
              >
                <ShieldCheck className="w-4 h-4" />
                Enable All Protection
              </button>
              <button
                disabled={firewallLoading}
                onClick={async () => {
                  setFirewallLoading(true);
                  try {
                    await api.removeAllFirewall();
                    toast.success("All firewall rules removed");
                    const s = await api.getFirewallStatus();
                    setFirewallStatus(s);
                  } catch (e) {
                    toast.error(e.message);
                  } finally {
                    setFirewallLoading(false);
                  }
                }}
                className="px-4 py-2 bg-red-500/10 border border-red-500/30 hover:border-red-400 text-red-400 rounded-lg text-sm font-medium flex items-center gap-2 transition-all disabled:opacity-50"
              >
                <ShieldOff className="w-4 h-4" />
                Disable All Protection
              </button>
              <button
                disabled={firewallLoading}
                onClick={async () => {
                  setFirewallLoading(true);
                  try {
                    const s = await api.getFirewallStatus();
                    setFirewallStatus(s);
                    toast.success("Firewall status refreshed");
                  } catch (e) {
                    toast.error(e.message);
                  } finally {
                    setFirewallLoading(false);
                  }
                }}
                className="px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-all disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-4 h-4 text-nfs-primary ${firewallLoading ? "animate-spin" : ""}`}
                />
                Refresh Status
              </button>
            </div>
          </div>
        </>
      )}

      {/* SSH Keys Tab */}
      {activeTab === "sshkeys" && (
        <>
          <Section
            icon={KeyRound}
            title="SSH Keys"
            iconColor="bg-nfs-primary/10 text-nfs-primary"
          >
            <p className="text-sm text-nfs-muted mb-4">
              Manage SSH keys used for server monitoring connections. Keys are
              stored in <code className="text-nfs-primary">/config/ssh/</code>.
            </p>
            <div className="flex items-center gap-2 mb-4">
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleUploadKey}
                className="hidden"
                accept=".pem,.key,.pub,.ppk,*"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium transition-all"
              >
                {uploading ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-nfs-primary" />
                ) : (
                  <Upload className="w-4 h-4 text-nfs-primary" />
                )}
                Upload Key
              </button>
              <button
                onClick={fetchSSHKeys}
                className="flex items-center gap-2 px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium transition-all"
              >
                <RefreshCw className="w-4 h-4 text-nfs-primary" />
                Refresh
              </button>
            </div>
            {sshKeys.length === 0 ? (
              <InfoBox type="warning">
                No SSH keys found. Upload a key to get started.
              </InfoBox>
            ) : (
              <div className="space-y-2">
                {sshKeys.map((k) => (
                  <div
                    key={k.name}
                    className="flex items-center justify-between bg-nfs-input/50 border border-nfs-border rounded-lg px-4 py-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <KeyRound className="w-4 h-4 text-nfs-muted flex-shrink-0" />
                      <span className="text-sm text-white font-mono truncate">
                        {k.name}
                      </span>
                      <span className="text-xs text-nfs-muted flex-shrink-0">
                        {k.size}B · {k.permissions}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleDownloadKey(k.name)}
                        className="p-1.5 rounded-lg text-nfs-muted hover:text-nfs-primary hover:bg-nfs-input transition-colors"
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteKey(k.name)}
                        className="p-1.5 rounded-lg text-nfs-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
          <InfoBox type="warning">
            Supported formats: PEM, OpenSSH, and PuTTY PPK (v2/v3). PPK files
            are automatically converted to OpenSSH format on upload.
          </InfoBox>
        </>
      )}

      {/* How To Tab */}
      {activeTab === "howto" && (
        <>
          <p className="text-nfs-muted mb-6 leading-relaxed">
            Complete guide to the NFS-MergerFS Manager. Manage NFS Mounts,
            MergerFS Unions, VPN Tunnels, and system settings via the Web UI.
          </p>

          <CollapsibleSection
            icon={Globe}
            title="Quick Start"
            iconColor="bg-nfs-primary/10 text-nfs-primary"
            defaultOpen={true}
          >
            <h3 className="font-semibold text-white">Docker Compose</h3>
            <p>
              The easiest way to start the application is via Docker Compose:
            </p>
            <CodeBlock>{`version: "3.8"
services:
  nfs-mount:
    image: nfs-mount:latest
    container_name: nfs-mount
    privileged: true
    cap_add:
      - SYS_ADMIN
      - NET_ADMIN
    devices:
      - /dev/fuse
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=Europe/Berlin
      - JWT_SECRET=your-secret-key
      - DEFAULT_ADMIN_USER=admin
      - DEFAULT_ADMIN_PASS=admin
    volumes:
      - /opt/appdata/nfs-mount/data:/data
      - /mnt:/mnt:rshared
    ports:
      - 8080:8080
    restart: unless-stopped`}</CodeBlock>
            <InfoBox type="warning">
              Make sure to change <Code>JWT_SECRET</Code>,{" "}
              <Code>DEFAULT_ADMIN_USER</Code> and{" "}
              <Code>DEFAULT_ADMIN_PASS</Code> to secure values!
            </InfoBox>
            <h3 className="font-semibold text-white mt-4">First Login</h3>
            <p>
              After starting, access the UI at <Code>http://IP:8080</Code>. Log
              in with the default credentials (default: <Code>admin</Code> /{" "}
              <Code>admin</Code>). Change your password immediately under
              Settings.
            </p>
          </CollapsibleSection>

          <CollapsibleSection
            icon={Lock}
            title="Authentication"
            iconColor="bg-red-500/10 text-red-400"
          >
            <p>
              The system uses JWT token-based authentication. After login, you
              receive a token that is automatically sent with every API request.
            </p>
            <h3 className="font-semibold text-white">User Management</h3>
            <ul className="list-disc list-inside space-y-1 text-nfs-muted">
              <li>Admins can create, edit, and delete users</li>
              <li>Users can change their own profile and password</li>
              <li>Disabled users cannot log in</li>
            </ul>
            <h3 className="font-semibold text-white mt-3">API Key (Legacy)</h3>
            <p className="text-nfs-muted">
              In addition to JWT auth, an API key can be set via the environment
              variable <Code>API_KEY</Code>. It is sent in the header{" "}
              <Code>X-API-Key</Code> and is primarily intended for external API
              access.
            </p>
            <h3 className="font-semibold text-white mt-3">
              Environment Variables
            </h3>
            <CodeBlock>{`JWT_SECRET=my-secret-key              # JWT Token Secret
JWT_EXPIRE_HOURS=24                    # Token validity in hours
DEFAULT_ADMIN_USER=admin               # Default admin username
DEFAULT_ADMIN_PASS=admin               # Default admin password
API_KEY=optional-api-key               # Optional API key`}</CodeBlock>
          </CollapsibleSection>

          <CollapsibleSection
            icon={HardDrive}
            title="NFS Mounts"
            iconColor="bg-nfs-primary/10 text-nfs-primary"
          >
            <p>
              Manage NFS Network File System mounts. Optimized for
              high-throughput streaming with 300+ simultaneous streams.
            </p>
            <h3 className="font-semibold text-white">Create a Mount</h3>
            <ol className="list-decimal list-inside space-y-1 text-nfs-muted">
              <li>Navigate to "NFS" in the sidebar</li>
              <li>Click "+ New Mount"</li>
              <li>
                Fill in the fields: Name, Server IP, Remote Path, Local Path
              </li>
              <li>Optional: Adjust NFS Version, Mount Options, Check File</li>
              <li>Save and mount using the play button</li>
            </ol>
            <h3 className="font-semibold text-white mt-3">Fields</h3>
            <div className="space-y-2">
              <div className="flex gap-3">
                <Code>Name</Code>
                <span className="text-nfs-muted">
                  Display name of the mount
                </span>
              </div>
              <div className="flex gap-3">
                <Code>Server IP</Code>
                <span className="text-nfs-muted">
                  IP address of the NFS server
                </span>
              </div>
              <div className="flex gap-3">
                <Code>Remote Path</Code>
                <span className="text-nfs-muted">
                  Path on the server (e.g. /export/media)
                </span>
              </div>
              <div className="flex gap-3">
                <Code>Local Path</Code>
                <span className="text-nfs-muted">
                  Local mountpoint (e.g. /mnt/media)
                </span>
              </div>
              <div className="flex gap-3">
                <Code>Check File</Code>
                <span className="text-nfs-muted">
                  Optional: File for validation (e.g. /mnt/media/.mounted)
                </span>
              </div>
            </div>
            <h3 className="font-semibold text-white mt-3">
              Default NFS Options
            </h3>
            <CodeBlock>
              {`rw,nfsvers=4.2,rsize=1048576,wsize=1048576,
hard,proto=tcp,nconnect=16,
timeo=600,retrans=2,noatime,async`}
            </CodeBlock>
            <InfoBox type="info">
              <Code>nconnect=16</Code> creates 16 parallel TCP connections per
              mount for maximum throughput. <Code>rsize</Code>/
              <Code>wsize</Code> of 1MB optimizes large sequential reads.
            </InfoBox>
            <h3 className="font-semibold text-white mt-3">API Endpoints</h3>
            <CodeBlock>{`GET    /api/nfs/mounts          # List all mounts
POST   /api/nfs/mounts          # Create mount
PUT    /api/nfs/mounts/{id}     # Edit mount
DELETE /api/nfs/mounts/{id}     # Delete mount
POST   /api/nfs/mounts/{id}/mount    # Mount single
POST   /api/nfs/mounts/{id}/unmount  # Unmount single
GET    /api/nfs/status           # All statuses
POST   /api/nfs/mount-all        # Mount all
POST   /api/nfs/unmount-all      # Unmount all`}</CodeBlock>
          </CollapsibleSection>

          <CollapsibleSection
            icon={GitMerge}
            title="MergerFS / UnionFS"
            iconColor="bg-purple-500/10 text-purple-400"
          >
            <p>
              MergerFS combines multiple directories into a single virtual
              filesystem. Ideal for combining multiple NFS mounts under one
              path.
            </p>
            <h3 className="font-semibold text-white">Create Configuration</h3>
            <ol className="list-decimal list-inside space-y-1 text-nfs-muted">
              <li>Navigate to "MergerFS" in the sidebar</li>
              <li>Click "+ New Config"</li>
              <li>Enter Name, Mount Point, and Sources (colon-separated)</li>
              <li>Optional: Adjust MergerFS options</li>
            </ol>
            <h3 className="font-semibold text-white mt-3">Example</h3>
            <CodeBlock>{`Name: Media Union
Mount Point: /mnt/unionfs
Sources: /mnt/disk1,/mnt/disk2,/mnt/disk3`}</CodeBlock>
            <h3 className="font-semibold text-white mt-3">
              Default MergerFS Options
            </h3>
            <CodeBlock>
              {`rw,use_ino,allow_other,statfs_ignore=nc,
func.getattr=newest,category.action=all,
category.create=ff,cache.files=partial,
dropcacheonclose=true,kernel_cache,
splice_move,splice_read,direct_io,
fsname=mergerfs`}
            </CodeBlock>
            <h3 className="font-semibold text-white mt-3">API Endpoints</h3>
            <CodeBlock>{`GET    /api/mergerfs/configs          # All configs
POST   /api/mergerfs/configs          # Create config
PUT    /api/mergerfs/configs/{id}     # Edit config
DELETE /api/mergerfs/configs/{id}     # Delete config
POST   /api/mergerfs/configs/{id}/mount    # Mount
POST   /api/mergerfs/configs/{id}/unmount  # Unmount
GET    /api/mergerfs/status           # All statuses`}</CodeBlock>
          </CollapsibleSection>

          <CollapsibleSection
            icon={Shield}
            title="VPN Tunnel (WireGuard & OpenVPN)"
            iconColor="bg-emerald-500/10 text-emerald-400"
          >
            <p>
              Manage VPN tunnels directly from the Web UI. Supports both
              WireGuard and OpenVPN configurations.
            </p>
            <h3 className="font-semibold text-white">WireGuard</h3>
            <p className="text-nfs-muted">
              WireGuard is a modern, fast VPN protocol. Enter your WireGuard
              configuration directly in the UI:
            </p>
            <CodeBlock>{`[Interface]
PrivateKey = YOUR_PRIVATE_KEY
Address = 10.0.0.2/24
DNS = 1.1.1.1

[Peer]
PublicKey = SERVER_PUBLIC_KEY
Endpoint = vpn.example.com:51820
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25`}</CodeBlock>
            <h3 className="font-semibold text-white mt-3">OpenVPN</h3>
            <p className="text-nfs-muted">
              OpenVPN configurations are managed as .conf files. Certificates
              and keys can be embedded inline in the config:
            </p>
            <CodeBlock>{`client
dev tun
proto udp
remote vpn.example.com 1194
resolv-retry infinite
nobind
persist-key
persist-tun

<ca>
-----BEGIN CERTIFICATE-----
...Insert certificate here...
-----END CERTIFICATE-----
</ca>`}</CodeBlock>
            <h3 className="font-semibold text-white mt-3">Features</h3>
            <ul className="list-disc list-inside space-y-1 text-nfs-muted">
              <li>
                <strong>Auto-Connect:</strong> VPN connects automatically on
                container start
              </li>
              <li>
                <strong>Status Monitoring:</strong> Real-time status with peer
                info and transfer data
              </li>
              <li>
                <strong>Config Viewer:</strong> View and copy configuration in
                the UI
              </li>
              <li>
                <strong>Multi-Tunnel:</strong> Manage multiple VPN tunnels
                simultaneously
              </li>
            </ul>
            <h3 className="font-semibold text-white mt-3">
              Legacy WireGuard Config
            </h3>
            <p className="text-nfs-muted">
              Alternatively, a WireGuard config can be mounted directly as a
              file:
            </p>
            <CodeBlock>{`volumes:
  - /path/to/wg0.conf:/config/wg0.conf`}</CodeBlock>
            <InfoBox type="info">
              The file <Code>/config/wg0.conf</Code> is automatically loaded on
              container start, independent of the UI.
            </InfoBox>
            <h3 className="font-semibold text-white mt-3">API Endpoints</h3>
            <CodeBlock>{`GET    /api/vpn/configs              # All VPN configs
POST   /api/vpn/configs              # Create config
PUT    /api/vpn/configs/{id}         # Edit config
DELETE /api/vpn/configs/{id}         # Delete config
POST   /api/vpn/configs/{id}/connect     # Connect
POST   /api/vpn/configs/{id}/disconnect  # Disconnect
GET    /api/vpn/configs/{id}/status  # Single status
GET    /api/vpn/status               # All statuses`}</CodeBlock>
          </CollapsibleSection>

          <CollapsibleSection
            icon={Bell}
            title="Notifications"
            iconColor="bg-amber-500/10 text-amber-400"
          >
            <p>
              Receive notifications about mount actions, errors, and status
              changes via Discord or Telegram.
            </p>
            <h3 className="font-semibold text-white">Discord</h3>
            <ol className="list-decimal list-inside space-y-1 text-nfs-muted">
              <li>Create a webhook in your Discord channel</li>
              <li>Go to Settings → Notifications</li>
              <li>Paste the webhook URL and enable</li>
              <li>Verify with the "Test" button</li>
            </ol>
            <h3 className="font-semibold text-white mt-3">Telegram</h3>
            <ol className="list-decimal list-inside space-y-1 text-nfs-muted">
              <li>Create a bot via @BotFather</li>
              <li>Get the Chat ID (e.g. via @userinfobot)</li>
              <li>Enter Bot Token and Chat ID in the settings</li>
              <li>Optional: Topic ID for forum groups</li>
            </ol>
            <h3 className="font-semibold text-white mt-3">
              Notification Events
            </h3>
            <ul className="list-disc list-inside space-y-1 text-nfs-muted">
              <li>
                <span className="text-emerald-400">SUCCESS:</span> Mount/Unmount
                successful
              </li>
              <li>
                <span className="text-red-400">ERROR:</span> Mount failed
              </li>
              <li>
                <span className="text-blue-400">STARTUP:</span> Auto-mount on
                start
              </li>
              <li>
                <span className="text-amber-400">INFO:</span> General
                information
              </li>
            </ul>
          </CollapsibleSection>

          <CollapsibleSection
            icon={Cpu}
            title="Kernel Tuning"
            iconColor="bg-amber-500/10 text-amber-400"
          >
            <p>
              On container start, kernel parameters are automatically set for
              optimal NFS streaming (300+ simultaneous streams):
            </p>
            <h3 className="font-semibold text-white">NFS/SUNRPC</h3>
            <CodeBlock>
              {`sunrpc.tcp_max_slot_table_entries=128  # RPC Slots (default 65)`}
            </CodeBlock>
            <h3 className="font-semibold text-white mt-3">Network Buffers</h3>
            <CodeBlock>
              {`net.core.rmem_max=134217728       # 128MB max Receive Buffer
net.core.wmem_max=134217728       # 128MB max Send Buffer
net.core.rmem_default=1048576     # 1MB default Receive
net.core.wmem_default=1048576     # 1MB default Send
net.ipv4.tcp_rmem=4096 1048576 134217728
net.ipv4.tcp_wmem=4096 1048576 134217728`}
            </CodeBlock>
            <h3 className="font-semibold text-white mt-3">TCP & BBR</h3>
            <CodeBlock>
              {`net.core.default_qdisc=fq          # Fair Queue (for BBR)
net.ipv4.tcp_congestion_control=bbr # BBR Congestion Control
net.ipv4.tcp_window_scaling=1      # TCP Window Scaling
net.ipv4.tcp_timestamps=1          # TCP Timestamps
net.ipv4.tcp_sack=1                # Selective ACKs`}
            </CodeBlock>
            <h3 className="font-semibold text-white mt-3">CPU & Performance</h3>
            <CodeBlock>
              {`RPS/XPS CPU Load Balancing          # Distribute network IRQs
MTU 1500                            # Standard MTU`}
            </CodeBlock>
            <h3 className="font-semibold text-white mt-3">VM/Page Cache</h3>
            <CodeBlock>
              {`vm.dirty_ratio=40                  # Dirty Page Ratio
vm.dirty_background_ratio=10       # Background Writeback
vm.vfs_cache_pressure=50           # VFS Cache Pressure`}
            </CodeBlock>
            <InfoBox type="info">
              Prerequisite: Container must run with{" "}
              <Code>privileged: true</Code> or <Code>SYS_ADMIN</Code>{" "}
              capability.
            </InfoBox>
          </CollapsibleSection>

          <CollapsibleSection
            icon={Terminal}
            title="System API"
            iconColor="bg-nfs-primary/10 text-nfs-primary"
          >
            <CodeBlock>{`GET  /api/system/health        # Healthcheck (no auth)
GET  /api/system/status        # System Status
GET  /api/system/stats         # CPU, Memory, Disk, Network
GET  /api/system/kernel-params # Kernel Parameters
POST /api/system/kernel-tuning # Apply kernel parameters
GET  /api/system/logs          # Log entries`}</CodeBlock>
            <h3 className="font-semibold text-white mt-3">Auth API</h3>
            <CodeBlock>{`POST /api/auth/login            # Login (JWT Token)
GET  /api/auth/me               # Own profile
PUT  /api/auth/me               # Edit profile
POST /api/auth/change-password  # Change password
GET  /api/auth/users            # All users (Admin)
POST /api/auth/users            # Create user (Admin)
PUT  /api/auth/users/{id}       # Edit user (Admin)
DELETE /api/auth/users/{id}     # Delete user (Admin)`}</CodeBlock>
          </CollapsibleSection>

          <CollapsibleSection
            icon={Layers}
            title="Docker Configuration"
            iconColor="bg-blue-500/10 text-blue-400"
          >
            <h3 className="font-semibold text-white">Environment Variables</h3>
            <div className="space-y-2">
              {[
                ["PUID / PGID", "User/Group ID (default: 1000)"],
                ["TZ", "Timezone (e.g. Europe/Berlin)"],
                ["JWT_SECRET", "Secret key for JWT tokens"],
                ["JWT_EXPIRE_HOURS", "Token validity in hours (default: 24)"],
                ["DEFAULT_ADMIN_USER", "Default admin username"],
                ["DEFAULT_ADMIN_PASS", "Default admin password"],
                ["API_KEY", "Optional API key for external access"],
                ["DATABASE_URL", "SQLite database path"],
                ["DISCORD_WEBHOOK", "Discord webhook URL (fallback)"],
                ["TELEGRAM_TOKEN", "Telegram bot token (fallback)"],
                ["TELEGRAM_CHAT_ID", "Telegram chat ID (fallback)"],
                ["TELEGRAM_TOPIC_ID", "Telegram topic ID (fallback)"],
              ].map(([key, desc]) => (
                <div
                  key={key}
                  className="flex items-start gap-3 bg-nfs-input/50 rounded-lg px-4 py-2.5"
                >
                  <Code>{key}</Code>
                  <span className="text-xs text-nfs-muted">{desc}</span>
                </div>
              ))}
            </div>
            <h3 className="font-semibold text-white mt-4">Volumes</h3>
            <div className="space-y-2">
              {[
                ["/data", "Database and persistent data"],
                [
                  "/mnt:rshared",
                  "Mount directory (rshared for mount propagation)",
                ],
                [
                  "/config/wg0.conf",
                  "Optional: WireGuard config file (legacy)",
                ],
              ].map(([path, desc]) => (
                <div
                  key={path}
                  className="flex items-start gap-3 bg-nfs-input/50 rounded-lg px-4 py-2.5"
                >
                  <Code>{path}</Code>
                  <span className="text-xs text-nfs-muted">{desc}</span>
                </div>
              ))}
            </div>
            <h3 className="font-semibold text-white mt-4">
              Required Capabilities
            </h3>
            <CodeBlock>{`privileged: true        # or alternatively:
cap_add:
  - SYS_ADMIN          # For mount/umount operations
  - NET_ADMIN           # For VPN (WireGuard/OpenVPN)
devices:
  - /dev/fuse           # For MergerFS (FUSE)`}</CodeBlock>
          </CollapsibleSection>

          <CollapsibleSection
            icon={Settings}
            title="Troubleshooting"
            iconColor="bg-red-500/10 text-red-400"
          >
            <h3 className="font-semibold text-white">NFS Mount Fails</h3>
            <ul className="list-disc list-inside space-y-1 text-nfs-muted">
              <li>
                Check if the NFS server is reachable (ping indicator in UI)
              </li>
              <li>
                Check the NFS export on the server:{" "}
                <Code>showmount -e SERVER_IP</Code>
              </li>
              <li>
                Check if the container has <Code>SYS_ADMIN</Code> capability
              </li>
              <li>Check the logs under System → Logs</li>
            </ul>
            <h3 className="font-semibold text-white mt-3">
              MergerFS Won't Start
            </h3>
            <ul className="list-disc list-inside space-y-1 text-nfs-muted">
              <li>
                Check if <Code>/dev/fuse</Code> is mounted as a device
              </li>
              <li>Check if all source paths exist</li>
              <li>
                Check <Code>user_allow_other</Code> in /etc/fuse.conf
              </li>
            </ul>
            <h3 className="font-semibold text-white mt-3">VPN Won't Connect</h3>
            <ul className="list-disc list-inside space-y-1 text-nfs-muted">
              <li>
                Check if <Code>NET_ADMIN</Code> capability is set
              </li>
              <li>WireGuard: Check PrivateKey and PublicKey</li>
              <li>OpenVPN: Check if certificates are correctly embedded</li>
              <li>Check firewall rules on the host</li>
            </ul>
            <h3 className="font-semibold text-white mt-3">Login Not Working</h3>
            <ul className="list-disc list-inside space-y-1 text-nfs-muted">
              <li>
                Default login: <Code>admin</Code> / <Code>admin</Code>
              </li>
              <li>
                If changed: Check <Code>DEFAULT_ADMIN_USER</Code> and{" "}
                <Code>DEFAULT_ADMIN_PASS</Code>
              </li>
              <li>
                Reset database: Delete <Code>/data/nfs-manager.db</Code> and
                restart the container
              </li>
            </ul>
          </CollapsibleSection>
        </>
      )}

      {/* About Tab */}
      {activeTab === "about" && (
        <>
          {/* Hero */}
          <div className="bg-nfs-card border border-nfs-border rounded-xl p-8 mb-6 flex flex-col items-center text-center">
            <div className="p-4 rounded-2xl bg-nfs-primary/10 mb-4">
              <FolderSync className="w-10 h-10 text-nfs-primary" />
            </div>
            <h2 className="text-2xl font-bold text-white">
              NFS-MergerFS Manager
            </h2>
            <p className="text-sm text-nfs-primary font-medium mt-1">v1.0.0</p>
            <p className="text-sm text-nfs-muted mt-3 max-w-lg leading-relaxed">
              A powerful, self-hosted management platform for NFS mounts,
              MergerFS unions, and VPN tunnels with real-time monitoring and
              notifications.
            </p>
            <a
              href="https://github.com/cyb3rgh05t/nfs-mount"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 px-5 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary rounded-lg text-sm text-white flex items-center gap-2 transition-all"
            >
              <Globe className="w-4 h-4" />
              GitHub
              <ExternalLink className="w-3 h-3 text-nfs-muted" />
            </a>
          </div>

          {/* Features */}
          <p className="text-[11px] font-bold uppercase tracking-widest text-nfs-muted mb-3">
            Features
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {[
              {
                icon: HardDrive,
                title: "NFS Mounts",
                desc: "Create, manage, and monitor NFS network mounts with optimized streaming options.",
              },
              {
                icon: GitMerge,
                title: "MergerFS Unions",
                desc: "Combine multiple directories into unified virtual filesystems.",
              },
              {
                icon: Shield,
                title: "VPN Tunnels",
                desc: "Manage WireGuard and OpenVPN tunnels with auto-connect and status monitoring.",
              },
              {
                icon: Activity,
                title: "Real-time Monitoring",
                desc: "Monitor system resources, mount statuses, and network throughput in real-time.",
              },
              {
                icon: Bell,
                title: "Notifications",
                desc: "Discord and Telegram alerts for mount events, errors, and system status.",
              },
              {
                icon: Terminal,
                title: "REST API",
                desc: "Full REST API with JWT authentication for automation and external integrations.",
              },
            ].map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="bg-nfs-card border border-nfs-border rounded-xl p-4 hover:border-nfs-muted transition-all"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-1.5 rounded-lg bg-nfs-primary/10">
                    <Icon className="w-4 h-4 text-nfs-primary" />
                  </div>
                  <h3 className="text-sm font-semibold text-white">{title}</h3>
                </div>
                <p className="text-xs text-nfs-muted leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          {/* Tech Stack */}
          <p className="text-[11px] font-bold uppercase tracking-widest text-nfs-muted mb-3">
            Tech Stack
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-nfs-card border border-nfs-border rounded-xl p-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-nfs-primary mb-3">
                Backend
              </p>
              <div className="space-y-2">
                {[
                  ["Python", "FastAPI"],
                  ["SQLAlchemy", "ORM"],
                  ["Uvicorn", "ASGI Server"],
                  ["Pydantic", "Validation"],
                ].map(([name, role]) => (
                  <div
                    key={name}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="text-nfs-text">{name}</span>
                    <span className="text-nfs-muted">{role}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-nfs-card border border-nfs-border rounded-xl p-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-nfs-primary mb-3">
                Frontend
              </p>
              <div className="space-y-2">
                {[
                  ["React", "UI Framework"],
                  ["Tailwind CSS", "Styling"],
                  ["Vite", "Build Tool"],
                  ["Lucide", "Icons"],
                ].map(([name, role]) => (
                  <div
                    key={name}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="text-nfs-text">{name}</span>
                    <span className="text-nfs-muted">{role}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-nfs-card border border-nfs-border rounded-xl p-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-nfs-primary mb-3">
                Infrastructure
              </p>
              <div className="space-y-2">
                {[
                  ["Docker", "Containerization"],
                  ["SQLite", "Database"],
                  ["WireGuard", "VPN Tunnel"],
                  ["MergerFS", "Union Filesystem"],
                ].map(([name, role]) => (
                  <div
                    key={name}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="text-nfs-text">{name}</span>
                    <span className="text-nfs-muted">{role}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* System */}
          {dockerInfo && (
            <>
              <p className="text-[11px] font-bold uppercase tracking-widest text-nfs-muted mb-3">
                System
              </p>
              <div className="bg-nfs-card border border-nfs-border rounded-xl p-4 mb-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    [
                      "Docker",
                      dockerInfo.docker_version
                        ?.replace("Docker version ", "")
                        .split(",")[0] || "N/A",
                    ],
                    ["Container", dockerInfo.container_id || "N/A"],
                    ["OS", dockerInfo.os || "N/A"],
                    ["Arch", dockerInfo.arch || "N/A"],
                  ].map(([label, value]) => (
                    <div key={label} className="text-center">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-nfs-muted mb-1">
                        {label}
                      </p>
                      <p className="text-xs text-nfs-text font-mono">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Footer */}
          <div className="text-center py-4">
            <p className="text-xs text-nfs-muted flex items-center justify-center gap-1">
              Made with <Heart className="w-3 h-3 text-red-400 fill-red-400" />{" "}
              by{" "}
              <a
                href="https://github.com/cyb3rgh05t"
                target="_blank"
                rel="noopener noreferrer"
                className="text-nfs-primary hover:underline"
              >
                cyb3rgh05t
              </a>
            </p>
          </div>
        </>
      )}
      <ProgressDialog progress={progress} />
    </div>
  );
}
