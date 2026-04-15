const fs = require("fs");
const path = require("path");

const dataDir = process.env.NODE_RED_USER_DIR || "/data";
const templatePath = "/opt/fiot-seed/flows.template.json";
const firmwareConfigHeaderPath = process.env.FIRMWARE_CONFIG_HEADER || "/opt/fiot-seed/app_config.h";
const outputFlowPath = path.join(dataDir, "flows.json");
const outputCredPath = path.join(dataDir, "flows_cred.json");

const thresholdKeys = [
  "CO_SEGURO_MAX_PPM",
  "CO_PRECAUCION_MAX_PPM",
  "CO_PELIGRO_MAX_PPM",
  "CO_URGENTE_MIN_PPM"
];

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
  "SIM_DEVICE_ID",
  ...thresholdKeys
];

function extractDefines(headerContent) {
  const defines = {};
  const lines = headerContent.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("#define ")) {
      continue;
    }

    const match = trimmed.match(/^#define\s+([A-Z][A-Z0-9_]*)\s+(.+)$/);
    if (!match) {
      continue;
    }

    const key = match[1];
    const rawValue = match[2].replace(/\/\/.*$/, "").trim();
    if (!rawValue) {
      continue;
    }

    defines[key] = rawValue;
  }

  return defines;
}

function toNumberIfPossible(raw) {
  const normalized = raw.replace(/\s+/g, "").replace(/[()]/g, "").replace(/[fF]$/, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveDefineAsNumber(key, defines, visited = new Set()) {
  if (visited.has(key)) {
    return null;
  }

  const raw = defines[key];
  if (typeof raw !== "string") {
    return null;
  }

  const numeric = toNumberIfPossible(raw);
  if (numeric !== null) {
    return numeric;
  }

  const alias = raw.replace(/\s+/g, "");
  if (!/^[A-Z][A-Z0-9_]*$/.test(alias)) {
    return null;
  }

  visited.add(key);
  const resolved = resolveDefineAsNumber(alias, defines, visited);
  visited.delete(key);
  return resolved;
}

function loadThresholdsFromFirmwareHeader(headerPath) {
  if (!fs.existsSync(headerPath)) {
    console.warn(`[fiot-nodered] Firmware header not found at ${headerPath}; using environment/default threshold values.`);
    return {};
  }

  const headerContent = fs.readFileSync(headerPath, "utf8");
  const defines = extractDefines(headerContent);
  const resolved = {};

  for (const key of thresholdKeys) {
    const value = resolveDefineAsNumber(key, defines);
    if (value !== null) {
      resolved[key] = value;
    }
  }

  if (resolved.CO_URGENTE_MIN_PPM == null && resolved.CO_PELIGRO_MAX_PPM != null) {
    resolved.CO_URGENTE_MIN_PPM = resolved.CO_PELIGRO_MAX_PPM;
  }

  return resolved;
}

const firmwareThresholds = loadThresholdsFromFirmwareHeader(firmwareConfigHeaderPath);
for (const key of thresholdKeys) {
  if (firmwareThresholds[key] != null) {
    process.env[key] = String(firmwareThresholds[key]);
  }
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
