import { Device, Reading, Alert, Summary, StateDistribution, TimeseriesPoint, Command } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:1880";
const API_BEARER_TOKEN = import.meta.env.VITE_API_BEARER_TOKEN || "";

async function request<T>(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (API_BEARER_TOKEN) {
    headers.set("Authorization", `Bearer ${API_BEARER_TOKEN}`);
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
