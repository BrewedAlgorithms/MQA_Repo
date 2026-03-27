const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8001';

async function request(method, path, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== null) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ── Stations ──────────────────────────────────────────────────────────────────

export const stationsApi = {
  list: () => request('GET', '/api/stations'),
  create: (name) => request('POST', '/api/stations', { name }),
  update: (id, payload) => request('PUT', `/api/stations/${id}`, payload),
  delete: (id) => request('DELETE', `/api/stations/${id}`),
};

// ── SOPs ──────────────────────────────────────────────────────────────────────

export const sopApi = {
  upload: async (station_id, file) => {
    const form = new FormData();
    form.append('station_id', station_id);
    form.append('file', file);
    const res = await fetch(`${BASE_URL}/api/sop/upload`, { method: 'POST', body: form });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return res.json();
  },

  process: (station_id, sop_text, filename) =>
    request('POST', '/api/sop/process', { station_id, sop_text, filename }),

  listForStation: (station_id) =>
    request('GET', `/api/stations/${station_id}/sops`),

  get: (sop_id) => request('GET', `/api/sops/${sop_id}`),

  addStep: (sop_id, title, description, safety = []) =>
    request('POST', `/api/sops/${sop_id}/steps`, { title, description, safety }),

  updateStep: (sop_id, step_id, title, description, safety) =>
    request('PUT', `/api/sops/${sop_id}/steps/${step_id}`, { title, description, safety }),

  deleteStep: (sop_id, step_id) =>
    request('DELETE', `/api/sops/${sop_id}/steps/${step_id}`),
};
