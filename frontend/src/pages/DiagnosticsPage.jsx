import { useState } from "react";
import {
  Stethoscope,
  HardDrive,
  GitMerge,
  Zap,
  Database,
  Cpu,
  Network,
  Terminal,
  Activity,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Info,
} from "lucide-react";
import { useToast } from "../components/ToastProvider";
import api from "../api/client";

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

export default function DiagnosticsPage() {
  const toast = useToast();
  const [diagnostics, setDiagnostics] = useState(null);
  const [diagLoading, setDiagLoading] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-nfs-primary/10 rounded-lg">
              <Stethoscope className="w-6 h-6 text-nfs-primary" />
            </div>
            Diagnostics
          </h1>
          <p className="text-nfs-muted mt-1">
            Verify that NFS mounts, MergerFS, exports, and kernel parameters are
            configured with optimal performance settings.
          </p>
        </div>
        <button
          onClick={async () => {
            setDiagLoading(true);
            try {
              const data = await api.getDiagnostics();
              setDiagnostics(data);
            } catch (e) {
              toast.error(e.message);
            } finally {
              setDiagLoading(false);
            }
          }}
          disabled={diagLoading}
          className="flex items-center gap-2 px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium transition-all"
        >
          {diagLoading ? (
            <RefreshCw className="w-4 h-4 animate-spin text-nfs-primary" />
          ) : (
            <Stethoscope className="w-4 h-4 text-nfs-primary" />
          )}
          {diagLoading ? "Scanning..." : "Run Diagnostics"}
        </button>
      </div>

      {!diagnostics && !diagLoading && (
        <div className="bg-nfs-card border border-nfs-border rounded-xl p-12 text-center">
          <Stethoscope className="w-12 h-12 text-nfs-muted mx-auto mb-4" />
          <p className="text-nfs-muted">
            Click{" "}
            <span className="text-white font-medium">Run Diagnostics</span> to
            scan your system configuration.
          </p>
        </div>
      )}

      {diagnostics && (
        <div className="space-y-6">
          {/* NFS Mounts */}
          <Section
            icon={HardDrive}
            title="NFS Mounts"
            iconColor="bg-blue-500/10 text-blue-400"
          >
            {diagnostics.nfs_mounts.length === 0 ? (
              <p className="text-nfs-muted text-sm">No NFS mounts found.</p>
            ) : (
              <div className="space-y-3">
                {diagnostics.nfs_mounts.map((m, i) => (
                  <div
                    key={i}
                    className="bg-nfs-input border border-nfs-border rounded-lg p-4"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <code className="text-sm text-white font-mono">
                        {m.device}
                      </code>
                      <span className="text-nfs-muted text-xs">→</span>
                      <code className="text-sm text-nfs-primary font-mono">
                        {m.mount_point}
                      </code>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {Object.entries(m.checks).map(([key, ok]) => (
                        <span
                          key={key}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono ${
                            ok
                              ? "bg-green-500/10 text-green-400 border border-green-500/20"
                              : "bg-red-500/10 text-red-400 border border-red-500/20"
                          }`}
                        >
                          {ok ? (
                            <CheckCircle className="w-3 h-3" />
                          ) : (
                            <AlertCircle className="w-3 h-3" />
                          )}
                          {key}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-nfs-muted mt-2 font-mono break-all">
                      {m.options}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Read-Ahead */}
          <Section
            icon={Zap}
            title="Read-Ahead"
            iconColor="bg-yellow-500/10 text-yellow-400"
          >
            {diagnostics.read_ahead.length === 0 ? (
              <p className="text-nfs-muted text-sm">
                No NFS BDI devices found.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {diagnostics.read_ahead.map((ra, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-3 p-3 rounded-lg border ${
                      ra.ok
                        ? "bg-green-500/5 border-green-500/20"
                        : "bg-red-500/5 border-red-500/20"
                    }`}
                  >
                    {ra.ok ? (
                      <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                    )}
                    <div>
                      <code className="text-xs font-mono text-white">
                        {ra.device}
                      </code>
                      <p className="text-xs text-nfs-muted">
                        {ra.read_ahead_kb} KB
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* MergerFS */}
          <Section
            icon={GitMerge}
            title="MergerFS Mounts"
            iconColor="bg-purple-500/10 text-purple-400"
          >
            {diagnostics.mergerfs_mounts.length === 0 ? (
              <p className="text-nfs-muted text-sm">
                No MergerFS mounts found.
              </p>
            ) : (
              <div className="space-y-3">
                {diagnostics.mergerfs_mounts.map((m, i) => (
                  <div
                    key={i}
                    className="bg-nfs-input border border-nfs-border rounded-lg p-4"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <code className="text-sm text-white font-mono">
                        {m.device}
                      </code>
                      <span className="text-nfs-muted text-xs">→</span>
                      <code className="text-sm text-nfs-primary font-mono">
                        {m.mount_point}
                      </code>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {Object.entries(m.checks).map(([key, ok]) => (
                        <span
                          key={key}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono ${
                            ok
                              ? "bg-green-500/10 text-green-400 border border-green-500/20"
                              : "bg-red-500/10 text-red-400 border border-red-500/20"
                          }`}
                        >
                          {ok ? (
                            <CheckCircle className="w-3 h-3" />
                          ) : (
                            <AlertCircle className="w-3 h-3" />
                          )}
                          {key}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-nfs-muted mt-2 font-mono break-all">
                      {m.full_options || m.options}
                    </p>
                    {m.options_source && (
                      <p className="text-[10px] text-purple-400 mt-1">
                        Options verified via: {m.options_source}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* NFS Exports */}
          <Section
            icon={Database}
            title="NFS Exports"
            iconColor="bg-teal-500/10 text-teal-400"
          >
            {diagnostics.nfs_exports.length === 0 ? (
              <p className="text-nfs-muted text-sm">No NFS exports found.</p>
            ) : (
              <div className="space-y-2">
                {diagnostics.nfs_exports.map((exp, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-3 p-3 rounded-lg border ${
                      exp.async
                        ? "bg-green-500/5 border-green-500/20"
                        : "bg-red-500/5 border-red-500/20"
                    }`}
                  >
                    {exp.async ? (
                      <CheckCircle className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    )}
                    <code className="text-xs font-mono text-nfs-text break-all">
                      {exp.line}
                    </code>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* NFS Threads & Connections */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <Section
              icon={Cpu}
              title="NFS Threads"
              iconColor="bg-orange-500/10 text-orange-400"
            >
              <div className="flex items-center gap-3">
                {diagnostics.nfs_threads >= 128 ? (
                  <CheckCircle className="w-5 h-5 text-green-400" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-400" />
                )}
                <span className="text-2xl font-bold text-white">
                  {diagnostics.nfs_threads ?? "N/A"}
                </span>
                <span className="text-sm text-nfs-muted">threads</span>
              </div>
            </Section>

            <Section
              icon={Network}
              title="NFS Connections"
              iconColor="bg-cyan-500/10 text-cyan-400"
            >
              <div className="flex items-center gap-3">
                <Activity className="w-5 h-5 text-nfs-primary" />
                <span className="text-2xl font-bold text-white">
                  {diagnostics.nfs_connections}
                </span>
                <span className="text-sm text-nfs-muted">TCP on :2049</span>
              </div>
            </Section>
          </div>

          {/* Kernel Parameters */}
          <Section
            icon={Terminal}
            title="Kernel Parameters"
            iconColor="bg-indigo-500/10 text-indigo-400"
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              {Object.entries(diagnostics.kernel_params).map(
                ([param, info]) => (
                  <div
                    key={param}
                    className={`flex items-center gap-3 p-3 rounded-lg border ${
                      info.ok
                        ? "bg-green-500/5 border-green-500/20"
                        : "bg-red-500/5 border-red-500/20"
                    }`}
                  >
                    {info.ok ? (
                      <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <code className="text-xs font-mono text-white break-all">
                        {param}
                      </code>
                      <p className="text-xs text-nfs-muted">
                        {info.value ?? "not available"}
                      </p>
                    </div>
                  </div>
                ),
              )}
            </div>
          </Section>

          {/* RPS/XPS */}
          <Section
            icon={Network}
            title="RPS / XPS"
            iconColor="bg-pink-500/10 text-pink-400"
          >
            {diagnostics.rps_xps.interface ? (
              <div className="space-y-2">
                <p className="text-sm text-nfs-muted">
                  Interface:{" "}
                  <code className="text-white font-mono">
                    {diagnostics.rps_xps.interface}
                  </code>
                </p>
                <div className="flex gap-4">
                  {diagnostics.rps_xps.rps !== undefined && (
                    <div
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                        diagnostics.rps_xps.rps_ok === null
                          ? "bg-nfs-input border-nfs-border"
                          : diagnostics.rps_xps.rps_ok
                            ? "bg-green-500/5 border-green-500/20"
                            : "bg-red-500/5 border-red-500/20"
                      }`}
                    >
                      {diagnostics.rps_xps.rps_ok === null ? (
                        <Info className="w-4 h-4 text-nfs-muted" />
                      ) : diagnostics.rps_xps.rps_ok ? (
                        <CheckCircle className="w-4 h-4 text-green-400" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-400" />
                      )}
                      <span className="text-xs font-mono text-white">
                        RPS: {diagnostics.rps_xps.rps ?? "N/A"}
                      </span>
                    </div>
                  )}
                  {diagnostics.rps_xps.xps !== undefined && (
                    <div
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                        diagnostics.rps_xps.xps_ok === null
                          ? "bg-nfs-input border-nfs-border"
                          : diagnostics.rps_xps.xps_ok
                            ? "bg-green-500/5 border-green-500/20"
                            : "bg-red-500/5 border-red-500/20"
                      }`}
                    >
                      {diagnostics.rps_xps.xps_ok === null ? (
                        <Info className="w-4 h-4 text-nfs-muted" />
                      ) : diagnostics.rps_xps.xps_ok ? (
                        <CheckCircle className="w-4 h-4 text-green-400" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-400" />
                      )}
                      <span className="text-xs font-mono text-white">
                        XPS: {diagnostics.rps_xps.xps ?? "N/A"}
                      </span>
                    </div>
                  )}
                  {diagnostics.rps_xps.xps === undefined && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-nfs-input border-nfs-border">
                      <Info className="w-4 h-4 text-nfs-muted" />
                      <span className="text-xs font-mono text-nfs-muted">
                        XPS: not supported
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-nfs-muted text-sm">
                Could not detect network interface.
              </p>
            )}
          </Section>
        </div>
      )}
    </div>
  );
}
