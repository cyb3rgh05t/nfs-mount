import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  HardDrive,
  GitMerge,
  Settings,
  Menu,
  X,
  Shield,
  Monitor,
  Stethoscope,
  HeartPulse,
  Gauge,
  ScrollText,
  User,
  LogOut,
  Download,
  Upload,
  ChevronDown,
  Info,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "../context/AuthContext";

const links = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  {
    label: "NFS Manager",
    icon: HardDrive,
    children: [
      { to: "/nfs/client", label: "Client Mounts", icon: Download },
      { to: "/nfs/exports", label: "Server Exports", icon: Upload },
    ],
  },
  { to: "/mergerfs", label: "MergerFS", icon: GitMerge },
  { to: "/vpn", label: "VPN Tunnel", icon: Shield },
  { to: "/monitor", label: "Server Monitor", icon: Monitor },
  { to: "/diagnostics", label: "Diagnostics", icon: Stethoscope },
  { to: "/health", label: "Server Health", icon: HeartPulse },
  { to: "/benchmark", label: "Benchmark", icon: Gauge },
  { to: "/logs", label: "Logs", icon: ScrollText },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/about", label: "About", icon: Info },
];

export default function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [nfsOpen, setNfsOpen] = useState(false);
  const { user, logout } = useAuth();
  const location = useLocation();

  const filteredLinks = links;

  // Auto-expand NFS when on an NFS sub-route
  const isNfsActive = location.pathname.startsWith("/nfs");
  const nfsExpanded = nfsOpen || isNfsActive;

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
        <img src="/favicon.svg" alt="NFS Manager" className="w-8 h-8" />
        <div>
          <h1 className="text-lg font-bold text-white">NFS Manager</h1>
          <p className="text-xs text-nfs-muted">MergerFS & UnionFS</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {filteredLinks.map((item) => {
          if (item.children) {
            const Icon = item.icon;
            return (
              <div key={item.label}>
                <button
                  onClick={() => setNfsOpen(!nfsExpanded)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors w-full ${
                    isNfsActive
                      ? "text-nfs-primary font-semibold"
                      : "text-nfs-muted hover:text-nfs-primary"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="flex-1 text-left">{item.label}</span>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform ${
                      nfsExpanded ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {nfsExpanded && (
                  <div className="ml-4 space-y-0.5">
                    {item.children.map(({ to, label, icon: SubIcon }) => (
                      <NavLink
                        key={to}
                        to={to}
                        className={linkClass}
                        onClick={() => setMobileOpen(false)}
                      >
                        <SubIcon className="w-4 h-4" />
                        <span className="text-sm">{label}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          }
          const { to, label, icon: Icon } = item;
          return (
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
          );
        })}
      </nav>

      {/* User & Logout */}
      <div className="px-3 py-4">
        {user && (
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-nfs-input/50">
            <div className="w-9 h-9 rounded-lg bg-nfs-primary/20 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-nfs-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate leading-tight">
                {user.display_name || user.username}
              </p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-nfs-muted leading-tight">
                {user.is_admin ? "Admin" : "User"}
              </p>
            </div>
            <button
              onClick={logout}
              title="Logout"
              className="p-1.5 rounded-md text-nfs-muted hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
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
