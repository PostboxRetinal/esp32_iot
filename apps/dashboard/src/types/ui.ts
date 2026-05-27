import type { Alert, Device, HealthStatus, Reading, StateDistribution, Summary, TimeseriesPoint } from "./domain";

export type DashboardData = {
  health: HealthStatus | null;
  devices: Device[];
  readings: Reading[];
  alerts: Alert[];
  summary: Summary | null;
  states: StateDistribution[];
  timeseries: TimeseriesPoint[];
};

export type StateChartDatum = {
  label: string;
  value: number;
  color: string;
};

export type AlertToastLike = Pick<Alert, "device_id" | "device_timestamp" | "severity" | "estado" | "message" | "co_ppm" | "raw_co_adc" | "presencia" | "urgente">;

export type AlertToastTheme = {
  background: string;
  border: string;
  accent: string;
  color: string;
};

export type StateChartTooltipProps = {
  active?: boolean;
  payload?: Array<{ payload?: StateChartDatum }>;
  total: number;
};
