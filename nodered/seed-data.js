const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const dataDir = process.env.NODE_RED_USER_DIR || "/data";
const templatePath = "/opt/fiot-seed/flows.template.json";
const firmwareConfigHeaderPath = process.env.FIRMWARE_CONFIG_HEADER || "/opt/fiot-seed/app_config.h";
const outputFlowPath = path.join(dataDir, "flows.json");
const outputCredPath = path.join(dataDir, "flows_cred.json");

const encryptionAlgorithm = "aes-256-ctr";

const thresholdKeys = [
  "CO_SEGURO_MAX_PPM",
  "CO_PRECAUCION_MAX_PPM",
  "CO_PELIGRO_MAX_PPM",
  "CO_URGENTE_MIN_PPM"
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

  try {
    const stat = fs.statSync(headerPath);
    if (!stat.isFile()) {
      console.warn(`[fiot-nodered] Firmware header path ${headerPath} is not a file; using environment/default threshold values.`);
      return {};
    }
  } catch (error) {
    console.warn(`[fiot-nodered] Unable to inspect firmware header at ${headerPath}: ${error.message}; using environment/default threshold values.`);
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

function encryptCredentials(credentialSecret, credentials) {
  const key = crypto.createHash("sha256").update(credentialSecret).digest();
  const initVector = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(encryptionAlgorithm, key, initVector);
  const encrypted = cipher.update(JSON.stringify(credentials), "utf8", "base64") + cipher.final("base64");
  return { $: initVector.toString("hex") + encrypted };
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
