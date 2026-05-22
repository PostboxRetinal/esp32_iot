const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const dataDir = process.env.NODE_RED_USER_DIR || "/data";
const templatePath = "/opt/fiot-seed/flows.template.json";
const outputFlowPath = path.join(dataDir, "flows.json");
const outputCredPath = path.join(dataDir, "flows_cred.json");

const encryptionAlgorithm = "aes-256-ctr";

const thresholdKeys = [
  "CO_SEGURO_MAX_PPM",
  "CO_PRECAUCION_MAX_PPM",
  "CO_PELIGRO_MAX_PPM",
  "CO_URGENTE_MIN_PPM",
  "MQ7_ADC_SEGURO_RAW_MAX",
  "MQ7_ADC_PRECAUCION_RAW_MAX",
  "MQ7_ADC_PELIGRO_RAW_MAX",
  "MQ7_ADC_URGENTE_RAW_MIN",
  "MQ7_ADC_SATURATION_RAW",
];

const replacementKeys = [
  "MQTT_BROKER_HOST",
  "MQTT_BROKER_PORT",
  "MQTT_USER",
  "MQTT_PASSWORD",
  "MQTT_TOPIC_BASE",
  "MARIADB_HOST",
  "MARIADB_PORT",
  "MARIADB_DATABASE",
  "MARIADB_USER",
  "MARIADB_PASSWORD",
  "HARDWARE_DEVICE_ID",
  "SIM_DEVICE_ID",
  ...thresholdKeys
];

function encryptCredentials(credentialSecret, credentials) {
  const key = crypto.createHash("sha256").update(credentialSecret).digest();
  const initVector = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(encryptionAlgorithm, key, initVector);
  const encrypted = cipher.update(JSON.stringify(credentials), "utf8", "base64") + cipher.final("base64");
  return { $: initVector.toString("hex") + encrypted };
}

let flowsTemplate = fs.readFileSync(templatePath, "utf8");

for (const key of replacementKeys) {
  const token = `\${${key}}`;
  const value = process.env[key] || "";
  flowsTemplate = flowsTemplate.split(token).join(value);
}

if (!flowsTemplate.endsWith("\n")) {
  flowsTemplate += "\n";
}

const flows = JSON.parse(flowsTemplate);

const cleanedFlows = flows.map((node) => {
  if (node.credentials) {
    const cleaned = { ...node };
    delete cleaned.credentials;
    return cleaned;
  }
  return node;
});

fs.writeFileSync(outputFlowPath, JSON.stringify(cleanedFlows, null, 2) + "\n", "utf8");

const mqttUser = process.env.MQTT_USER || "";
const mqttPassword = process.env.MQTT_PASSWORD || "";
const mariadbUser = process.env.MARIADB_USER || "";
const mariadbPassword = process.env.MARIADB_PASSWORD || "";

const flowsCredentials = {
  cfg_mqtt: {
    user: mqttUser,
    password: mqttPassword
  },
  cfg_mysql: {
    user: mariadbUser,
    password: mariadbPassword
  }
};

const credentialSecret = process.env.NODE_RED_CREDENTIAL_SECRET;
if (!credentialSecret) {
  console.error("[fiot-nodered] NODE_RED_CREDENTIAL_SECRET is not set. Cannot encrypt credentials.");
  process.exit(1);
}

const encrypted = encryptCredentials(credentialSecret, flowsCredentials);
fs.writeFileSync(outputCredPath, JSON.stringify(encrypted, null, 2) + "\n", "utf8");
console.log("[fiot-nodered] Credentials encrypted and saved to flows_cred.json");
