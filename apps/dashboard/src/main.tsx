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
import { Bell, ChevronDown, ExternalLink } from "lucide-react";
import { Toaster, toast } from "sonner";

import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-700.css";
import "@fontsource/space-grotesk/latin-400.css";
import "@fontsource/space-grotesk/latin-700.css";

import { api } from "./api";
import { Alert, AlertToastLike, AlertToastTheme, DashboardData, Device, Reading, StateChartDatum, StateChartTooltipProps, StateDistribution, Summary, TimeseriesPoint } from "./types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import "./styles.css";

const initialData: DashboardData = {
  health: null,
  devices: [],
  readings: [],
  alerts: [],
  summary: null,
  states: [],
  timeseries: [],
};

const selectedDeviceStorageKey = "fiot.dashboard.selectedDeviceId";
const allDevicesValue = "__all__";

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

const alertToastThemes: Record<Alert["severity"], AlertToastTheme> = {
  INFO: {
    background: "rgba(56, 189, 248, 0.08)",
    border: "rgba(56, 189, 248, 0.38)",
    accent: "#38bdf8",
    color: "#e0f2fe"
  },
  LOW: {
    background: "rgba(52, 211, 153, 0.08)",
    border: "rgba(52, 211, 153, 0.38)",
    accent: "#34d399",
    color: "#d1fae5"
  },
  MEDIUM: {
    background: "rgba(251, 191, 36, 0.10)",
    border: "rgba(251, 191, 36, 0.42)",
    accent: "#fbbf24",
    color: "#fef3c7"
  },
  HIGH: {
    background: "rgba(251, 146, 60, 0.12)",
    border: "rgba(251, 146, 60, 0.50)",
    accent: "#fb923c",
    color: "#ffedd5"
  },
  CRITICAL: {
    background: "rgba(251, 113, 133, 0.12)",
    border: "rgba(251, 113, 133, 0.52)",
    accent: "#fb7185",
    color: "#ffe4e6"
  }
};

function getAlertToastTheme(severity: Alert["severity"]): AlertToastTheme {
  return alertToastThemes[severity];
}

function alertSignature(alert: AlertToastLike) {
  return [alert.device_id, alert.device_timestamp, alert.severity, alert.estado, alert.message, alert.co_ppm, alert.presencia, alert.urgente].join("|");
}

function notifyAlert(alert: AlertToastLike) {
  const title = `${alert.device_id} · ${alert.estado}`;
  const description = `${alert.message} · ${fmt(alert.co_ppm, " ppm")} (Raw: ${fmt(alert.raw_co_adc)})`;
  const theme = getAlertToastTheme(alert.severity);
  const toastStyle = {
    background: theme.background,
    border: `1px solid ${theme.border}`,
    color: theme.color,
    boxShadow: `inset 3px 0 0 ${theme.accent}`
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

  if (alert.severity === "MEDIUM") {
    toast.warning(title, { description, style: toastStyle, classNames: toastClassNames });
    return;
  }

  toast.info(title, { description, style: toastStyle, classNames: toastClassNames });
}

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
  const [selectedDeviceId, setSelectedDeviceId] = useState(() => {
    try {
      return window.localStorage.getItem(selectedDeviceStorageKey) || "";
    } catch {
      return "";
    }
  });
  const [reloadTick, setReloadTick] = useState(0);
  const [compactLayout, setCompactLayout] = useState(() => window.innerWidth < 640);
  const seenAlertSignatures = useRef(new Set<string>());
  const hydratedAlerts = useRef(false);
  const hasLoadedOnce = useRef(false);

  useEffect(() => {
    const updateCompactLayout = () => setCompactLayout(window.innerWidth < 640);

    window.addEventListener("resize", updateCompactLayout);
    updateCompactLayout();

    return () => window.removeEventListener("resize", updateCompactLayout);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(selectedDeviceStorageKey, selectedDeviceId);
    } catch {
      // Ignore storage errors.
    }
  }, [selectedDeviceId, reloadTick]);

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
    let active = true;
    let completedThisCycle = false;
    let failedThisCycle = false;

    async function refresh() {
      try {
        if (!hasLoadedOnce.current) {
          setLoading(true);
        }

        const [health, devices] = await Promise.all([
          api.health(),
          api.devices()
        ]);

        if (!active) {
          return;
        }

        const liveSelectedDeviceId = selectedDeviceId
          ? devices.data.some((device) => device.device_id === selectedDeviceId)
            ? selectedDeviceId
            : ""
          : "";

        if (selectedDeviceId && !liveSelectedDeviceId) {
          setSelectedDeviceId("");
          return;
        }

        const scopeDeviceId = liveSelectedDeviceId || undefined;
        const [readings, alerts, summary, states, timeseries] = await Promise.all([
          api.latestReadings(40, scopeDeviceId),
          api.recentAlerts(24, 20, scopeDeviceId),
          api.summary(24, scopeDeviceId),
          api.stateDistribution(24, scopeDeviceId),
          api.timeseries(24, scopeDeviceId)
        ]);

        if (!active) {
          return;
        }

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
        completedThisCycle = true;
      } catch (err) {
        if (!active) {
          return;
        }

        failedThisCycle = true;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!active) {
          return;
        }

        if (!hasLoadedOnce.current && (completedThisCycle || failedThisCycle)) {
          setLoading(false);
          hasLoadedOnce.current = true;
        }
      }
    }

    seenAlertSignatures.current.clear();
    hydratedAlerts.current = false;
    void refresh();

    const interval = window.setInterval(() => void refresh(), 10000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [selectedDeviceId, reloadTick]);

  async function sendVentilation(action: "ENCENDER" | "APAGAR") {
    setCommandBusy(true);
    try {
      await api.ventilation(action);
      toast.success(`Ventilación: ${action === "ENCENDER" ? "Encendido" : "Apagado"}`, {
        description: "Comando publicado vía MQTT"
      });
      setReloadTick((tick) => tick + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      toast.error("Error al enviar comando de ventilación");
    } finally {
      setCommandBusy(false);
    }
  }

  async function ackAlert(alert: Alert) {
    setAckBusyId(alert.id);
    try {
      await api.ackAlert(alert.id);
      setReloadTick((tick) => tick + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAckBusyId(null);
    }
  }

  const latest = data.readings[0];
  const selectedDevice = selectedDeviceId
    ? data.devices.find((device) => device.device_id === selectedDeviceId) ?? null
    : null;
  const selectedScopeLabel = selectedDevice?.device_id || "Todos los nodos";
  const selectorValue = selectedDevice ? selectedDeviceId : allDevicesValue;
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

function formatLastSeen(value: string | null) {
  if (value == null) return "--";
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));

  if (diffSec < 60) {
    return `${diffSec}s`;
  }

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `${diffMin}m`;
  }

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return `${diffHours}h`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Dashboard de monitoreo remoto para niveles de Monóxido de Carbono en garajes</p>
          <h1>¡Bienvenido!</h1>
          <p className="subtitle">Desarrollado en ViteJS + shadCN, consumiendo la API REST de Node-RED sobre MariaDB, 100% compose ;)</p>
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
                          <p className="text-sm font-semibold text-[var(--foreground)]">{alert.estado}</p>
                          <p className="mt-1 text-xs text-[var(--muted-foreground)]">{alert.device_id} · {alert.co_ppm} ppm (Raw: {fmt(alert.raw_co_adc)})</p>
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
          <span>Nivel de Monóxido de Carbono (CO) actual</span>
          <strong>{fmt(latest?.co_ppm, " ppm")} <span className="ml-2 text-xs font-normal opacity-50">Raw: {fmt(latest?.raw_co_adc)}</span></strong>
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
            <h2>Nivel de CO - raw ADC por minuto</h2>
            <span>últimas 24h</span>
          </div>
          <ResponsiveContainer width="100%" height={lineChartHeight}>
            <LineChart data={series}>
              <CartesianGrid stroke="#243041" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" stroke="#94a3b8" minTickGap={28} tickLine={false} axisLine={false} />
              <YAxis yAxisId="left" stroke="#94a3b8" tickLine={false} axisLine={false} />
              <YAxis yAxisId="raw" orientation="right" stroke="#f59e0b" tickLine={false} axisLine={false} tickFormatter={(value) => `${Math.round(Number(value))}`} />
              <Tooltip contentStyle={{ background: "#111827", border: "1px solid #243041", borderRadius: 12 }} />
              <Line yAxisId="left" type="monotone" dataKey="avg_co_ppm" name="CO promedio (ppm)" stroke="#38bdf8" strokeWidth={2.5} dot={false} />
              <Line yAxisId="left" type="monotone" dataKey="max_co_ppm" name="CO max (ppm)" stroke="#fb7185" strokeWidth={2} dot={false} />
              <Line yAxisId="raw" type="monotone" dataKey="avg_raw_co_adc" name="Raw CO (ADC)" stroke="#f59e0b" strokeWidth={1.8} strokeDasharray="6 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card className="panel chart-panel">
          <div className="panel-head">
            <h2>Distribución de estados</h2>
            <span>clasificación server-side · {selectedScopeLabel}</span>
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
            <div className="panel-actions">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    className="gap-2 border-cyan-400/60 bg-[#121212] text-white hover:bg-[#1a1a1a] hover:text-white data-[state=open]:bg-[#1a1a1a]"
                    size="sm"
                    variant="outline"
                  >
                    <span className="max-w-[11rem] truncate">{selectedScopeLabel}</span>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[min(24rem,calc(100vw-1rem))] border-[var(--border)] bg-[var(--popover)] p-2 text-[var(--popover-foreground)] shadow-none">
                  <DropdownMenuLabel className="p-0 px-2 pt-1 text-sm font-semibold text-white">Seleccionar nodo</DropdownMenuLabel>
                  <p className="px-2 pb-2 pt-1 text-xs text-slate-300">Las opciones salen de `GET /api/devices` en vivo.</p>
                  <DropdownMenuSeparator className="my-1 bg-[var(--border)]" />
                  <ScrollArea className="h-64 pr-2">
                    <DropdownMenuRadioGroup
                      value={selectorValue}
                      onValueChange={(value) => setSelectedDeviceId(value === allDevicesValue ? "" : value)}
                    >
                      <DropdownMenuRadioItem className="items-start py-2" value={allDevicesValue}>
                        <div className="flex min-w-0 flex-col items-start gap-0.5">
                          <span className="font-medium text-white">Todos los nodos</span>
                          <span className="text-xs text-slate-300">Vista global</span>
                        </div>
                      </DropdownMenuRadioItem>
                      {data.devices.map((device) => (
                        <DropdownMenuRadioItem className="items-start py-2" key={device.device_id} value={device.device_id}>
                          <div className="flex min-w-0 flex-col items-start gap-0.5">
                            <span className="truncate font-medium text-white">{device.device_id}</span>
                            <span className="flex items-center gap-2 text-xs text-slate-300">
                              <span className={`node-state-dot ${device.connection_state}`} />
                              <span>{device.connection_state}</span>
                              <span>·</span>
                              <span>{device.node_type}</span>
                              <span>·</span>
                              <span>{fmt(device.latest_co_ppm, " ppm")} · Raw: {fmt(device.latest_raw_co_adc)}</span>
                            </span>
                          </div>
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </ScrollArea>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button asChild className="gap-2 border-cyan-400/50 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/20 hover:text-cyan-50" size="sm" variant="outline">
                <a href="http://localhost:1880" target="_blank" rel="noreferrer">
                  Abrir Node-RED
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            </div>
          </div>
          <div className="list">
            {data.devices.map((device) => (
              <button
                aria-pressed={selectedDeviceId === device.device_id}
                className={`row node node-selectable ${device.connection_state}${selectedDeviceId === device.device_id ? " selected" : ""}`}
                key={device.device_id}
                onClick={() => setSelectedDeviceId(device.device_id)}
                type="button"
              >
                <div>
                  <strong>{device.device_id}</strong>
                  <small>{device.node_type} · {device.latest_estado || "sin estado"}</small>
                  <small className="status-line">
                    <span className={`node-state-text ${device.connection_state}`}>
                      <span className={`node-state-dot ${device.connection_state}`} />
                      {device.connection_state === "online" ? "Online" : "Offline"}
                      {device.connection_state === "offline" && <> · last seen {formatLastSeen(device.latest_reading_at)}</>}
                    </span>
                  </small>
                </div>
                <span>{fmt(device.latest_co_ppm, " ppm")} <small className="ml-1 opacity-50">({fmt(device.latest_raw_co_adc)})</small></span>
              </button>
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
