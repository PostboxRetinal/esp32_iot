# Contrato MQTT

## Raíz de tópicos

`<maqiatto_user>/fiot/garage/<device_id>/...`

## Tópicos principales

- `<maqiatto_user>/fiot/garage/<device_id>/telemetry`
  - Publicador: ESP32 hardware y nodo simulado
  - Suscriptor: Node-RED
- `<maqiatto_user>/fiot/garage/<device_id>/heartbeat`
  - Publicador: ESP32 hardware
  - Suscriptor: Node-RED/monitoring
- `<maqiatto_user>/fiot/garage/<device_id>/status`
  - Publicador: ESP32 (online/offline retained + LWT)
  - Suscriptor: Node-RED/monitoring
- `<maqiatto_user>/fiot/garage/alerts/<device_id>`
  - Publicador: Node-RED
  - Suscriptor: dashboard/notificaciones

## Payload de telemetría (requerido)

```json
{
  "device_id": "ESP32-GARAGE-CO-001",
  "timestamp": "2026-04-14T10:23:45-05:00",
  "co_ppm": 18.4,
  "presencia": "SI",
  "estado": "PELIGRO"
}
```

Campos aceptados adicionales:

- `message_id` (entero incremental)
- `raw_co_adc` (ADC crudo)

## Reglas de validación

- `device_id`: string no vacío
- `timestamp`: string ISO-8601 (si falta, Node-RED usa hora del servidor)
- `co_ppm`: numérico
- `presencia`: `SI`/`NO` (o equivalentes booleanos)
- `estado`: recalculado en servidor para consistencia

## QoS y retención recomendados

- `telemetry`: QoS 1, retain false
- `heartbeat`: QoS 0/1, retain true (último estado de vida)
- `status`: QoS 1, retain true
- `alerts`: QoS 1, retain false

> Nota: el firmware actual con `PubSubClient` publica con QoS 0. En este diseño, la confiabilidad se refuerza con reconexión automática, heartbeat y persistencia broker-side.

## Identificadores de nodo esperados

- Hardware: `ESP32-GARAGE-CO-001`
- Simulado: `SIM-GARAGE-CO-001`

Node-RED distingue la fuente exclusivamente por `device_id`.

## Regla Maqiatto para tópicos

- Maqiatto requiere usar tópicos bajo tu prefijo de usuario.
- En este proyecto, ese prefijo se define con `MQTT_TOPIC_BASE`.
- Ejemplo recomendado en `infrastructure/.env`:
  - `MQTT_TOPIC_BASE=tu_usuario_maqiatto/fiot/garage`
