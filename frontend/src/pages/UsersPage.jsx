import { useState, useEffect } from "react";
import {
  Users,
  Plus,
  Edit3,
  Trash2,
  X,
  Shield,
  ShieldOff,
  CheckCircle,
  AlertCircle,
  Key,
  Save,
  Eye,
  EyeOff,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import api from "../api/client";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmProvider";

const inputClass =
  "w-full px-4 py-2.5 bg-nfs-input border border-nfs-border rounded-lg text-white placeholder-nfs-muted text-sm focus:outline-none focus:ring-2 focus:ring-nfs-primary focus:border-transparent";

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

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const toast = useToast();
  const confirmDlg = useConfirm();
  const [showPass, setShowPass] = useState(false);
  const [form, setForm] = useState({
    username: "",
    password: "",
    display_name: "",
    is_admin: false,
  });

  // Password change
  const [showPwChange, setShowPwChange] = useState(null);
  const [newPassword, setNewPassword] = useState("");

  const fetchUsers = async () => {
    try {
      const data = await api.getUsers();
      setUsers(data);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const showSuccessMsg = (msg) => {
    toast.success(msg);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      if (editing) {
        const update = {
          display_name: form.display_name,
          is_admin: form.is_admin,
        };
        if (form.password) update.password = form.password;
        await api.updateUser(editing.id, update);
        showSuccessMsg("User updated");
      } else {
        await api.createUser(form);
        showSuccessMsg("User created");
      }
      setShowForm(false);
      setEditing(null);
      fetchUsers();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDelete = async (userId) => {
    const u = users.find((x) => x.id === userId);
    const ok = await confirmDlg({
      title: "Delete User?",
      message: `This will permanently delete "${u?.display_name || u?.username || "this user"}". This action cannot be undone.`,
      variant: "danger",
      confirmText: "Delete",
    });
    if (!ok) return;
    try {
      await api.deleteUser(userId);
      toast.success(`User "${u?.display_name || u?.username}" deleted`);
      fetchUsers();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleToggleActive = async (user) => {
    const action = user.is_active ? "deactivate" : "activate";
    const ok = await confirmDlg({
      title: `${user.is_active ? "Deactivate" : "Activate"} User?`,
      message: `${user.is_active ? "Deactivate" : "Activate"} "${user.display_name || user.username}"?${user.is_active ? " They will be logged out." : ""}`,
      variant: user.is_active ? "warning" : "info",
      confirmText: user.is_active ? "Deactivate" : "Activate",
    });
    if (!ok) return;
    try {
      await api.updateUser(user.id, { is_active: !user.is_active });
      toast.success(`User "${user.display_name || user.username}" ${action}d`);
      fetchUsers();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleResetPassword = async (userId) => {
    if (!newPassword) return;
    try {
      await api.updateUser(userId, { password: newPassword });
      showSuccessMsg("Password reset");
      setShowPwChange(null);
      setNewPassword("");
    } catch (e) {
      setError(e.message);
    }
  };

  const openCreate = () => {
    setForm({ username: "", password: "", display_name: "", is_admin: false });
    setEditing(null);
    setShowForm(true);
  };

  const openEdit = (u) => {
    setForm({
      username: u.username,
      password: "",
      display_name: u.display_name,
      is_admin: u.is_admin,
    });
    setEditing(u);
    setShowForm(true);
  };

  if (!currentUser?.is_admin) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-nfs-muted">Admin privileges required</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <div className="p-2 rounded-lg bg-nfs-primary/10">
            <Users className="w-5 h-5 text-nfs-primary" />
          </div>
          User Management
        </h1>
        <button
          onClick={openCreate}
          className="px-4 py-2.5 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-all"
        >
          <Plus className="w-4 h-4 text-nfs-primary" />
          New User
        </button>
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

      {/* Users List */}
      <div className="space-y-3">
        {users.map((u) => (
          <div
            key={u.id}
            className="bg-nfs-card border border-nfs-border rounded-xl p-4 flex items-center justify-between hover:border-nfs-muted transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-nfs-primary/20 flex items-center justify-center">
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

            <div className="flex items-center gap-2">
              {/* Reset Password */}
              {showPwChange === u.id ? (
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password"
                    className="px-3 py-1.5 bg-nfs-input border border-nfs-border rounded-lg text-white text-xs w-36 focus:outline-none focus:ring-1 focus:ring-nfs-primary"
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
                      setNewPassword("");
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

              {/* Toggle Active */}
              <button
                onClick={() => handleToggleActive(u)}
                className={`p-2 rounded-lg transition-colors ${
                  u.is_active
                    ? "text-emerald-400 hover:bg-emerald-500/10"
                    : "text-red-400 hover:bg-red-500/10"
                }`}
                title={u.is_active ? "Deactivate" : "Activate"}
              >
                {u.is_active ? (
                  <Shield className="w-4 h-4" />
                ) : (
                  <ShieldOff className="w-4 h-4" />
                )}
              </button>

              {/* Edit */}
              <button
                onClick={() => openEdit(u)}
                className="p-2 rounded-lg text-nfs-muted hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
              >
                <Edit3 className="w-4 h-4" />
              </button>

              {/* Delete */}
              {u.id !== currentUser.id && (
                <button
                  onClick={() => handleDelete(u.id)}
                  className="p-2 rounded-lg text-nfs-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Create/Edit Modal */}
      {showForm && (
        <Modal
          title={editing ? "Edit User" : "New User"}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-nfs-muted mb-1.5">
                Username
              </label>
              <input
                className={inputClass}
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                disabled={!!editing}
                placeholder="username"
                required={!editing}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-nfs-muted mb-1.5">
                Display Name
              </label>
              <input
                className={inputClass}
                value={form.display_name}
                onChange={(e) =>
                  setForm({ ...form, display_name: e.target.value })
                }
                placeholder="John Doe"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-nfs-muted mb-1.5">
                Password {editing && "(empty = no change)"}
              </label>
              <div className="relative">
                <input
                  className={inputClass}
                  type={showPass ? "text" : "password"}
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                  placeholder="••••••••"
                  required={!editing}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-nfs-muted hover:text-white"
                >
                  {showPass ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-nfs-text">
              <input
                type="checkbox"
                checked={form.is_admin}
                onChange={(e) =>
                  setForm({ ...form, is_admin: e.target.checked })
                }
              />
              Administrator
            </label>
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
    </div>
  );
}
