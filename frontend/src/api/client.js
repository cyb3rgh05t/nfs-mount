const API_BASE = '/api';

function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const apiKey = localStorage.getItem('apiKey');
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }
  return headers;
}

async function request(method, path, body) {
  const opts = {
    method,
    headers: getHeaders(),
  };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }
  return res.json();
}

const api = {
  // NFS
  getNFSMounts: () => request('GET', '/nfs/mounts'),
  createNFSMount: (data) => request('POST', '/nfs/mounts', data),
  updateNFSMount: (id, data) => request('PUT', `/nfs/mounts/${id}`, data),
  deleteNFSMount: (id) => request('DELETE', `/nfs/mounts/${id}`),
  mountNFS: (id) => request('POST', `/nfs/mounts/${id}/mount`),
  unmountNFS: (id) => request('POST', `/nfs/mounts/${id}/unmount`),
  getNFSStatus: () => request('GET', '/nfs/status'),
  mountAllNFS: () => request('POST', '/nfs/mount-all'),
  unmountAllNFS: () => request('POST', '/nfs/unmount-all'),

  // MergerFS
  getMergerFSConfigs: () => request('GET', '/mergerfs/configs'),
  createMergerFS: (data) => request('POST', '/mergerfs/configs', data),
  updateMergerFS: (id, data) => request('PUT', `/mergerfs/configs/${id}`, data),
  deleteMergerFS: (id) => request('DELETE', `/mergerfs/configs/${id}`),
  mountMergerFS: (id) => request('POST', `/mergerfs/configs/${id}/mount`),
  unmountMergerFS: (id) => request('POST', `/mergerfs/configs/${id}/unmount`),
  getMergerFSStatus: () => request('GET', '/mergerfs/status'),

  // System
  getHealth: () => request('GET', '/system/health'),
  getSystemStatus: () => request('GET', '/system/status'),
  getSystemStats: () => request('GET', '/system/stats'),
  getVPNStatus: () => request('GET', '/system/vpn'),
  getKernelParams: () => request('GET', '/system/kernel-params'),
  applyKernelTuning: (params) => request('POST', '/system/kernel-tuning', { params }),
  getLogs: (lines = 100) => request('GET', `/system/logs?lines=${lines}`),

  // Notifications
  getNotificationConfigs: () => request('GET', '/notifications/configs'),
  createNotification: (data) => request('POST', '/notifications/configs', data),
  updateNotification: (id, data) => request('PUT', `/notifications/configs/${id}`, data),
  deleteNotification: (id) => request('DELETE', `/notifications/configs/${id}`),
  testNotification: (type, message) => request('POST', '/notifications/test', { type, message }),
};

export default api;
