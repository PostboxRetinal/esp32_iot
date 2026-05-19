import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

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

function fmt(value: number | null | undefined, suffix = "") {
  if (value == null || Number.isNaN(value)) {
    return "--";
  }

  return `${value}${suffix}`;
}

function App() {
  const [data, setData] = useState<DashboardData>(initialData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commandBusy, setCommandBusy] = useState(false);

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
    try {
      await api.ackAlert(alert.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const latest = data.readings[0];
  const summary = data.summary;
  const series = [...data.timeseries].slice(-80).map((point) => ({
    ...point,
    label: new Date(point.bucket).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }));

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Fundamentos de IoT · Parcial 3</p>
          <h1>Garage CO Observatory</h1>
          <p className="subtitle">Dashboard React consumiendo la API Elysia sobre MariaDB, con Node-RED como plataforma IoT.</p>
        </div>
        <div className="status-card">
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
              <CartesianGrid strokeDasharray="3 3" stroke="#263445" />
              <XAxis dataKey="label" stroke="#93a4b8" minTickGap={24} />
              <YAxis stroke="#93a4b8" />
              <Tooltip contentStyle={{ background: "#101826", border: "1px solid #263445" }} />
              <Line type="monotone" dataKey="avg_co_ppm" name="CO promedio" stroke="#38bdf8" strokeWidth={3} dot={false} />
              <Line type="monotone" dataKey="max_co_ppm" name="CO max" stroke="#fb7185" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </article>

        <article className="panel chart-panel">
          <div className="panel-head">
            <h2>Distribución de estados</h2>
            <span>clasificación server-side</span>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.states}>
              <CartesianGrid strokeDasharray="3 3" stroke="#263445" />
              <XAxis dataKey="estado" stroke="#93a4b8" />
              <YAxis stroke="#93a4b8" />
              <Tooltip contentStyle={{ background: "#101826", border: "1px solid #263445" }} />
              <Bar dataKey="total" fill="#34d399" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </article>
      </section>

      <section className="grid three">
        <article className="panel">
          <div className="panel-head">
            <h2>Nodos</h2>
            <a href="http://localhost:1880" target="_blank" rel="noreferrer">Node-RED</a>
          </div>
          <div className="list">
            {data.devices.map((device) => (
              <div className="row" key={device.device_id}>
                <div>
                  <strong>{device.device_id}</strong>
                  <small>{device.node_type} · {device.latest_estado || "sin estado"}</small>
                </div>
                <span>{fmt(device.latest_co_ppm, " ppm")}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <h2>Alertas recientes</h2>
            <span>{data.alerts.length}</span>
          </div>
          <div className="list scroll">
            {data.alerts.map((alert) => (
              <div className={`row alert ${alert.severity.toLowerCase()}`} key={alert.id}>
                <div>
                  <strong>{alert.severity} · {alert.alert_type}</strong>
                  <small>{alert.device_id} · {alert.co_ppm} ppm · {alert.ack_status}</small>
                </div>
                {alert.ack_status === "PENDING" && <button onClick={() => void ackAlert(alert)}>ACK</button>}
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
            <button disabled={commandBusy} onClick={() => void sendVentilation("ENCENDER")}>Encender</button>
            <button disabled={commandBusy} className="secondary" onClick={() => void sendVentilation("APAGAR")}>Apagar</button>
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
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
