const API_BASE = "/api";
const DEBUG = localStorage.getItem("debug") === "true";

function log(level, ...args) {
  if (!DEBUG && level === "debug") return;
  const prefix = `[API ${new Date().toISOString()}]`;
  if (level === "error") console.error(prefix, ...args);
  else if (level === "warn") console.warn(prefix, ...args);
  else console.log(prefix, ...args);
}

function getHeaders() {
  const headers = { "Content-Type": "application/json" };
  const token = localStorage.getItem("token");
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const apiKey = localStorage.getItem("apiKey");
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }
  return headers;
}

async function request(method, path, body) {
  const start = performance.now();
  log("debug", `${method} ${path}`, body !== undefined ? body : "");
  const opts = {
    method,
    headers: getHeaders(),
  };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${path}`, opts);
  const duration = Math.round(performance.now() - start);
  if (res.status === 401 && !path.startsWith("/auth/")) {
    log("warn", `${method} ${path} -> 401 (${duration}ms) – token cleared`);
    localStorage.removeItem("token");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    log(
      "error",
      `${method} ${path} -> ${res.status} (${duration}ms):`,
      err.detail,
    );
    throw new Error(err.detail || "Request failed");
  }
  log("debug", `${method} ${path} -> ${res.status} (${duration}ms)`);
  if (res.status === 204) return null;
  return res.json();
}

const api = {
  // Auth
  login: (username, password) =>
    request("POST", "/auth/login", { username, password }),
  getMe: () => request("GET", "/auth/me"),
  updateMe: (data) => request("PUT", "/auth/me", data),
  changePassword: (current_password, new_password) =>
    request("POST", "/auth/change-password", {
      current_password,
      new_password,
    }),
  getUsers: () => request("GET", "/auth/users"),
  createUser: (data) => request("POST", "/auth/users", data),
  updateUser: (id, data) => request("PUT", `/auth/users/${id}`, data),
  deleteUser: (id) => request("DELETE", `/auth/users/${id}`),
  checkSetup: () => request("GET", "/auth/setup-required"),
  // NFS
  getNFSMounts: () => request("GET", "/nfs/mounts"),
  createNFSMount: (data) => request("POST", "/nfs/mounts", data),
  updateNFSMount: (id, data) => request("PUT", `/nfs/mounts/${id}`, data),
  deleteNFSMount: (id) => request("DELETE", `/nfs/mounts/${id}`),
  mountNFS: (id) => request("POST", `/nfs/mounts/${id}/mount`),
  unmountNFS: (id) => request("POST", `/nfs/mounts/${id}/unmount`),
  getNFSStatus: () => request("GET", "/nfs/status"),
  mountAllNFS: () => request("POST", "/nfs/mount-all"),
  unmountAllNFS: () => request("POST", "/nfs/unmount-all"),

  // NFS Exports (Server)
  getNFSExports: () => request("GET", "/nfs/exports"),
  createNFSExport: (data) => request("POST", "/nfs/exports", data),
  updateNFSExport: (id, data) => request("PUT", `/nfs/exports/${id}`, data),
  deleteNFSExport: (id) => request("DELETE", `/nfs/exports/${id}`),
  enableNFSExport: (id) => request("POST", `/nfs/exports/${id}/enable`),
  disableNFSExport: (id) => request("POST", `/nfs/exports/${id}/disable`),
  getNFSExportsStatus: () => request("GET", "/nfs/exports-status"),
  getSystemExports: () => request("GET", "/nfs/exports-system"),
  applyNFSExports: () => request("POST", "/nfs/exports-apply"),

  // Firewall
  getFirewallStatus: () => request("GET", "/firewall/status"),
  applyExportFirewall: () => request("POST", "/firewall/apply/exports"),
  applyClientFirewall: () => request("POST", "/firewall/apply/clients"),
  applyAllFirewall: () => request("POST", "/firewall/apply/all"),
  removeExportFirewall: () => request("POST", "/firewall/remove/exports"),
  removeClientFirewall: () => request("POST", "/firewall/remove/clients"),
  removeAllFirewall: () => request("POST", "/firewall/remove/all"),
  toggleVPNOnly: (enabled) =>
    request("POST", "/firewall/vpn-only", { enabled }),

  // MergerFS
  getMergerFSConfigs: () => request("GET", "/mergerfs/configs"),
  createMergerFS: (data) => request("POST", "/mergerfs/configs", data),
  updateMergerFS: (id, data) => request("PUT", `/mergerfs/configs/${id}`, data),
  deleteMergerFS: (id) => request("DELETE", `/mergerfs/configs/${id}`),
  mountMergerFS: (id) => request("POST", `/mergerfs/configs/${id}/mount`),
  unmountMergerFS: (id) => request("POST", `/mergerfs/configs/${id}/unmount`),
  getMergerFSStatus: () => request("GET", "/mergerfs/status"),
  mountAllMergerFS: () => request("POST", "/mergerfs/mount-all"),
  unmountAllMergerFS: () => request("POST", "/mergerfs/unmount-all"),

  // VPN
  getVPNConfigs: () => request("GET", "/vpn/configs"),
  createVPNConfig: (data) => request("POST", "/vpn/configs", data),
  updateVPNConfig: (id, data) => request("PUT", `/vpn/configs/${id}`, data),
  deleteVPNConfig: (id) => request("DELETE", `/vpn/configs/${id}`),
  connectVPN: (id) => request("POST", `/vpn/configs/${id}/connect`),
  disconnectVPN: (id) => request("POST", `/vpn/configs/${id}/disconnect`),
  getVPNConfigStatus: (id) => request("GET", `/vpn/configs/${id}/status`),
  getAllVPNStatus: () => request("GET", "/vpn/status"),

  // System
  getHealth: () => request("GET", "/system/health"),
  getSystemStatus: () => request("GET", "/system/status"),
  getSystemStats: () => request("GET", "/system/stats"),
  getVPNStatus: () => request("GET", "/system/vpn"),
  getKernelParams: () => request("GET", "/system/kernel-params"),
  applyKernelTuning: (params) =>
    request("POST", "/system/kernel-tuning", { params }),
  getRpsXps: () => request("GET", "/system/rps-xps"),
  applyRpsXps: (settings) => request("POST", "/system/rps-xps", settings),
  getLogs: (lines = 100, level = null) => {
    let url = `/system/logs?lines=${lines}`;
    if (level) url += `&level=${level}`;
    return request("GET", url);
  },
  getDockerInfo: () => request("GET", "/system/docker-info"),
  getNfsThreads: () => request("GET", "/system/nfs-threads"),
  setNfsThreads: (threads) =>
    request("POST", "/system/nfs-threads", { threads }),
  getDiagnostics: () => request("GET", "/system/diagnostics"),
  getHealthCheck: () => request("GET", "/system/health-check"),
  runBenchmark: (mount_path, file_size_mb = 256) =>
    request("POST", "/system/benchmark", { mount_path, file_size_mb }),

  // Notifications
  getNotificationConfigs: () => request("GET", "/notifications/configs"),
  createNotification: (data) => request("POST", "/notifications/configs", data),
  updateNotification: (id, data) =>
    request("PUT", `/notifications/configs/${id}`, data),
  deleteNotification: (id) => request("DELETE", `/notifications/configs/${id}`),
  testNotification: (type, message) =>
    request("POST", "/notifications/test", { type, message }),

  // API Keys
  getApiKeys: () => request("GET", "/api-keys/"),
  createApiKey: (name) => request("POST", "/api-keys/", { name }),
  toggleApiKey: (id) => request("PATCH", `/api-keys/${id}/toggle`),
  deleteApiKey: (id) => request("DELETE", `/api-keys/${id}`),

  // Server Monitor
  getMonitorServers: () => request("GET", "/monitor/servers"),
  createMonitorServer: (data) => request("POST", "/monitor/servers", data),
  updateMonitorServer: (id, data) =>
    request("PUT", `/monitor/servers/${id}`, data),
  deleteMonitorServer: (id) => request("DELETE", `/monitor/servers/${id}`),
  getMonitorMetrics: () => request("GET", "/monitor/metrics"),
  getServerMetrics: (id) => request("GET", `/monitor/servers/${id}/metrics`),
  testMonitorServer: (id) => request("POST", `/monitor/servers/${id}/test`),

  // SSH Keys
  getSSHKeys: () => request("GET", "/monitor/ssh-keys"),
  uploadSSHKey: async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_BASE}/monitor/ssh-keys`, {
      method: "POST",
      headers: (() => {
        const h = {};
        const token = localStorage.getItem("token");
        if (token) h["Authorization"] = `Bearer ${token}`;
        const apiKey = localStorage.getItem("apiKey");
        if (apiKey) h["X-API-Key"] = apiKey;
        return h;
      })(),
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || "Upload failed");
    }
    return res.json();
  },
  downloadSSHKey: (name) =>
    `${API_BASE}/monitor/ssh-keys/${encodeURIComponent(name)}`,
  deleteSSHKey: (name) =>
    request("DELETE", `/monitor/ssh-keys/${encodeURIComponent(name)}`),
};

export default api;
