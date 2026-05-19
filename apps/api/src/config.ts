const toNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  port: toNumber(Bun.env.PORT, 3000),
  corsOrigin: Bun.env.API_CORS_ORIGIN || "http://localhost:5173",
  hardwareDeviceId: Bun.env.HARDWARE_DEVICE_ID || "ESP32-GARAGE-CO-001",
  mysql: {
    host: Bun.env.MYSQL_HOST || "mariadb",
    port: toNumber(Bun.env.MYSQL_PORT, 3306),
    database: Bun.env.MYSQL_DATABASE || "fiot_garage",
    user: Bun.env.MYSQL_USER || "fiot_app",
    password: Bun.env.MYSQL_PASSWORD || "change_me_fiot_app"
  },
  mqtt: {
    host: Bun.env.MQTT_BROKER_HOST || "maqiatto.com",
    port: toNumber(Bun.env.MQTT_BROKER_PORT, 1883),
    username: Bun.env.MQTT_API_USER || Bun.env.MQTT_NODERED_USER || Bun.env.MQTT_USER || "",
    password: Bun.env.MQTT_API_PASSWORD || Bun.env.MQTT_NODERED_PASSWORD || Bun.env.MQTT_PASSWORD || "",
    topicBase: Bun.env.MQTT_TOPIC_BASE || "your_maqiatto_username/fiot/garage",
    commandTopic: Bun.env.MQTT_COMMAND_TOPIC || ""
  }
};

export const commandTopic = config.mqtt.commandTopic || `${config.mqtt.topicBase}/commands`;
