import { cors } from "@elysiajs/cors";
import { Elysia, status as httpStatus, t } from "elysia";
import type { ExecuteValues } from "mysql2";

import { commandTopic, config } from "./config";
import { executeStatement, queryRows } from "./db";
import { mqttIsConfigured, publishVentilationCommand, type VentilationCommand } from "./mqtt";

type DeviceRow = {
  device_id: string;
  node_type: "hardware" | "simulated";
  description: string | null;
  created_at: string;
  last_seen_at: string;
  latest_co_ppm: number | null;
  latest_estado: string | null;
  latest_reading_at: string | null;
};

type ReadingRow = {
  id: number;
  device_id: string;
  device_timestamp: string;
  co_ppm: number;
  presencia: 0 | 1;
  source_topic: string;
  message_id: number | null;
  ingested_at: string;
};

type AlertRow = {
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
  acked_at: string | null;
};

type CommandRow = {
  id: number;
  device_id: string;
  command_ts: string;
  actuator: string;
  action: string;
  reason: string | null;
  source_state: string | null;
  co_ppm: number | null;
  presencia: 0 | 1 | null;
  status: "PUBLISHED" | "SKIPPED" | "ERROR";
};

const parsePositiveInt = (rawValue: unknown, fallback: number, max: number) => {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(Math.trunc(parsed), max);
};

const corsOrigin = config.corsOrigin === "*"
  ? true
  : config.corsOrigin.split(",").map((origin) => origin.trim()).filter(Boolean);

const app = new Elysia()
  .use(cors({ origin: corsOrigin }))
  .onError(({ code, error }) => {
    if (code === "VALIDATION") {
      return httpStatus(400, { error: "validation_error", message: error.message });
    }

    console.error(error);
    return httpStatus(500, { error: "internal_error", message: "Unexpected API error" });
  })
  .get("/", () => ({
    service: "fiot-garage-api",
    docs: "/api/health"
  }))
  .group("/api", (api) => api
    .get("/health", async () => {
      let db: "ok" | "error" = "ok";
      try {
        await queryRows<{ ok: number }>("SELECT 1 AS ok");
      } catch {
        db = "error";
      }

      return {
        ok: db === "ok",
        db,
        mqtt: mqttIsConfigured() ? "configured" : "missing_config",
        command_topic: commandTopic,
        timestamp: new Date().toISOString()
      };
    })
    .get("/devices", async () => {
      const devices = await queryRows<DeviceRow>(`
        SELECT
          d.device_id,
          d.node_type,
          d.description,
          d.created_at,
          d.last_seen_at,
          lr.co_ppm AS latest_co_ppm,
          ls.estado AS latest_estado,
          lr.ingested_at AS latest_reading_at
        FROM devices d
        LEFT JOIN sensor_readings lr
          ON lr.id = (SELECT MAX(id) FROM sensor_readings WHERE device_id = d.device_id)
        LEFT JOIN state_events ls
          ON ls.id = (SELECT MAX(id) FROM state_events WHERE device_id = d.device_id)
        ORDER BY d.device_id ASC
      `);

      return { data: devices };
    })
    .get("/readings/latest", async ({ query }) => {
      const limit = parsePositiveInt(query.limit, 50, 500);
      const deviceId = String(query.device_id || "").trim();
      const params: ExecuteValues[] = [];
      let where = "";

      if (deviceId) {
        where = "WHERE device_id = ?";
        params.push(deviceId);
      }

      params.push(limit);
      const rows = await queryRows<ReadingRow>(`
        SELECT id, device_id, device_timestamp, co_ppm, presencia, source_topic, message_id, ingested_at
        FROM sensor_readings
        ${where}
        ORDER BY id DESC
        LIMIT ?
      `, params);

      return { data: rows };
    }, {
      query: t.Object({
        device_id: t.Optional(t.String()),
        limit: t.Optional(t.String())
      })
    })
    .get("/alerts/recent", async ({ query }) => {
      const hours = parsePositiveInt(query.hours, 24, 720);
      const limit = parsePositiveInt(query.limit, 50, 500);
      const rows = await queryRows<AlertRow>(`
        SELECT id, device_id, device_timestamp, alert_ts, severity, alert_type, message,
          co_ppm, presencia, urgente, ack_status, acked_at
        FROM alerts
        WHERE alert_ts >= DATE_SUB(NOW(3), INTERVAL ? HOUR)
        ORDER BY alert_ts DESC
        LIMIT ?
      `, [hours, limit]);

      return { hours, data: rows };
    }, {
      query: t.Object({
        hours: t.Optional(t.String()),
        limit: t.Optional(t.String())
      })
    })
    .put("/alerts/:id/ack", async ({ params }) => {
      const result = await executeStatement(`
        UPDATE alerts
        SET ack_status = 'ACKED', acked_at = NOW(3)
        WHERE id = ? AND ack_status = 'PENDING'
      `, [params.id]);

      if (result.affectedRows === 0) {
        return httpStatus(404, { error: "alert_not_found_or_not_pending" });
      }

      return { ok: true, id: params.id, ack_status: "ACKED" };
    }, {
      params: t.Object({ id: t.Number({ minimum: 1 }) })
    })
    .delete("/alerts/:id", async ({ params }) => {
      const result = await executeStatement(`
        UPDATE alerts
        SET ack_status = 'CLOSED', acked_at = COALESCE(acked_at, NOW(3))
        WHERE id = ?
      `, [params.id]);

      if (result.affectedRows === 0) {
        return httpStatus(404, { error: "alert_not_found" });
      }

      return { ok: true, id: params.id, ack_status: "CLOSED" };
    }, {
      params: t.Object({ id: t.Number({ minimum: 1 }) })
    })
    .get("/analytics/summary", async ({ query }) => {
      const hours = parsePositiveInt(query.hours, 24, 720);
      const [readings, alerts, states, devices] = await Promise.all([
        queryRows<{
          total_readings: number;
          avg_co_ppm: number | null;
          max_co_ppm: number | null;
          min_co_ppm: number | null;
        }>(`
          SELECT COUNT(*) AS total_readings,
            ROUND(AVG(co_ppm), 2) AS avg_co_ppm,
            MAX(co_ppm) AS max_co_ppm,
            MIN(co_ppm) AS min_co_ppm
          FROM sensor_readings
          WHERE ingested_at >= DATE_SUB(NOW(3), INTERVAL ? HOUR)
        `, [hours]),
        queryRows<{
          total_alerts: number;
          critical_alerts: number;
          pending_alerts: number;
        }>(`
          SELECT COUNT(*) AS total_alerts,
            SUM(severity = 'CRITICAL') AS critical_alerts,
            SUM(ack_status = 'PENDING') AS pending_alerts
          FROM alerts
          WHERE alert_ts >= DATE_SUB(NOW(3), INTERVAL ? HOUR)
        `, [hours]),
        queryRows<{ urgent_events: number }>(`
          SELECT SUM(urgente = 1) AS urgent_events
          FROM state_events
          WHERE ingested_at >= DATE_SUB(NOW(3), INTERVAL ? HOUR)
        `, [hours]),
        queryRows<{ total_devices: number; active_devices: number }>(`
          SELECT COUNT(*) AS total_devices,
            SUM(last_seen_at >= DATE_SUB(NOW(3), INTERVAL ? HOUR)) AS active_devices
          FROM devices
        `, [hours])
      ]);

      return {
        hours,
        devices: {
          total: devices[0]?.total_devices || 0,
          active: devices[0]?.active_devices || 0
        },
        readings: {
          total: readings[0]?.total_readings || 0,
          avg_co_ppm: readings[0]?.avg_co_ppm || 0,
          max_co_ppm: readings[0]?.max_co_ppm || 0,
          min_co_ppm: readings[0]?.min_co_ppm || 0
        },
        alerts: {
          total: alerts[0]?.total_alerts || 0,
          critical: alerts[0]?.critical_alerts || 0,
          pending: alerts[0]?.pending_alerts || 0
        },
        states: {
          urgent_events: states[0]?.urgent_events || 0
        }
      };
    }, {
      query: t.Object({ hours: t.Optional(t.String()) })
    })
    .get("/analytics/state-distribution", async ({ query }) => {
      const hours = parsePositiveInt(query.hours, 24, 720);
      const rows = await queryRows<{ estado: string; total: number }>(`
        SELECT estado, COUNT(*) AS total
        FROM state_events
        WHERE ingested_at >= DATE_SUB(NOW(3), INTERVAL ? HOUR)
        GROUP BY estado
        ORDER BY total DESC
      `, [hours]);

      return { hours, data: rows };
    }, {
      query: t.Object({ hours: t.Optional(t.String()) })
    })
    .get("/analytics/timeseries", async ({ query }) => {
      const hours = parsePositiveInt(query.hours, 24, 720);
      const deviceId = String(query.device_id || "").trim();
      const params: ExecuteValues[] = [hours];
      let deviceFilter = "";

      if (deviceId) {
        deviceFilter = "AND device_id = ?";
        params.push(deviceId);
      }

      const rows = await queryRows<{
        bucket: string;
        device_id: string;
        avg_co_ppm: number;
        max_co_ppm: number;
        presencia_count: number;
        samples: number;
      }>(`
        SELECT DATE_FORMAT(ingested_at, '%Y-%m-%dT%H:%i:00') AS bucket,
          device_id,
          ROUND(AVG(co_ppm), 2) AS avg_co_ppm,
          MAX(co_ppm) AS max_co_ppm,
          SUM(presencia = 1) AS presencia_count,
          COUNT(*) AS samples
        FROM sensor_readings
        WHERE ingested_at >= DATE_SUB(NOW(3), INTERVAL ? HOUR)
          ${deviceFilter}
        GROUP BY bucket, device_id
        ORDER BY bucket ASC
        LIMIT 500
      `, params);

      return { hours, data: rows };
    }, {
      query: t.Object({
        device_id: t.Optional(t.String()),
        hours: t.Optional(t.String())
      })
    })
    .get("/commands/recent", async ({ query }) => {
      const limit = parsePositiveInt(query.limit, 20, 200);
      const rows = await queryRows<CommandRow>(`
        SELECT id, device_id, command_ts, actuator, action, reason, source_state,
          co_ppm, presencia, status
        FROM actuator_commands
        ORDER BY id DESC
        LIMIT ?
      `, [limit]);

      return { data: rows };
    }, {
      query: t.Object({ limit: t.Optional(t.String()) })
    })
    .post("/commands/ventilation", async ({ body }) => {
      const timestamp = new Date().toISOString();
      const deviceId = body.device_id?.trim() || config.hardwareDeviceId;
      const reason = body.reason?.trim() || "Comando manual desde dashboard";
      const command: VentilationCommand = {
        device_id: deviceId,
        timestamp,
        actuator: "VENTILACION",
        action: body.action,
        reason,
        source: "elysia-api"
      };

      let status = "PUBLISHED";
      let mqttTopic = commandTopic;
      let publishError: string | null = null;

      try {
        const published = await publishVentilationCommand(command);
        mqttTopic = published.topic;
      } catch (error) {
        status = "ERROR";
        publishError = error instanceof Error ? error.message : String(error);
      }

      await executeStatement(`
        INSERT INTO actuator_commands
          (device_id, device_timestamp, actuator, action, reason, source_state, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [deviceId, timestamp, "VENTILACION", body.action, reason, "MANUAL_API", status]);

      if (publishError) {
        return httpStatus(502, { ok: false, command, mqtt_topic: mqttTopic, error: publishError });
      }

      return { ok: true, command, mqtt_topic: mqttTopic };
    }, {
      body: t.Object({
        device_id: t.Optional(t.String()),
        action: t.Union([t.Literal("ENCENDER"), t.Literal("APAGAR")]),
        reason: t.Optional(t.String({ maxLength: 255 }))
      })
    })
  )
  .listen(config.port);

console.log(`fiot-garage-api listening on http://0.0.0.0:${app.server?.port}`);

export type App = typeof app;
