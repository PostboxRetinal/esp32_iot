import { connect, type MqttClient } from "mqtt";

import { alertTopicPrefix, alertTopics, commandTopic, config } from "./config";

export type VentilationCommand = {
  device_id: string;
  timestamp: string;
  actuator: "VENTILACION";
  action: "ENCENDER" | "APAGAR";
  reason: string;
  source: "elysia-api";
};

export type AlertNotification = {
  device_id: string;
  device_timestamp: string;
  severity: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  estado: string;
  message: string;
  co_ppm: number;
  presencia: 0 | 1;
  urgente: 0 | 1;
  topic: string;
  received_at: string;
};

let mqttClientPromise: Promise<MqttClient> | null = null;
let alertClient: MqttClient | null = null;
const alertListeners = new Set<(alert: AlertNotification) => void>();

export function mqttIsConfigured() {
  return Boolean(config.mqtt.host && config.mqtt.topicBase);
}

export function onAlertReceived(listener: (alert: AlertNotification) => void) {
  alertListeners.add(listener);

  return () => {
    alertListeners.delete(listener);
  };
}

function emitAlert(alert: AlertNotification) {
  for (const listener of alertListeners) {
    try {
      listener(alert);
    } catch (error) {
      console.error(`[mqtt] alert listener failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function parseAlertMessage(topic: string, payload: Buffer): AlertNotification | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(payload.toString("utf8"));
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const data = parsed as Record<string, unknown>;
  const deviceId = typeof data.device_id === "string" ? data.device_id.trim() : "";
  const estado = typeof data.estado === "string" ? data.estado.trim() : "";
  const message = typeof data.message === "string" ? data.message.trim() : "";
  const severity = typeof data.severity === "string" ? data.severity.trim().toUpperCase() : "";
  const timestamp = typeof data.timestamp === "string" && data.timestamp.trim() ? data.timestamp.trim() : new Date().toISOString();
  const coPpm = Number(data.co_ppm);

  if (!deviceId || !estado || !message || !Number.isFinite(coPpm)) {
    return null;
  }

  if (severity !== "INFO" && severity !== "LOW" && severity !== "MEDIUM" && severity !== "HIGH" && severity !== "CRITICAL") {
    return null;
  }

  return {
    device_id: deviceId,
    device_timestamp: timestamp,
    severity,
    estado,
    message,
    co_ppm: coPpm,
    presencia: data.presencia === 1 || data.presencia === "SI" || data.presencia === true ? 1 : 0,
    urgente: data.urgente === 1 || data.urgente === true ? 1 : 0,
    topic,
    received_at: new Date().toISOString()
  };
}

export function startAlertBridge() {
  if (alertClient || !mqttIsConfigured()) {
    return;
  }

  alertClient = connect({
    protocol: "mqtt",
    host: config.mqtt.host,
    port: config.mqtt.port,
    username: config.mqtt.username || undefined,
    password: config.mqtt.password || undefined,
    reconnectPeriod: 5000,
    connectTimeout: 8000,
    clientId: `fiot-api-alerts-${Math.random().toString(16).slice(2)}`
  });

  alertClient.on("connect", () => {
    for (const topic of alertTopics) {
      alertClient?.subscribe(topic, { qos: 0 }, (error) => {
        if (error) {
          console.error(`[mqtt] alert subscription failed for ${topic}: ${error.message}`);
          return;
        }

        console.log(`[mqtt] alert bridge subscribed to ${topic}`);
      });
    }
  });

  alertClient.on("message", (topic, payload) => {
    if (!topic.startsWith(alertTopicPrefix)) {
      return;
    }

    const alert = parseAlertMessage(topic, payload);
    if (alert) {
      console.info(`[mqtt] alert received ${alert.device_id} ${alert.severity} ${alert.co_ppm}ppm`);
      emitAlert(alert);
    } else {
      console.warn(`[mqtt] ignored malformed alert payload on ${topic}`);
    }
  });

  alertClient.on("error", (error) => {
    console.error(`[mqtt] alert bridge error: ${error.message}`);
  });
}

async function getMqttClient() {
  if (mqttClientPromise) {
    return mqttClientPromise;
  }

  mqttClientPromise = new Promise<MqttClient>((resolve, reject) => {
    const client = connect({
      protocol: "mqtt",
      host: config.mqtt.host,
      port: config.mqtt.port,
      username: config.mqtt.username || undefined,
      password: config.mqtt.password || undefined,
      reconnectPeriod: 5000,
      connectTimeout: 8000,
      clientId: `fiot-api-${Math.random().toString(16).slice(2)}`
    });

    const timeout = setTimeout(() => {
      mqttClientPromise = null;
      client.end(true);
      reject(new Error("MQTT connection timeout"));
    }, 9000);

    client.once("connect", () => {
      clearTimeout(timeout);
      resolve(client);
    });

    client.once("error", (error) => {
      clearTimeout(timeout);
      mqttClientPromise = null;
      client.end(true);
      reject(error);
    });

    client.on("error", (error) => {
      console.error(`[mqtt] ${error.message}`);
    });
  });

  return mqttClientPromise;
}

export async function publishVentilationCommand(command: VentilationCommand) {
  const client = await getMqttClient();
  const payload = JSON.stringify(command);

  await new Promise<void>((resolve, reject) => {
    client.publish(commandTopic, payload, { qos: 1, retain: false }, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  return { topic: commandTopic };
}
