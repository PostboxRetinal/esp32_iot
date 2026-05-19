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
import { Bell } from "lucide-react";
import { Toaster, toast } from "sonner";

import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-700.css";
import "@fontsource/space-grotesk/latin-400.css";
import "@fontsource/space-grotesk/latin-700.css";

import { api, type Alert, type Device, type Reading, type StateDistribution, type Summary, type TimeseriesPoint } from "./api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import "./styles.css";

type DashboardData = {
  health: { ok: boolean; db: string; mqtt: string; timestamp: string } | null;
  devices: Device[];
  readings: Reading[];
  alerts: Alert[];
  summary: Summary | null;
  states: StateDistribution[];
  timeseries: TimeseriesPoint[];
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
    background: "#000000",
    border: "1px solid #262626",
    color: "#fafafa"
  },
  CRITICO_URGENTE: {
    background: "#000000",
    border: "1px solid #262626",
    color: "#fafafa"
  }
};

function getAlertToastTheme(alertType: string): AlertToastTheme {
  return alertToastThemes[alertType] || {
    background: "#000000",
    border: "1px solid #262626",
    color: "#fafafa"
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
  const [ackBusyId, setAckBusyId] = useState<number | null>(null);
  const [readAlertIds, setReadAlertIds] = useState<Set<number>>(new Set());
  const [stateChartActiveIndex, setStateChartActiveIndex] = useState<number | null>(null);
  const [compactLayout, setCompactLayout] = useState(() => window.innerWidth < 640);
  const seenAlertSignatures = useRef(new Set<string>());
  const hydratedAlerts = useRef(false);

  useEffect(() => {
    const updateCompactLayout = () => setCompactLayout(window.innerWidth < 640);

    window.addEventListener("resize", updateCompactLayout);
    updateCompactLayout();

    return () => window.removeEventListener("resize", updateCompactLayout);
  }, []);

  function handleAlert(alert: AlertToastLike) {
    const signature = alertSignature(alert);
    if (seenAlertSignatures.current.has(signature)) {
      return;
    }

    seenAlertSignatures.current.add(signature);
    notifyAlert(alert);
    console.info(`[dashboard] alert toast ${alert.device_id} ${alert.severity} ${alert.co_ppm}ppm`);
  }

  async function load() {
    try {
      const [health, devices, readings, alerts, summary, states, timeseries] = await Promise.all([
        api.health(),
        api.devices(),
        api.latestReadings(40),
        api.recentAlerts(24, 20),
        api.summary(24),
        api.stateDistribution(24),
        api.timeseries(24),
      ]);

      setData({
        health,
        devices: devices.data,
        readings: readings.data,
        alerts: alerts.data,
        summary,
        states: states.data,
        timeseries: timeseries.data,
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
  const pendingAlerts = data.alerts.filter((alert) => alert.ack_status === "PENDING" && !readAlertIds.has(alert.id));
  const pendingAlertsLabel = pendingAlerts.length === 1 ? "1 pendiente" : `${pendingAlerts.length} pendientes`;
  const lineChartHeight = compactLayout ? 220 : 260;
  const donutChartHeight = compactLayout ? 220 : 250;
  const donutInnerRadius = compactLayout ? 60 : 70;
  const donutOuterRadius = compactLayout ? 90 : 100;

  function markAllAsRead() {
    const ids = new Set(readAlertIds);
    for (const alert of pendingAlerts) {
      ids.add(alert.id);
    }
    setReadAlertIds(ids);
  }

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
        <Card className="status-card">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={`${pendingAlerts.length} alertas pendientes`}
                className={`relative h-10 w-10 rounded-xl border-[var(--border)] bg-[#000000] text-[var(--foreground)] hover:bg-[var(--accent)]${pendingAlerts.length > 0 ? " border-amber-500" : ""}`}
                size="icon"
                title="Alertas pendientes"
                variant="outline"
              >
                <Bell className="h-4 w-4" />
                {pendingAlerts.length > 0 && (
                  <Badge className="absolute -right-2 -top-2 h-5 min-w-5 border border-[#000000] bg-[#f59e0b] px-1 text-[0.65rem] text-[#000000]">
                    {pendingAlerts.length}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] border-[var(--border)] bg-[var(--popover)] p-3 text-[var(--popover-foreground)] shadow-none sm:w-96 sm:max-w-96">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <DropdownMenuLabel className="p-0 text-sm font-semibold">Alertas pendientes</DropdownMenuLabel>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">{pendingAlertsLabel}</p>
                </div>
                {pendingAlerts.length > 0 && (
                  <Button
                    className="h-8 px-2 text-xs text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[#d4d4d8]"
                    onClick={markAllAsRead}
                    size="sm"
                    variant="ghost"
                  >
                    Marcar todas como leído
                  </Button>
                )}
              </div>
              <DropdownMenuSeparator className="my-3 bg-[var(--border)]" />
              {pendingAlerts.length > 0 ? (
                <ScrollArea className="h-72 pr-2 sm:h-80">
                  <div className="space-y-2">
                    {pendingAlerts.map((alert) => (
                      <div className="flex items-start justify-between gap-3 rounded-lg border border-[var(--muted)] bg-[#000000] p-3" key={alert.id}>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[var(--foreground)]">{alert.alert_type}</p>
                          <p className="mt-1 text-xs text-[var(--muted-foreground)]">{alert.device_id} · {alert.co_ppm} ppm</p>
                          <p className="text-xs text-[var(--muted-foreground)]">{alert.message}</p>
                          <p className="mt-2 font-mono text-[0.7rem] text-[#525252]">{new Date(alert.alert_ts).toLocaleString()}</p>
                        </div>
                        <Button
                          className="h-8 shrink-0 border-[var(--border)] bg-transparent px-3 text-[var(--foreground)] hover:bg-[var(--accent)]"
                          disabled={ackBusyId === alert.id}
                          onClick={() => void ackAlert(alert)}
                          size="sm"
                          variant="outline"
                        >
                          {ackBusyId === alert.id ? "..." : "OK"}
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="py-6 text-center text-sm text-[#525252]">Sin alertas pendientes</div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <span className={data.health?.ok ? "status-dot ok" : "status-dot bad"} />
          <div>
            <strong>{data.health?.ok ? "Estado: Operativo" : "Alerta de Sistema"}</strong>
            <small>API: {api.baseUrl}</small>
          </div>
        </Card>
      </header>

      {error && <section className="banner">{error}</section>}
      {loading && <section className="banner muted">Cargando datos...</section>}

      <section className="metrics">
        <Card className="metric primary">
          <span>CO actual</span>
          <strong>{fmt(latest?.co_ppm, " ppm")}</strong>
          <small>{latest?.device_id || "sin lecturas"}</small>
        </Card>
        <Card className="metric">
          <span>Promedio 24h</span>
          <strong>{fmt(summary?.readings.avg_co_ppm, " ppm")}</strong>
          <small>max {fmt(summary?.readings.max_co_ppm, " ppm")}</small>
        </Card>
        <Card className="metric">
          <span>Nodos activos</span>
          <strong>{summary?.devices.active ?? 0}/{summary?.devices.total ?? 0}</strong>
          <small>real + simulado</small>
        </Card>
        <Card className="metric danger">
          <span>Alertas 24h</span>
          <strong>{summary?.alerts.total ?? 0}</strong>
          <small>{summary?.alerts.pending ?? 0} pendientes</small>
        </Card>
      </section>

      <section className="grid two">
        <Card className="panel chart-panel">
          <div className="panel-head">
            <h2>CO por minuto</h2>
            <span>últimas 24h</span>
          </div>
          <ResponsiveContainer width="100%" height={lineChartHeight}>
            <LineChart data={series}>
              <CartesianGrid stroke="#243041" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" stroke="#94a3b8" minTickGap={28} tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "#111827", border: "1px solid #243041", borderRadius: 12 }} />
              <Line type="monotone" dataKey="avg_co_ppm" name="CO promedio" stroke="#38bdf8" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="max_co_ppm" name="CO max" stroke="#fb7185" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card className="panel chart-panel">
          <div className="panel-head">
            <h2>Distribución de estados</h2>
            <span>clasificación server-side</span>
          </div>
          {stateChartData.length > 0 ? (
            <div className="state-chart-shell">
              <div className="state-chart-main">
                <ResponsiveContainer width="100%" height={donutChartHeight}>
                  <PieChart margin={compactLayout ? { top: 0, right: 8, bottom: 0, left: 8 } : { top: 8, right: 8, bottom: 8, left: 8 }}>
                    <Tooltip content={<StateChartTooltip total={stateChartTotal} />} cursor={false} />
                    <Pie
                      data={stateChartData}
                      dataKey="value"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      cornerRadius={compactLayout ? 10 : 12}
                      innerRadius={donutInnerRadius}
                      outerRadius={donutOuterRadius}
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
        </Card>
      </section>

      <section className="grid two">
        <Card className="panel">
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
        </Card>

        <Card className="panel controls">
          <div className="panel-head">
            <h2>Ventilación</h2>
            <span>MQTT</span>
          </div>
          <p>Publica comandos manuales y deja auditoría en MariaDB.</p>
          <div className="button-pair">
            <Button disabled={commandBusy} onClick={() => void sendVentilation("ENCENDER")}>{ventilationOnLabel}</Button>
            <Button disabled={commandBusy} onClick={() => void sendVentilation("APAGAR")} variant="secondary">{ventilationOffLabel}</Button>
          </div>
        </Card>
      </section>
      <Toaster
        closeButton
        position="top-right"
        theme="dark"
        toastOptions={{
          style: {
            background: "#000000",
            border: "1px solid #262626",
            color: "#fafafa"
          }
        }}
      />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
