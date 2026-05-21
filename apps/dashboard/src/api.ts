const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:1880";

export type Device = {
  device_id: string;
  node_type: "hardware" | "simulated";
  description: string | null;
  last_seen_at: string;
  connection_state: "online" | "offline";
  latest_co_ppm: number | null;
  latest_raw_co_adc: number | null;
  latest_estado: string | null;
  latest_reading_at: string | null;
};

export type Reading = {
  id: number;
  device_id: string;
  co_ppm: number;
  raw_co_adc: number | null;
  presencia: 0 | 1;
  ingested_at: string;
};

export type Alert = {
  id: number;
  device_id: string;
  device_timestamp: string;
  alert_ts: string;
  severity: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  estado: string;
  message: string;
  co_ppm: number;
  raw_co_adc: number | null;
  presencia: 0 | 1;
  urgente: 0 | 1;
  ack_status: "PENDING" | "ACKED" | "CLOSED";
};

export type Summary = {
  hours: number;
  devices: { total: number; active: number };
  readings: { total: number; avg_co_ppm: number; max_co_ppm: number; min_co_ppm: number };
  alerts: { total: number; critical: number; pending: number };
  states: { urgent_events: number };
};

export type StateDistribution = {
  estado: string;
  total: number;
};

export type TimeseriesPoint = {
  bucket: string;
  device_id: string;
  avg_co_ppm: number;
  max_co_ppm: number;
  avg_raw_co_adc: number | null;
  presencia_count: number;
  samples: number;
};

export type Command = {
  id: number;
  device_id: string;
  command_ts: string;
  actuator: string;
  action: string;
  reason: string | null;
  source_state: string | null;
  status: "PUBLISHED" | "SKIPPED" | "ERROR";
};

async function request<T>(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function withQuery(path: string, params: Record<string, string | number | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") {
      continue;
    }

    searchParams.set(key, String(value));
  }

  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

export const api = {
  baseUrl: API_BASE_URL,
  health: () => request<{ ok: boolean; db: string; mqtt: string; command_topic?: string; timestamp: string }>("/api/health"),
  devices: () => request<{ data: Device[] }>("/api/devices"),
  latestReadings: (limit = 30, deviceId?: string) => request<{ data: Reading[] }>(withQuery("/api/readings/latest", { limit, device_id: deviceId })),
  recentAlerts: (hours = 24, limit = 20, deviceId?: string) => request<{ data: Alert[] }>(withQuery("/api/alerts/recent", { hours, limit, device_id: deviceId })),
  summary: (hours = 24, deviceId?: string) => request<Summary>(withQuery("/api/analytics/summary", { hours, device_id: deviceId })),
  stateDistribution: (hours = 24, deviceId?: string) => request<{ data: StateDistribution[] }>(withQuery("/api/analytics/state-distribution", { hours, device_id: deviceId })),
  timeseries: (hours = 24, deviceId?: string) => request<{ data: TimeseriesPoint[] }>(withQuery("/api/analytics/timeseries", { hours, device_id: deviceId })),
  recentCommands: () => request<{ data: Command[] }>("/api/commands/recent?limit=10"),
  ackAlert: (id: number) => request(`/api/alerts/${id}/ack`, { method: "PUT" }),
  closeAlert: (id: number) => request(`/api/alerts/${id}`, { method: "DELETE" }),
  ventilation: (action: "ENCENDER" | "APAGAR") => request("/api/commands/ventilation", {
    method: "POST",
    body: JSON.stringify({ action, reason: "Comando manual desde dashboard React" })
  })
};
