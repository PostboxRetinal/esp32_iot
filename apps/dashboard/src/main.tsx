import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Cell,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Toaster, toast } from "sonner";

import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-700.css";
import "@fontsource/space-grotesk/latin-400.css";
import "@fontsource/space-grotesk/latin-700.css";

import { api, type Alert, type Command, type Device, type Reading, type StateDistribution, type Summary, type TimeseriesPoint } from "./api";
import "./styles.css";

type DashboardData = {
  health: { ok: boolean; db: string; mqtt: string; timestamp: string } | null;
  devices: Device[];
  readings: Reading[];
  alerts: Alert[];
  summary: Summary | null;
  states: StateDistribution[];
  timeseries: TimeseriesPoint[];
  commands: Command[];
};

type StateChartDatum = {
  label: string;
  value: number;
  color: string;
};

const initialData: DashboardData = {
  health: null,
  devices: [],
  readings: [],
  alerts: [],
  summary: null,
  states: [],
  timeseries: [],
  commands: []
};

const statePalette: Record<string, string> = {
  SEGURO: "#34d399",
  PRECAUCION: "#fbbf24",
  PELIGRO: "#fb923c",
  CRITICO: "#fb7185"
};

function fmt(value: number | null | undefined, suffix = "") {
  if (value == null || Number.isNaN(value)) {
    return "--";
  }

  return `${value}${suffix}`;
}

function getStateColor(state: string) {
  if (state.includes("URGENTE")) {
    return "#ec4899";
  }

  return statePalette[state] || "#94a3b8";
}

type AlertToastLike = Pick<Alert, "device_id" | "device_timestamp" | "severity" | "alert_type" | "message" | "co_ppm" | "presencia" | "urgente">;

type AlertToastTheme = {
  background: string;
  border: string;
  color: string;
};

const alertToastThemes: Record<string, AlertToastTheme> = {
  CO_CRITICO: {
    background: "linear-gradient(135deg, rgba(17, 24, 39, 0.98), rgba(15, 23, 42, 0.96))",
    border: "1px solid rgba(251, 191, 36, 0.24)",
    color: "#f8fafc"
  },
  CRITICO_URGENTE: {
    background: "linear-gradient(135deg, rgba(17, 24, 39, 0.98), rgba(15, 23, 42, 0.96))",
    border: "1px solid rgba(244, 114, 182, 0.24)",
    color: "#f8fafc"
  }
};

function getAlertToastTheme(alertType: string): AlertToastTheme {
  return alertToastThemes[alertType] || {
    background: "linear-gradient(135deg, rgba(17, 24, 39, 0.98), rgba(15, 23, 42, 0.96))",
    border: "1px solid rgba(96, 165, 250, 0.22)",
    color: "#f8fafc"
  };
}

function alertSignature(alert: AlertToastLike) {
  return [alert.device_id, alert.device_timestamp, alert.severity, alert.alert_type, alert.message, alert.co_ppm, alert.presencia, alert.urgente].join("|");
}

function notifyAlert(alert: AlertToastLike) {
  const title = `${alert.device_id} · ${alert.alert_type}`;
  const description = `${alert.message} · ${fmt(alert.co_ppm, " ppm")}`;
  const theme = getAlertToastTheme(alert.alert_type);
  const toastStyle = {
    background: theme.background,
    border: theme.border,
    color: theme.color
  };
  const toastClassNames = {
    toast: "alert-toast",
    title: "alert-toast-title",
    description: "alert-toast-description"
  };

  if (alert.severity === "CRITICAL" || alert.severity === "HIGH") {
    toast.error(title, { description, style: toastStyle, classNames: toastClassNames });
    return;
  }

  toast.info(title, { description, style: toastStyle, classNames: toastClassNames });
}

type StateChartTooltipProps = {
  active?: boolean;
  payload?: Array<{ payload?: StateChartDatum }>;
  total: number;
};

function StateChartTooltip({ active, payload, total }: StateChartTooltipProps) {
  if (!active || !payload?.length) {
    return null;
  }

  const entry = payload[0].payload;
  if (!entry) {
    return null;
  }

  const percent = total > 0 ? Math.round((entry.value / total) * 100) : 0;

  return (
    <div className="chart-tooltip">
      <span className="chart-tooltip-swatch" style={{ background: entry.color }} />
      <div>
        <strong>{entry.label}</strong>
        <small>{entry.value} registros · {percent}%</small>
      </div>
    </div>
  );
}

function App() {
  const [data, setData] = useState<DashboardData>(initialData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commandBusy, setCommandBusy] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [ackBusyId, setAckBusyId] = useState<number | null>(null);
  const [stateChartActiveIndex, setStateChartActiveIndex] = useState<number | null>(null);
  const seenAlertSignatures = useRef(new Set<string>());
  const hydratedAlerts = useRef(false);
  const alertsMenuRef = useRef<HTMLDivElement | null>(null);

  function handleAlert(alert: AlertToastLike) {
    const signature = alertSignature(alert);
    if (seenAlertSignatures.current.has(signature)) {
      return;
    }

    seenAlertSignatures.current.add(signature);
    notifyAlert(alert);
    console.info(`[dashboard] alert toast ${alert.device_id} ${alert.severity} ${alert.co_ppm}ppm`);
  }

  useEffect(() => {
    if (!alertsOpen) {
      return;
    }

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (alertsMenuRef.current && !alertsMenuRef.current.contains(target)) {
        setAlertsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAlertsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleDocumentClick);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [alertsOpen]);

  async function load() {
    try {
      const [health, devices, readings, alerts, summary, states, timeseries, commands] = await Promise.all([
        api.health(),
        api.devices(),
        api.latestReadings(40),
        api.recentAlerts(24, 20),
        api.summary(24),
        api.stateDistribution(24),
        api.timeseries(24),
        api.recentCommands()
      ]);

      setData({
        health,
        devices: devices.data,
        readings: readings.data,
        alerts: alerts.data,
        summary,
        states: states.data,
        timeseries: timeseries.data,
        commands: commands.data
      });

      if (!hydratedAlerts.current) {
        for (const alert of alerts.data) {
          seenAlertSignatures.current.add(alertSignature(alert));
        }

        hydratedAlerts.current = true;
      } else {
        for (const alert of alerts.data) {
          handleAlert(alert);
        }
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 10000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const source = api.openAlertStream((alert) => {
      handleAlert(alert);
      void load();
    });

    return () => source.close();
  }, []);

  async function sendVentilation(action: "ENCENDER" | "APAGAR") {
    setCommandBusy(true);
    try {
      await api.ventilation(action);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCommandBusy(false);
    }
  }

  async function ackAlert(alert: Alert) {
    setAckBusyId(alert.id);
    try {
      await api.ackAlert(alert.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAckBusyId(null);
    }
  }

  const latest = data.readings[0];
  const summary = data.summary;
  const series = [...data.timeseries].slice(-80).map((point) => ({
    ...point,
    label: new Date(point.bucket).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }));
  const stateChartData = data.states.map((entry) => ({
    label: entry.estado,
    value: entry.total,
    color: getStateColor(entry.estado)
  })).filter((entry) => entry.value > 0).sort((left, right) => right.value - left.value);
  const stateChartTotal = stateChartData.reduce((sum, entry) => sum + entry.value, 0);
  const dominantState = stateChartData[0] ?? null;
  const ventilationOnLabel = commandBusy ? "Enviando..." : "Encender";
  const ventilationOffLabel = commandBusy ? "Enviando..." : "Apagar";
  const pendingAlerts = data.alerts.filter((alert) => alert.ack_status === "PENDING");
  const pendingAlertsLabel = pendingAlerts.length === 1 ? "1 pendiente" : `${pendingAlerts.length} pendientes`;

  function formatLastSeen(value: string) {
    const date = new Date(value);
    const diffMs = Date.now() - date.getTime();
    const diffSec = Math.max(0, Math.floor(diffMs / 1000));

    if (diffSec < 60) {
      return `${diffSec}s`;
    }

    const diffMin = Math.floor(diffSec / 60);
    return `${diffMin}m`;
  }

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Fundamentos de IoT · Parcial 3</p>
          <h1>Garage CO Observatory</h1>
          <p className="subtitle">Dashboard React consumiendo la API Elysia sobre MariaDB, con Node-RED como plataforma IoT.</p>
        </div>
        <div className="status-card">
          <div className="alerts-menu" ref={alertsMenuRef}>
            <button
              aria-expanded={alertsOpen}
              aria-haspopup="menu"
              aria-label={`${pendingAlerts.length} alertas pendientes`}
              className={`alerts-toggle${pendingAlerts.length > 0 ? " has-pending" : ""}`}
              onClick={() => setAlertsOpen((value) => !value)}
              title="Alertas pendientes"
              type="button"
            >
              <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
                <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6.5V11a7 7 0 1 0-14 0v4.5L3.5 17v1h17v-1L19 15.5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
              </svg>
              {pendingAlerts.length > 0 && <span className="alerts-badge">{pendingAlerts.length}</span>}
            </button>

            {alertsOpen && (
              <div className="alerts-dropdown" role="menu">
                <div className="alerts-dropdown-head">
                  <strong>Alertas pendientes</strong>
                  <small>{pendingAlertsLabel}</small>
                </div>
                {pendingAlerts.length > 0 ? (
                  <div className="alerts-dropdown-list">
                    {pendingAlerts.map((alert) => (
                      <div className="alerts-dropdown-item" key={alert.id}>
                        <div>
                          <strong>{alert.alert_type}</strong>
                          <small>{alert.device_id} · {alert.co_ppm} ppm</small>
                          <small>{alert.message}</small>
                        </div>
                        <button className="ok" disabled={ackBusyId === alert.id} onClick={() => void ackAlert(alert)} type="button">
                          {ackBusyId === alert.id ? "..." : "OK"}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="alerts-empty">Sin alertas pendientes</div>
                )}
              </div>
            )}
          </div>
          <span className={data.health?.ok ? "status-dot ok" : "status-dot bad"} />
          <div>
            <strong>{data.health?.ok ? "Sistema operativo" : "API/DB con alerta"}</strong>
            <small>API: {api.baseUrl}</small>
          </div>
        </div>
      </header>

      {error && <section className="banner">{error}</section>}
      {loading && <section className="banner muted">Cargando datos...</section>}

      <section className="metrics">
        <article className="metric primary">
          <span>CO actual</span>
          <strong>{fmt(latest?.co_ppm, " ppm")}</strong>
          <small>{latest?.device_id || "sin lecturas"}</small>
        </article>
        <article className="metric">
          <span>Promedio 24h</span>
          <strong>{fmt(summary?.readings.avg_co_ppm, " ppm")}</strong>
          <small>max {fmt(summary?.readings.max_co_ppm, " ppm")}</small>
        </article>
        <article className="metric">
          <span>Nodos activos</span>
          <strong>{summary?.devices.active ?? 0}/{summary?.devices.total ?? 0}</strong>
          <small>real + simulado</small>
        </article>
        <article className="metric danger">
          <span>Alertas 24h</span>
          <strong>{summary?.alerts.total ?? 0}</strong>
          <small>{summary?.alerts.pending ?? 0} pendientes</small>
        </article>
      </section>

      <section className="grid two">
        <article className="panel chart-panel">
          <div className="panel-head">
            <h2>CO por minuto</h2>
            <span>últimas 24h</span>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={series}>
              <CartesianGrid stroke="#243041" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" stroke="#94a3b8" minTickGap={28} tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "#111827", border: "1px solid #243041", borderRadius: 12 }} />
              <Line type="monotone" dataKey="avg_co_ppm" name="CO promedio" stroke="#38bdf8" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="max_co_ppm" name="CO max" stroke="#fb7185" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </article>

        <article className="panel chart-panel">
          <div className="panel-head">
            <h2>Distribución de estados</h2>
            <span>clasificación server-side</span>
          </div>
          {stateChartData.length > 0 ? (
            <div className="state-chart-shell">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <Tooltip content={<StateChartTooltip total={stateChartTotal} />} cursor={false} />
                  <Pie
                    data={stateChartData}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="44%"
                    cornerRadius={12}
                    innerRadius={74}
                    outerRadius={108}
                    paddingAngle={4}
                    stroke="#0b0f14"
                    strokeWidth={2}
                    onMouseEnter={(_, index) => setStateChartActiveIndex(index)}
                    onMouseLeave={() => setStateChartActiveIndex(null)}
                  >
                    {stateChartData.map((entry, index) => (
                      <Cell
                        key={entry.label}
                        fill={entry.color}
                        opacity={stateChartActiveIndex == null || stateChartActiveIndex === index ? 1 : 0.28}
                        stroke={stateChartActiveIndex === index ? "rgba(248, 250, 252, 0.7)" : "#0b0f14"}
                        strokeWidth={stateChartActiveIndex === index ? 2.5 : 2}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>

              <div className="state-chart-center">
                <span>Total</span>
                <strong>{stateChartTotal}</strong>
                <small>
                  {dominantState
                    ? `${dominantState.label} · ${Math.round((dominantState.value / stateChartTotal) * 100)}%`
                    : "Sin datos"}
                </small>
              </div>

              <div className="state-chart-legend">
                {stateChartData.map((entry) => {
                  const percent = stateChartTotal > 0 ? Math.round((entry.value / stateChartTotal) * 100) : 0;

                  return (
                    <div className="state-chart-legend-item" key={entry.label}>
                      <span className="state-chart-legend-swatch" style={{ background: entry.color }} />
                      <div>
                        <strong>{entry.label}</strong>
                        <small>{entry.value} · {percent}%</small>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="empty-state">Sin datos aún</div>
          )}
        </article>
      </section>

      <section className="grid two">
        <article className="panel">
          <div className="panel-head">
            <h2>Nodos</h2>
            <a href="http://localhost:1880" target="_blank" rel="noreferrer">Node-RED</a>
          </div>
          <div className="list">
            {data.devices.map((device) => (
              <div className={`row node ${device.connection_state}`} key={device.device_id}>
                <div>
                  <strong>{device.device_id}</strong>
                  <small>{device.node_type} · {device.latest_estado || "sin estado"}</small>
                  <small className="status-line">
                    <span className={`node-state-text ${device.connection_state}`}>
                      <span className={`node-state-dot ${device.connection_state}`} />
                      {device.connection_state === "online" ? "Online" : "Offline"}
                    </span>
                    · last seen {formatLastSeen(device.last_seen_at)}
                  </small>
                </div>
                <span>{fmt(device.latest_co_ppm, " ppm")}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel controls">
          <div className="panel-head">
            <h2>Ventilación</h2>
            <span>MQTT</span>
          </div>
          <p>Publica comandos manuales y deja auditoría en MariaDB.</p>
          <div className="button-pair">
            <button disabled={commandBusy} onClick={() => void sendVentilation("ENCENDER")}>{ventilationOnLabel}</button>
            <button disabled={commandBusy} className="secondary" onClick={() => void sendVentilation("APAGAR")}>{ventilationOffLabel}</button>
          </div>
          <div className="list compact">
            {data.commands.map((command) => (
              <div className="row" key={command.id}>
                <div>
                  <strong>{command.action}</strong>
                  <small>{command.status} · {command.device_id}</small>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
      <Toaster
        closeButton
        position="top-right"
        theme="dark"
        toastOptions={{
          style: {
            background: "linear-gradient(135deg, rgba(17, 24, 39, 0.98), rgba(15, 23, 42, 0.96))",
            border: "1px solid rgba(148, 163, 184, 0.14)",
            boxShadow: "0 24px 56px rgba(2, 6, 23, 0.38)",
            color: "#e5e7eb"
          }
        }}
      />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
