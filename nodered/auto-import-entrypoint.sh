#!/bin/sh
set -eu

DATA_DIR="/data"
SEED_DIR="/opt/fiot-seed"
SEED_MARKER="${DATA_DIR}/.fiot_seeded"
SEED_HASH_MARKER="${DATA_DIR}/.fiot_seeded_template.sha256"
TEMPLATE_PATH="${SEED_DIR}/flows.template.json"

AUTO_IMPORT="${NR_AUTO_IMPORT:-true}"
FORCE_IMPORT="${NR_FORCE_IMPORT:-false}"
DB_WAIT_ENABLED="${DB_WAIT_ENABLED:-true}"
DB_WAIT_TIMEOUT_SEC="${DB_WAIT_TIMEOUT_SEC:-30}"
DB_WAIT_INTERVAL_SEC="${DB_WAIT_INTERVAL_SEC:-1}"

if [ "${DB_WAIT_ENABLED}" = "true" ] || [ "${DB_WAIT_ENABLED}" = "1" ]; then
  DB_HOST="${MARIADB_HOST:-mariadb}"
  DB_PORT="${MARIADB_PORT:-3306}"
  echo "[fiot-nodered] Waiting for MariaDB at ${DB_HOST}:${DB_PORT} (timeout ${DB_WAIT_TIMEOUT_SEC}s)..."

  if ! node <<'NODE'
const net = require("net");

const host = process.env.MARIADB_HOST || "mariadb";
const port = Number(process.env.MARIADB_PORT || "3306");
const timeoutSec = Number(process.env.DB_WAIT_TIMEOUT_SEC || "90");
const intervalSec = Math.max(1, Number(process.env.DB_WAIT_INTERVAL_SEC || "1"));
const deadline = Date.now() + timeoutSec * 1000;

function tryConnect() {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });

    const cleanup = () => {
      socket.removeAllListeners();
      socket.destroy();
    };

    socket.setTimeout(2000);
    socket.once("connect", () => {
      cleanup();
      resolve();
    });
    socket.once("timeout", () => {
      cleanup();
      reject(new Error("timeout"));
    });
    socket.once("error", (err) => {
      cleanup();
      reject(err);
    });
  });
}

async function waitForDb() {
  while (Date.now() < deadline) {
    try {
      await tryConnect();
      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, intervalSec * 1000));
    }
  }

  return false;
}

waitForDb()
  .then((ready) => {
    if (!ready) {
      console.error(`[fiot-nodered] MariaDB not reachable at ${host}:${port} within ${timeoutSec}s`);
      process.exit(1);
    }

    process.exit(0);
  })
  .catch((err) => {
    console.error("[fiot-nodered] Unexpected DB wait error:", err.message);
    process.exit(1);
  });
NODE
  then
    echo "[fiot-nodered] Database wait failed. Exiting so container can restart."
    exit 1
  fi

  echo "[fiot-nodered] MariaDB is reachable."
fi

if [ "${AUTO_IMPORT}" = "true" ] || [ "${AUTO_IMPORT}" = "1" ]; then
  if [ ! -f "${DATA_DIR}/settings.js" ] && [ -f "${SEED_DIR}/settings.js" ]; then
    cp "${SEED_DIR}/settings.js" "${DATA_DIR}/settings.js"
    echo "[fiot-nodered] settings.js seeded into /data"
  fi

  SEED_HASH="$(node -e '
    const fs = require("fs");
    const crypto = require("crypto");
    const files = [process.argv[1], process.argv[2], process.argv[3]];
    const hash = crypto.createHash("sha256");
    for (const f of files) {
      hash.update(fs.readFileSync(f));
    }
    process.stdout.write(hash.digest("hex"));
  ' "${TEMPLATE_PATH}" "${SEED_DIR}/seed-data.js" "${SEED_DIR}/settings.js")"
  SEEDED_HASH=""
  if [ -f "${SEED_HASH_MARKER}" ]; then
    SEEDED_HASH="$(node -e 'const fs = require("fs"); const file = process.argv[1]; process.stdout.write(fs.readFileSync(file, "utf8").trim());' "${SEED_HASH_MARKER}")"
  fi

  if [ "${FORCE_IMPORT}" = "true" ] || [ "${FORCE_IMPORT}" = "1" ] || [ ! -f "${SEED_MARKER}" ] || [ "${SEED_HASH}" != "${SEEDED_HASH}" ]; then
    node "${SEED_DIR}/seed-data.js"
    printf '%s\n' "${SEED_HASH}" > "${SEED_HASH_MARKER}"
    date -u +"%Y-%m-%dT%H:%M:%SZ" > "${SEED_MARKER}"
    echo "[fiot-nodered] Flow + credentials seeded into /data"
  fi
fi

exec /usr/src/node-red/entrypoint.sh "$@"
