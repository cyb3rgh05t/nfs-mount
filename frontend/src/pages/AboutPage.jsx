import { useState, useEffect } from "react";
import {
  Info,
  Box,
  GitMerge,
  HardDrive,
  Cpu,
  RefreshCw,
  ExternalLink,
  Globe,
  Shield,
  Activity,
  Bell,
  Terminal,
  Heart,
  FolderSync,
} from "lucide-react";
import api from "../api/client";
import { useCachedState } from "../hooks/useCache";

export default function AboutPage() {
  const [dockerInfo, setDockerInfo] = useCachedState("about-docker", null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const docker = await api.getDockerInfo().catch(() => null);
      setDockerInfo(docker);
    } catch (_) {}
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="bg-nfs-card border border-nfs-border rounded-xl p-8 flex flex-col items-center text-center">
        <div className="p-4 rounded-2xl bg-nfs-primary/10 mb-4">
          <FolderSync className="w-10 h-10 text-nfs-primary" />
        </div>
        <h2 className="text-2xl font-bold text-white">NFS-MergerFS Manager</h2>
        <p className="text-sm text-nfs-primary font-medium mt-1">v1.0.0</p>
        <p className="text-sm text-nfs-muted mt-3 max-w-lg leading-relaxed">
          A powerful, self-hosted management platform for NFS mounts, MergerFS
          unions, and VPN tunnels with real-time monitoring and notifications.
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
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-nfs-muted mb-3">
          Features
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
      </div>

      {/* Tech Stack */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-nfs-muted mb-3">
          Tech Stack
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
      </div>

      {/* System */}
      {dockerInfo && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-nfs-muted mb-3">
            System
          </p>
          <div className="bg-nfs-card border border-nfs-border rounded-xl p-4">
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
        </div>
      )}

      {/* Footer */}
      <div className="text-center py-4">
        <p className="text-xs text-nfs-muted flex items-center justify-center gap-1">
          Made with <Heart className="w-3 h-3 text-red-400 fill-red-400" /> by{" "}
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
    </div>
  );
}
