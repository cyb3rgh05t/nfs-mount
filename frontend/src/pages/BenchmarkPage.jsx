import { useState, useEffect } from "react";
import {
  Gauge,
  HardDrive,
  Play,
  Clock,
  FileText,
  ArrowDown,
  ArrowUp,
  RefreshCw,
} from "lucide-react";
import { useToast } from "../components/ToastProvider";
import api from "../api/client";

export default function BenchmarkPage() {
  const toast = useToast();
  const [nfsMounts, setNfsMounts] = useState([]);
  const [selectedMount, setSelectedMount] = useState("");
  const [fileSize, setFileSize] = useState(256);
  const [benchRunning, setBenchRunning] = useState(false);
  const [benchResult, setBenchResult] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    api
      .getNFSStatus()
      .then((mounts) => {
        const mounted = (mounts || []).filter((m) => m.mounted);
        setNfsMounts(mounted);
        if (mounted.length > 0 && !selectedMount) {
          setSelectedMount(mounted[0].local_path);
        }
      })
      .catch(() => {});
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

      {nfsMounts.length === 0 ? (
        <div className="bg-nfs-card border border-nfs-border rounded-xl p-12 text-center">
          <HardDrive className="w-12 h-12 text-nfs-muted mx-auto mb-4" />
          <p className="text-nfs-muted">
            No mounted NFS shares found. Mount an NFS share first to run
            benchmarks.
          </p>
        </div>
      ) : (
        <>
          {/* Controls */}
          <div className="bg-nfs-card border border-nfs-border rounded-xl p-5">
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[220px]">
                <label className="block text-sm text-nfs-muted mb-1.5 font-medium">
                  NFS Mount
                </label>
                <select
                  value={selectedMount}
                  onChange={(e) => setSelectedMount(e.target.value)}
                  className="w-full bg-nfs-input border border-nfs-border text-white rounded-lg px-3 py-2.5 text-sm focus:border-nfs-primary outline-none"
                >
                  {nfsMounts.map((m) => (
                    <option key={m.local_path} value={m.local_path}>
                      {m.name} — {m.local_path}
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-40">
                <label className="block text-sm text-nfs-muted mb-1.5 font-medium">
                  Test File Size
                </label>
                <select
                  value={fileSize}
                  onChange={(e) => setFileSize(Number(e.target.value))}
                  className="w-full bg-nfs-input border border-nfs-border text-white rounded-lg px-3 py-2.5 text-sm focus:border-nfs-primary outline-none"
                >
                  <option value={64}>64 MB</option>
                  <option value={128}>128 MB</option>
                  <option value={256}>256 MB</option>
                  <option value={512}>512 MB</option>
                  <option value={1024}>1 GB</option>
                  <option value={2048}>2 GB</option>
                  <option value={10240}>10 GB</option>
                  <option value={51200}>50 GB</option>
                </select>
              </div>
              <button
                onClick={runBenchmark}
                disabled={benchRunning || !selectedMount}
                className="flex items-center gap-2 px-6 py-2.5 bg-nfs-primary text-black rounded-lg text-sm font-semibold hover:bg-nfs-primary/90 transition-all disabled:opacity-50"
              >
                {benchRunning ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
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
                      <p
                        className={`text-3xl font-bold ${speedColor(benchResult.write.speed_mbps)}`}
                      >
                        {benchResult.write.speed_mbps}
                        <span className="text-sm text-nfs-muted font-normal ml-1">
                          MB/s
                        </span>
                      </p>
                      <p className="text-xs text-nfs-muted mt-2">
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
                      <p
                        className={`text-3xl font-bold ${speedColor(benchResult.read.speed_mbps)}`}
                      >
                        {benchResult.read.speed_mbps}
                        <span className="text-sm text-nfs-muted font-normal ml-1">
                          MB/s
                        </span>
                      </p>
                      <p className="text-xs text-nfs-muted mt-2">
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
                      <p
                        className={`text-3xl font-bold ${latencyColor(benchResult.latency.avg_ms)}`}
                      >
                        {benchResult.latency.avg_ms}
                        <span className="text-sm text-nfs-muted font-normal ml-1">
                          ms
                        </span>
                      </p>
                      <p className="text-xs text-nfs-muted mt-2">
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
                      <p className="text-3xl font-bold text-white">
                        {benchResult.metadata.create_ops_per_sec}
                        <span className="text-sm text-nfs-muted font-normal ml-1">
                          create/s
                        </span>
                      </p>
                      <p className="text-xs text-nfs-muted mt-2">
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
