const fs = require("fs");
const path = require("path");

const dataDir = process.env.NODE_RED_USER_DIR || "/data";
const templatePath = "/opt/fiot-seed/flows.template.json";
const outputFlowPath = path.join(dataDir, "flows.json");
const outputCredPath = path.join(dataDir, "flows_cred.json");

const replacementKeys = [
  "MQTT_BROKER_HOST",
  "MQTT_BROKER_PORT",
  "MQTT_NODERED_USER",
  "MQTT_NODERED_PASSWORD",
  "MQTT_TOPIC_BASE",
  "MYSQL_HOST",
  "MYSQL_PORT",
  "MYSQL_DATABASE",
  "MYSQL_USER",
  "MYSQL_PASSWORD",
  "HARDWARE_DEVICE_ID",
  "SIM_DEVICE_ID"
];

let flowsTemplate = fs.readFileSync(templatePath, "utf8");

for (const key of replacementKeys) {
  const token = `\${${key}}`;
  const value = process.env[key] || "";
  flowsTemplate = flowsTemplate.split(token).join(value);
}

if (!flowsTemplate.endsWith("\n")) {
  flowsTemplate += "\n";
}

fs.writeFileSync(outputFlowPath, flowsTemplate, "utf8");

const mqttUser = process.env.MQTT_NODERED_USER || process.env.MQTT_USER || "";
const mqttPassword = process.env.MQTT_NODERED_PASSWORD || process.env.MQTT_PASSWORD || "";
const mysqlUser = process.env.MYSQL_USER || "";
const mysqlPassword = process.env.MYSQL_PASSWORD || "";

const flowsCredentials = {
  cfg_mqtt: {
    user: mqttUser,
    password: mqttPassword
  },
  cfg_mysql: {
    user: mysqlUser,
    password: mysqlPassword
  }
};

fs.writeFileSync(outputCredPath, `${JSON.stringify(flowsCredentials, null, 2)}\n`, "utf8");
