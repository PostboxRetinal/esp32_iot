const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

export type Device = {
  device_id: string;
  node_type: "hardware" | "simulated";
  description: string | null;
  last_seen_at: string;
  connection_state: "online" | "offline";
  latest_co_ppm: number | null;
  latest_estado: string | null;
  latest_reading_at: string | null;
};

export type Reading = {
  id: number;
  device_id: string;
  co_ppm: number;
  presencia: 0 | 1;
  ingested_at: string;
};

export type Alert = {
  id: number;
  device_id: string;
  device_timestamp: string;
  alert_ts: string;
  severity: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  alert_type: string;
  message: string;
  co_ppm: number;
  presencia: 0 | 1;
  urgente: 0 | 1;
  ack_status: "PENDING" | "ACKED" | "CLOSED";
};

export type AlertStreamEvent = {
  id?: number;
  device_id: string;
  device_timestamp: string;
  alert_ts?: string;
  severity: Alert["severity"];
  alert_type: string;
  message: string;
  co_ppm: number;
  presencia: 0 | 1;
  urgente: 0 | 1;
  ack_status?: Alert["ack_status"];
  acked_at?: string | null;
  estado: string | null;
  topic?: string;
  source?: "mqtt" | "database";
  received_at: string;
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
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  baseUrl: API_BASE_URL,
  health: () => request<{ ok: boolean; db: string; mqtt: string; timestamp: string }>("/api/health"),
  devices: () => request<{ data: Device[] }>("/api/devices"),
  latestReadings: (limit = 30) => request<{ data: Reading[] }>(`/api/readings/latest?limit=${limit}`),
  recentAlerts: (hours = 24, limit = 20) => request<{ data: Alert[] }>(`/api/alerts/recent?hours=${hours}&limit=${limit}`),
  summary: (hours = 24) => request<Summary>(`/api/analytics/summary?hours=${hours}`),
  stateDistribution: (hours = 24) => request<{ data: StateDistribution[] }>(`/api/analytics/state-distribution?hours=${hours}`),
  timeseries: (hours = 24) => request<{ data: TimeseriesPoint[] }>(`/api/analytics/timeseries?hours=${hours}`),
  recentCommands: () => request<{ data: Command[] }>("/api/commands/recent?limit=10"),
  ackAlert: (id: number) => request(`/api/alerts/${id}/ack`, { method: "PUT" }),
  closeAlert: (id: number) => request(`/api/alerts/${id}`, { method: "DELETE" }),
  openAlertStream: (onAlert: (alert: AlertStreamEvent) => void) => {
    const source = new EventSource(`${API_BASE_URL}/api/alerts/stream`);

    source.addEventListener("open", () => {
      console.info("[api] alert stream connected");
    });

    source.addEventListener("alert", (event) => {
      try {
        onAlert(JSON.parse((event as MessageEvent<string>).data) as AlertStreamEvent);
      } catch (error) {
        console.error("[api] failed to parse alert stream payload", error);
      }
    });

    source.addEventListener("error", () => {
      console.warn("[api] alert stream disconnected, browser will retry");
    });

    return source;
  },
  ventilation: (action: "ENCENDER" | "APAGAR") => request("/api/commands/ventilation", {
    method: "POST",
    body: JSON.stringify({ action, reason: "Comando manual desde dashboard React" })
  })
};
