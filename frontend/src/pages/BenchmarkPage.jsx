import { useState, useEffect, useRef } from "react";
import {
  Gauge,
  HardDrive,
  Play,
  Clock,
  FileText,
  ArrowDown,
  ArrowUp,
  RefreshCw,
  Award,
  ChevronDown,
  Server,
  GitMerge,
} from "lucide-react";
import { useToast } from "../components/ToastProvider";
import api from "../api/client";

export default function BenchmarkPage() {
  const toast = useToast();
  const [allMounts, setAllMounts] = useState([]);
  const [selectedMount, setSelectedMount] = useState("");
  const [fileSize, setFileSize] = useState(256);
  const [benchRunning, setBenchRunning] = useState(false);
  const [benchResult, setBenchResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [mountOpen, setMountOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  const mountRef = useRef(null);
  const sizeRef = useRef(null);

  const fileSizeOptions = [
    { value: 64, label: "64 MB" },
    { value: 128, label: "128 MB" },
    { value: 256, label: "256 MB" },
    { value: 512, label: "512 MB" },
    { value: 1024, label: "1 GB" },
    { value: 2048, label: "2 GB" },
    { value: 10240, label: "10 GB" },
    { value: 51200, label: "50 GB" },
  ];

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (mountRef.current && !mountRef.current.contains(e.target))
        setMountOpen(false);
      if (sizeRef.current && !sizeRef.current.contains(e.target))
        setSizeOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    Promise.all([
      api.getNFSStatus().catch(() => []),
      api.getMergerFSStatus().catch(() => []),
    ]).then(([nfs, mergerfs]) => {
      const nfsMounted = (nfs || [])
        .filter((m) => m.mounted)
        .map((m) => ({
          path: m.local_path,
          label: `[NFS] ${m.name} — ${m.local_path}`,
          type: "nfs",
        }));
      const mfsMounted = (mergerfs || [])
        .filter((m) => m.mounted)
        .map((m) => ({
          path: m.mount_point,
          label: `[MergerFS] ${m.name} — ${m.mount_point}`,
          type: "mergerfs",
        }));
      const combined = [...nfsMounted, ...mfsMounted];
      setAllMounts(combined);
      if (combined.length > 0 && !selectedMount) {
        setSelectedMount(combined[0].path);
      }
    });
  }, []);

  const runBenchmark = async () => {
    if (!selectedMount) return;
    setBenchRunning(true);
    setBenchResult(null);
    try {
      const data = await api.runBenchmark(selectedMount, fileSize);
      setBenchResult(data);
      if (data.error) {
        toast.error(data.error);
      } else {
        setHistory((prev) => [
          {
            ...data,
            timestamp: new Date().toLocaleTimeString(),
            mount: selectedMount,
          },
          ...prev.slice(0, 9),
        ]);
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBenchRunning(false);
    }
  };

  const speedColor = (mbps) => {
    if (mbps >= 800) return "text-green-400";
    if (mbps >= 400) return "text-yellow-400";
    if (mbps >= 100) return "text-orange-400";
    return "text-red-400";
  };

  const latencyColor = (ms) => {
    if (ms <= 5) return "text-green-400";
    if (ms <= 20) return "text-yellow-400";
    if (ms <= 50) return "text-orange-400";
    return "text-red-400";
  };

  const speedBadge = (mbps) => {
    if (mbps >= 800)
      return {
        label: "Excellent",
        bg: "bg-green-500/15",
        text: "text-green-400",
        border: "border-green-500/30",
      };
    if (mbps >= 400)
      return {
        label: "Good",
        bg: "bg-yellow-500/15",
        text: "text-yellow-400",
        border: "border-yellow-500/30",
      };
    if (mbps >= 100)
      return {
        label: "Fair",
        bg: "bg-orange-500/15",
        text: "text-orange-400",
        border: "border-orange-500/30",
      };
    return {
      label: "Poor",
      bg: "bg-red-500/15",
      text: "text-red-400",
      border: "border-red-500/30",
    };
  };

  const latencyBadge = (ms) => {
    if (ms <= 5)
      return {
        label: "Excellent",
        bg: "bg-green-500/15",
        text: "text-green-400",
        border: "border-green-500/30",
      };
    if (ms <= 20)
      return {
        label: "Good",
        bg: "bg-yellow-500/15",
        text: "text-yellow-400",
        border: "border-yellow-500/30",
      };
    if (ms <= 50)
      return {
        label: "Fair",
        bg: "bg-orange-500/15",
        text: "text-orange-400",
        border: "border-orange-500/30",
      };
    return {
      label: "Poor",
      bg: "bg-red-500/15",
      text: "text-red-400",
      border: "border-red-500/30",
    };
  };

  const iopsBadge = (ops) => {
    if (ops >= 500)
      return {
        label: "Excellent",
        bg: "bg-green-500/15",
        text: "text-green-400",
        border: "border-green-500/30",
      };
    if (ops >= 200)
      return {
        label: "Good",
        bg: "bg-yellow-500/15",
        text: "text-yellow-400",
        border: "border-yellow-500/30",
      };
    if (ops >= 50)
      return {
        label: "Fair",
        bg: "bg-orange-500/15",
        text: "text-orange-400",
        border: "border-orange-500/30",
      };
    return {
      label: "Poor",
      bg: "bg-red-500/15",
      text: "text-red-400",
      border: "border-red-500/30",
    };
  };

  const Badge = ({ badge }) => (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border ${badge.bg} ${badge.text} ${badge.border}`}
    >
      <Award className="w-3 h-3" />
      {badge.label}
    </span>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <div className="p-2 bg-nfs-primary/10 rounded-lg">
            <Gauge className="w-6 h-6 text-nfs-primary" />
          </div>
          Performance Benchmark
        </h1>
        <p className="text-nfs-muted mt-1">
          Measure real NFS throughput, latency, and metadata performance on your
          mounted shares.
        </p>
      </div>

      {allMounts.length === 0 ? (
        <div className="bg-nfs-card border border-nfs-border rounded-xl p-12 text-center">
          <HardDrive className="w-12 h-12 text-nfs-muted mx-auto mb-4" />
          <p className="text-nfs-muted">
            No mounted NFS or MergerFS shares found. Mount a share first to run
            benchmarks.
          </p>
        </div>
      ) : (
        <>
          {/* Controls */}
          <div className="bg-nfs-card border border-nfs-border rounded-xl p-5">
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[220px]" ref={mountRef}>
                <label className="block text-sm text-nfs-muted mb-1.5 font-medium">
                  Mount Point
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setMountOpen(!mountOpen);
                      setSizeOpen(false);
                    }}
                    className="w-full flex items-center justify-between bg-nfs-input border border-nfs-border text-white rounded-lg px-3 py-2.5 text-sm hover:border-nfs-muted focus:border-nfs-primary outline-none transition-colors"
                  >
                    <span className="flex items-center gap-2 truncate">
                      {(() => {
                        const sel = allMounts.find(
                          (m) => m.path === selectedMount,
                        );
                        if (!sel)
                          return (
                            <span className="text-nfs-muted">
                              Select mount...
                            </span>
                          );
                        return (
                          <>
                            {sel.type === "mergerfs" ? (
                              <GitMerge className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                            ) : (
                              <Server className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            )}
                            <span className="truncate">{sel.label}</span>
                          </>
                        );
                      })()}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-nfs-muted shrink-0 ml-2 transition-transform ${mountOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  {mountOpen && (
                    <div className="absolute z-50 mt-1 w-full bg-nfs-card border border-nfs-border rounded-lg shadow-xl max-h-60 overflow-y-auto">
                      {allMounts.map((m) => (
                        <button
                          key={m.path}
                          type="button"
                          onClick={() => {
                            setSelectedMount(m.path);
                            setMountOpen(false);
                          }}
                          className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-nfs-primary/10 transition-colors ${
                            m.path === selectedMount
                              ? "bg-nfs-primary/10 text-nfs-primary"
                              : "text-white"
                          }`}
                        >
                          {m.type === "mergerfs" ? (
                            <GitMerge className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                          ) : (
                            <Server className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          )}
                          <span className="truncate">{m.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="w-40" ref={sizeRef}>
                <label className="block text-sm text-nfs-muted mb-1.5 font-medium">
                  Test File Size
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setSizeOpen(!sizeOpen);
                      setMountOpen(false);
                    }}
                    className="w-full flex items-center justify-between bg-nfs-input border border-nfs-border text-white rounded-lg px-3 py-2.5 text-sm hover:border-nfs-muted focus:border-nfs-primary outline-none transition-colors"
                  >
                    <span>
                      {fileSizeOptions.find((o) => o.value === fileSize)
                        ?.label || fileSize}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-nfs-muted shrink-0 ml-2 transition-transform ${sizeOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  {sizeOpen && (
                    <div className="absolute z-50 mt-1 w-full bg-nfs-card border border-nfs-border rounded-lg shadow-xl max-h-60 overflow-y-auto">
                      {fileSizeOptions.map((o) => (
                        <button
                          key={o.value}
                          type="button"
                          onClick={() => {
                            setFileSize(o.value);
                            setSizeOpen(false);
                          }}
                          className={`w-full px-3 py-2.5 text-sm text-left hover:bg-nfs-primary/10 transition-colors ${
                            o.value === fileSize
                              ? "bg-nfs-primary/10 text-nfs-primary"
                              : "text-white"
                          }`}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={runBenchmark}
                disabled={benchRunning || !selectedMount}
                className="flex items-center gap-2 px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium transition-all"
              >
                {benchRunning ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-nfs-primary" />
                ) : (
                  <Play className="w-4 h-4  text-nfs-primary" />
                )}
                {benchRunning ? "Running..." : "Start Benchmark"}
              </button>
            </div>
            {fileSize >= 10240 && (
              <p className="text-xs text-yellow-400 mt-3">
                ⚠ Large file tests ({fileSize >= 51200 ? "50 GB" : "10 GB"}) can
                take several minutes depending on network speed.
              </p>
            )}
          </div>

          {/* Running Indicator */}
          {benchRunning && (
            <div className="bg-nfs-card border border-nfs-border rounded-xl p-10 text-center">
              <RefreshCw className="w-12 h-12 text-nfs-primary animate-spin mx-auto mb-4" />
              <p className="text-white font-semibold text-lg">
                Benchmark running...
              </p>
              <p className="text-nfs-muted text-sm mt-1">
                Writing and reading{" "}
                {fileSize >= 1024 ? `${fileSize / 1024} GB` : `${fileSize} MB`}{" "}
                test file. This may take a moment.
              </p>
            </div>
          )}

          {/* Results */}
          {benchResult && !benchResult.error && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Write Speed */}
                <div className="bg-nfs-card border border-nfs-border rounded-xl p-5 hover:border-nfs-muted transition-all">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 bg-blue-500/10 rounded-lg">
                      <ArrowUp className="w-4 h-4 text-blue-400" />
                    </div>
                    <span className="text-sm text-nfs-muted font-medium">
                      Sequential Write
                    </span>
                  </div>
                  {benchResult.write?.error ? (
                    <p className="text-red-400 text-sm">
                      {benchResult.write.error}
                    </p>
                  ) : benchResult.write ? (
                    <>
                      <div className="flex items-center justify-between mb-1">
                        <p
                          className={`text-3xl font-bold ${speedColor(benchResult.write.speed_mbps)}`}
                        >
                          {benchResult.write.speed_mbps}
                          <span className="text-sm text-nfs-muted font-normal ml-1">
                            MB/s
                          </span>
                        </p>
                        <Badge
                          badge={speedBadge(benchResult.write.speed_mbps)}
                        />
                      </div>
                      <p className="text-xs text-nfs-muted mt-1">
                        {benchResult.write.size_mb >= 1024
                          ? `${(benchResult.write.size_mb / 1024).toFixed(0)} GB`
                          : `${benchResult.write.size_mb} MB`}{" "}
                        in {benchResult.write.elapsed_s}s
                      </p>
                    </>
                  ) : (
                    <p className="text-nfs-muted text-sm">Skipped</p>
                  )}
                </div>

                {/* Read Speed */}
                <div className="bg-nfs-card border border-nfs-border rounded-xl p-5 hover:border-nfs-muted transition-all">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 bg-green-500/10 rounded-lg">
                      <ArrowDown className="w-4 h-4 text-green-400" />
                    </div>
                    <span className="text-sm text-nfs-muted font-medium">
                      Sequential Read
                    </span>
                  </div>
                  {benchResult.read?.error ? (
                    <p className="text-red-400 text-sm">
                      {benchResult.read.error}
                    </p>
                  ) : benchResult.read ? (
                    <>
                      <div className="flex items-center justify-between mb-1">
                        <p
                          className={`text-3xl font-bold ${speedColor(benchResult.read.speed_mbps)}`}
                        >
                          {benchResult.read.speed_mbps}
                          <span className="text-sm text-nfs-muted font-normal ml-1">
                            MB/s
                          </span>
                        </p>
                        <Badge
                          badge={speedBadge(benchResult.read.speed_mbps)}
                        />
                      </div>
                      <p className="text-xs text-nfs-muted mt-1">
                        {benchResult.read.size_mb >= 1024
                          ? `${(benchResult.read.size_mb / 1024).toFixed(0)} GB`
                          : `${benchResult.read.size_mb} MB`}{" "}
                        in {benchResult.read.elapsed_s}s
                      </p>
                    </>
                  ) : (
                    <p className="text-nfs-muted text-sm">Skipped</p>
                  )}
                </div>

                {/* Latency */}
                <div className="bg-nfs-card border border-nfs-border rounded-xl p-5 hover:border-nfs-muted transition-all">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 bg-yellow-500/10 rounded-lg">
                      <Clock className="w-4 h-4 text-yellow-400" />
                    </div>
                    <span className="text-sm text-nfs-muted font-medium">
                      Write Latency
                    </span>
                  </div>
                  {benchResult.latency?.error ? (
                    <p className="text-red-400 text-sm">
                      {benchResult.latency.error}
                    </p>
                  ) : benchResult.latency ? (
                    <>
                      <div className="flex items-center justify-between mb-1">
                        <p
                          className={`text-3xl font-bold ${latencyColor(benchResult.latency.avg_ms)}`}
                        >
                          {benchResult.latency.avg_ms}
                          <span className="text-sm text-nfs-muted font-normal ml-1">
                            ms
                          </span>
                        </p>
                        <Badge
                          badge={latencyBadge(benchResult.latency.avg_ms)}
                        />
                      </div>
                      <p className="text-xs text-nfs-muted mt-1">
                        min {benchResult.latency.min_ms}ms / max{" "}
                        {benchResult.latency.max_ms}ms (
                        {benchResult.latency.samples} samples)
                      </p>
                    </>
                  ) : (
                    <p className="text-nfs-muted text-sm">Skipped</p>
                  )}
                </div>

                {/* Metadata */}
                <div className="bg-nfs-card border border-nfs-border rounded-xl p-5 hover:border-nfs-muted transition-all">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 bg-purple-500/10 rounded-lg">
                      <FileText className="w-4 h-4 text-purple-400" />
                    </div>
                    <span className="text-sm text-nfs-muted font-medium">
                      Metadata IOPS
                    </span>
                  </div>
                  {benchResult.metadata?.error ? (
                    <p className="text-red-400 text-sm">
                      {benchResult.metadata.error}
                    </p>
                  ) : benchResult.metadata ? (
                    <>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-3xl font-bold text-white">
                          {benchResult.metadata.create_ops_per_sec}
                          <span className="text-sm text-nfs-muted font-normal ml-1">
                            create/s
                          </span>
                        </p>
                        <Badge
                          badge={iopsBadge(
                            benchResult.metadata.create_ops_per_sec,
                          )}
                        />
                      </div>
                      <p className="text-xs text-nfs-muted mt-1">
                        {benchResult.metadata.stat_ops_per_sec} stat/s (
                        {benchResult.metadata.num_files} files)
                      </p>
                    </>
                  ) : (
                    <p className="text-nfs-muted text-sm">Skipped</p>
                  )}
                </div>
              </div>

              {/* Info Box */}
              <div className="bg-nfs-card border border-nfs-border rounded-xl p-4">
                <p className="text-xs text-nfs-muted">
                  <span className="text-white font-medium">How it works:</span>{" "}
                  Write/Read tests use{" "}
                  <code className="text-nfs-primary">dd</code> with direct I/O
                  and <code className="text-nfs-primary">fdatasync</code> to
                  bypass caches and measure real NFS throughput. Kernel page
                  cache is dropped before read tests. Latency measures small
                  file create+fsync roundtrip. Results vary with network load
                  and server activity.
                </p>
              </div>
            </>
          )}

          {/* History */}
          {history.length > 0 && (
            <div className="bg-nfs-card border border-nfs-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-3">
                Recent Results
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-nfs-muted text-xs border-b border-nfs-border">
                      <th className="text-left py-2 pr-4">Time</th>
                      <th className="text-left py-2 pr-4">Mount</th>
                      <th className="text-right py-2 pr-4">Size</th>
                      <th className="text-right py-2 pr-4">Write</th>
                      <th className="text-right py-2 pr-4">Read</th>
                      <th className="text-right py-2 pr-4">Latency</th>
                      <th className="text-right py-2">IOPS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h, i) => (
                      <tr
                        key={i}
                        className="border-b border-nfs-border/50 last:border-0"
                      >
                        <td className="py-2 pr-4 text-nfs-muted font-mono text-xs">
                          {h.timestamp}
                        </td>
                        <td className="py-2 pr-4 text-white font-mono text-xs truncate max-w-[150px]">
                          {h.mount}
                        </td>
                        <td className="py-2 pr-4 text-right text-nfs-muted text-xs">
                          {h.file_size_mb >= 1024
                            ? `${(h.file_size_mb / 1024).toFixed(0)} GB`
                            : `${h.file_size_mb} MB`}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono text-xs">
                          <span
                            className={speedColor(h.write?.speed_mbps || 0)}
                          >
                            {h.write?.speed_mbps ?? "—"} MB/s
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-right font-mono text-xs">
                          <span className={speedColor(h.read?.speed_mbps || 0)}>
                            {h.read?.speed_mbps ?? "—"} MB/s
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-right font-mono text-xs">
                          <span
                            className={latencyColor(h.latency?.avg_ms || 999)}
                          >
                            {h.latency?.avg_ms ?? "—"} ms
                          </span>
                        </td>
                        <td className="py-2 text-right font-mono text-xs text-white">
                          {h.metadata?.create_ops_per_sec ?? "—"}/s
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
