import { connect, type MqttClient } from "mqtt";

import { commandTopic, config } from "./config";

export type VentilationCommand = {
  device_id: string;
  timestamp: string;
  actuator: "VENTILACION";
  action: "ENCENDER" | "APAGAR";
  reason: string;
  source: "elysia-api";
};

let mqttClientPromise: Promise<MqttClient> | null = null;

export function mqttIsConfigured() {
  return Boolean(config.mqtt.host && config.mqtt.topicBase);
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
