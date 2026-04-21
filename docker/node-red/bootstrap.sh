#!/bin/sh
set -eu

CRED_FILE="/data/flows_cred.json"
SEED_FLOWS_FILE="/seed/flows.json"
SEED_SETTINGS_FILE="/seed/settings.js"

SYNC_FLOWS_FROM_SEED="${SYNC_FLOWS_FROM_SEED:-true}"
SYNC_SETTINGS_FROM_SEED="${SYNC_SETTINGS_FROM_SEED:-true}"

: "${MQTT_USER:?MQTT_USER is required}"
: "${MQTT_PASS:?MQTT_PASS is required}"
: "${MYSQL_USER:?MYSQL_USER is required}"
: "${MYSQL_PASSWORD:?MYSQL_PASSWORD is required}"

MQTT_CONFIG_NODE_ID="${MQTT_CONFIG_NODE_ID:-a1b2c3d4e5f60111}"
MYSQL_CONFIG_NODE_ID="${MYSQL_CONFIG_NODE_ID:-d9f3d61e3a4c0aaa}"

is_true() {
  case "${1:-}" in
    1|true|TRUE|yes|YES|on|ON) return 0 ;;
    *) return 1 ;;
  esac
}

if is_true "$SYNC_FLOWS_FROM_SEED" && [ -f "$SEED_FLOWS_FILE" ]; then
  cp "$SEED_FLOWS_FILE" /data/flows.json
fi

if is_true "$SYNC_SETTINGS_FROM_SEED" && [ -f "$SEED_SETTINGS_FILE" ]; then
  cp "$SEED_SETTINGS_FILE" /data/settings.js
fi

cat > "$CRED_FILE" <<EOF
{
  "${MQTT_CONFIG_NODE_ID}": {
    "user": "${MQTT_USER}",
    "password": "${MQTT_PASS}"
  },
  "${MYSQL_CONFIG_NODE_ID}": {
    "user": "${MYSQL_USER}",
    "password": "${MYSQL_PASSWORD}"
  }
}
EOF

exec /usr/src/node-red/entrypoint.sh
