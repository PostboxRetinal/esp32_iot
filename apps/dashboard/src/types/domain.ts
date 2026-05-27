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
