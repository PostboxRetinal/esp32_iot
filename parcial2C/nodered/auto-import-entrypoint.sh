#!/bin/sh
set -eu

DATA_DIR="/data"
SEED_DIR="/opt/fiot-seed"
SEED_MARKER="${DATA_DIR}/.fiot_seeded"

AUTO_IMPORT="${NR_AUTO_IMPORT:-true}"
FORCE_IMPORT="${NR_FORCE_IMPORT:-false}"

if [ "${AUTO_IMPORT}" = "true" ] || [ "${AUTO_IMPORT}" = "1" ]; then
  if [ "${FORCE_IMPORT}" = "true" ] || [ "${FORCE_IMPORT}" = "1" ] || [ ! -f "${SEED_MARKER}" ]; then
    node "${SEED_DIR}/seed-data.js"
    date -u +"%Y-%m-%dT%H:%M:%SZ" > "${SEED_MARKER}"
    echo "[fiot-nodered] Flow + credentials seeded into /data"
  fi
fi

exec /usr/src/node-red/entrypoint.sh "$@"
