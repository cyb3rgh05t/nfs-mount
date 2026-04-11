import { useState, useEffect, useRef } from "react";
import {
  ScrollText,
  RefreshCw,
  Download,
  Trash2,
  Filter,
  ArrowDown,
  Pause,
  Play,
} from "lucide-react";
import api from "../api/client";
import { useToast } from "../components/ToastProvider";
import ProgressDialog from "../components/ProgressDialog";

const LEVEL_COLORS = {
  DEBUG: "text-cyan-400 bg-cyan-400/10",
  INFO: "text-emerald-400 bg-emerald-400/10",
  WARNING: "text-yellow-400 bg-yellow-400/10",
  ERROR: "text-red-400 bg-red-400/10",
  CRITICAL: "text-red-500 bg-red-500/10 font-bold",
};

const LEVEL_OPTIONS = ["ALL", "DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"];

export default function LogsPage() {
  const toast = useToast();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState(null);
  const [level, setLevel] = useState("ALL");
  const [lines, setLines] = useState(500);
  const [autoScroll, setAutoScroll] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [search, setSearch] = useState("");
  const logEndRef = useRef(null);
  const containerRef = useRef(null);

  const fetchLogs = async () => {
    try {
      const data = await api.getLogs(lines, level === "ALL" ? null : level);
      setLogs(data);
    } catch (e) {
      toast.error("Failed to load logs: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [level, lines, autoRefresh]);

  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  const filteredLogs = search
    ? logs.filter(
        (l) =>
          l.message.toLowerCase().includes(search.toLowerCase()) ||
          l.source.toLowerCase().includes(search.toLowerCase()),
      )
    : logs;

  const handleExport = () => {
    const text = filteredLogs
      .map(
        (l) =>
          `${l.timestamp} | ${l.level.padEnd(8)} | ${l.source} | ${l.message}`,
      )
      .join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nfs-manager-logs-${new Date().toISOString().slice(0, 10)}.log`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Logs exported");
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-nfs-primary/10 rounded-lg">
              <ScrollText className="w-6 h-6 text-nfs-primary" />
            </div>
            Container Logs
          </h1>
          <p className="text-sm text-nfs-muted mt-1 ml-12">
            Live application logs from the NFS-MergerFS Manager
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-nfs-card border border-nfs-border hover:border-nfs-primary text-white rounded-lg text-sm font-medium transition-all"
          >
            <Download className="w-4 h-4 text-nfs-primary" />
            Export
          </button>
          <button
            onClick={async () => {
              setRefreshing(true);
              setProgress({ message: "Refreshing logs...", status: "loading" });
              try {
                await fetchLogs();
                setProgress({ message: "Logs refreshed", status: "success" });
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
      </div>

      {/* Controls */}
      <div className="bg-nfs-card border border-nfs-border rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Level Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-nfs-muted" />
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="bg-nfs-input border border-nfs-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-nfs-primary"
            >
              {LEVEL_OPTIONS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>

          {/* Lines Count */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-nfs-muted">Lines:</span>
            <select
              value={lines}
              onChange={(e) => setLines(Number(e.target.value))}
              className="bg-nfs-input border border-nfs-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-nfs-primary"
            >
              {[100, 250, 500, 1000, 2500, 5000].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          {/* Search */}
          <input
            type="text"
            placeholder="Search logs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] bg-nfs-input border border-nfs-border rounded-lg px-3 py-1.5 text-sm text-white placeholder-nfs-muted focus:outline-none focus:ring-2 focus:ring-nfs-primary"
          />

          {/* Auto-refresh toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
              autoRefresh
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                : "bg-nfs-input border-nfs-border text-nfs-muted"
            }`}
          >
            {autoRefresh ? (
              <Pause className="w-3.5 h-3.5" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            {autoRefresh ? "Live" : "Paused"}
          </button>

          {/* Auto-scroll toggle */}
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
              autoScroll
                ? "bg-nfs-primary/10 border-nfs-primary/30 text-nfs-primary"
                : "bg-nfs-input border-nfs-border text-nfs-muted"
            }`}
          >
            <ArrowDown className="w-3.5 h-3.5" />
            Auto-scroll
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="flex items-center gap-4 text-xs text-nfs-muted px-1">
        <span>
          Showing {filteredLogs.length} of {logs.length} entries
        </span>
        {logs.length > 0 && (
          <>
            <span>•</span>
            <span className="text-red-400">
              {
                logs.filter(
                  (l) => l.level === "ERROR" || l.level === "CRITICAL",
                ).length
              }{" "}
              errors
            </span>
            <span className="text-yellow-400">
              {logs.filter((l) => l.level === "WARNING").length} warnings
            </span>
          </>
        )}
      </div>

      {/* Log Output */}
      <div
        ref={containerRef}
        className="bg-[#0d1117] border border-nfs-border rounded-xl overflow-hidden"
      >
        <div className="overflow-auto max-h-[calc(100vh-340px)] p-4 font-mono text-xs leading-relaxed">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-nfs-primary/30 border-t-nfs-primary rounded-full animate-spin" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center text-nfs-muted py-20">
              {search ? "No logs match your search" : "No log entries found"}
            </div>
          ) : (
            <>
              {filteredLogs.map((entry, i) => (
                <div
                  key={i}
                  className="flex gap-3 py-0.5 hover:bg-white/[0.02] group"
                >
                  <span className="text-nfs-muted/50 shrink-0 w-[155px]">
                    {entry.timestamp}
                  </span>
                  <span
                    className={`shrink-0 w-[72px] text-center rounded px-1 ${
                      LEVEL_COLORS[entry.level] || "text-nfs-muted"
                    }`}
                  >
                    {entry.level}
                  </span>
                  <span className="text-slate-500 shrink-0 w-[220px] truncate">
                    {entry.source}
                  </span>
                  <span className="text-slate-300 break-all">
                    {entry.message}
                  </span>
                </div>
              ))}
              <div ref={logEndRef} />
            </>
          )}
        </div>
      </div>

      <ProgressDialog progress={progress} />
    </div>
  );
}
