import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  HardDrive,
  GitMerge,
  Settings,
  FolderSync,
  Menu,
  X,
  Shield,
  Users,
  BookOpen,
  LogOut,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "../context/AuthContext";

const links = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/nfs", label: "NFS", icon: HardDrive },
  { to: "/mergerfs", label: "MergerFS", icon: GitMerge },
  { to: "/vpn", label: "VPN Tunnel", icon: Shield },
  { to: "/users", label: "Benutzer", icon: Users, adminOnly: true },
  { to: "/settings", label: "Einstellungen", icon: Settings },
  { to: "/docs", label: "Dokumentation", icon: BookOpen },
];

export default function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();

  const filteredLinks = links.filter((l) => !l.adminOnly || user?.is_admin);

  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
      isActive
        ? "bg-nfs-primary text-black font-semibold"
        : "text-nfs-muted hover:text-nfs-primary"
    }`;

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-6 border-b border-nfs-border">
        <FolderSync className="w-8 h-8 text-nfs-primary" />
        <div>
          <h1 className="text-lg font-bold text-white">NFS Manager</h1>
          <p className="text-xs text-nfs-muted">MergerFS & UnionFS</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {filteredLinks.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={linkClass}
            onClick={() => setMobileOpen(false)}
          >
            <Icon className="w-5 h-5" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* User & Logout */}
      <div className="px-3 py-4 border-t border-nfs-border space-y-3">
        {user && (
          <div className="flex items-center gap-3 px-4">
            <div className="w-8 h-8 rounded-full bg-nfs-primary/20 flex items-center justify-center">
              <span className="text-xs font-bold text-nfs-primary uppercase">
                {user.display_name?.[0] || user.username[0]}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user.display_name || user.username}
              </p>
              <p className="text-xs text-nfs-muted">
                {user.is_admin ? "Admin" : "User"}
              </p>
            </div>
          </div>
        )}
        <button
          onClick={logout}
          className="flex items-center gap-3 px-4 py-2.5 w-full rounded-lg text-nfs-muted hover:text-red-400 hover:bg-red-500/10 transition-colors text-sm"
        >
          <LogOut className="w-4 h-4" />
          <span>Abmelden</span>
        </button>
        <p className="text-xs text-nfs-muted text-center">v1.0.0</p>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-nfs-input text-nfs-text"
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:relative z-40 h-full w-64 bg-nfs-bg-dark border-r border-nfs-border flex flex-col transition-transform duration-200 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
