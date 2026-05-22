# Contrato MQTT del sistema

## Raíz de tópicos

`<maqiatto_user>/fiot/garage`

## Tópicos principales

- `<maqiatto_user>/fiot/garage/telemetry`
  - Publicador: ESP32 hardware y nodo simulado
  - Suscriptor: Node-RED
  - `device_id` distingue el nodo dentro del payload
- `<maqiatto_user>/fiot/garage/<device_id>/heartbeat`
  - Publicador: ESP32 hardware
  - Suscriptor: Node-RED/monitoring
- `<maqiatto_user>/fiot/garage/<device_id>/status`
  - Publicador: ESP32 (online/offline retained + LWT)
  - Suscriptor: Node-RED/monitoring
- `<maqiatto_user>/fiot/garage/alerts`
  - Publicador: Node-RED
  - Suscriptor: dashboard/notificaciones
  - `device_id` distingue el nodo dentro del payload

## Payload de alerta esperado

```json
{
  "device_id": "SIM-GARAGE-CO-001",
  "timestamp": "2026-05-19T17:18:25.104Z",
  "severity": "HIGH",
  "message": "CO crítico sin presencia detectada.",
  "co_ppm": 32.7,
  "raw_co_adc": 3270,
  "presencia": "NO",
  "estado": "CRITICO",
  "urgente": 0
}
```

## Payload de telemetría esperado

```json
{
  "device_id": "ESP32-GARAGE-CO-001",
  "timestamp": "2026-04-14T10:23:45-05:00",
  "co_ppm": 18.4,
  "raw_co_adc": 1840,
  "co_mv": 115,
  "presencia": "SI",
  "estado": "PELIGRO"
}
```

Campos del payload de telemetría:

- `device_id` (string, requerido)
- `timestamp` (string ISO-8601, opcional — Node-RED asigna hora del servidor si falta)
- `co_ppm` (numérico, requerido)
- `raw_co_adc` (entero 0–4095, requerido)
- `presencia` (`SI`/`NO` o booleano, requerido)
- `estado` (string, opcional — Node-RED recalcula del lado del servidor si está presente)
- `message_id` (entero incremental, opcional)
- `co_mv` (mV calibrados, opcional — solo diagnóstico MQTT/Serial; no persiste en DB, no se expone en API ni dashboard)

## Reglas de validación

- `device_id`: string no vacío
- `timestamp`: string ISO-8601 (si falta, Node-RED usa la hora del servidor)
- `co_ppm`: numérico
- `raw_co_adc`: entero entre 0 y 4095 (validado por Node-RED)
- `presencia`: `SI`/`NO` (o equivalentes booleanos)
- `estado`: string opcional (Node-RED recalcula; ej: `SEGURO`, `PRECAUCION`, `PELIGRO`, `CRITICO`, `SEGURO_URGENTE`, `CRITICO_URGENTE`)

## QoS y retención recomendados

- `telemetry`: QoS 1, retain false
- `heartbeat`: QoS 0/1, retain true (último estado de vida)
- `status`: QoS 1, retain true
- `alerts`: QoS 1, retain false

> Nota: el firmware actual con `PubSubClient` publica con QoS 0. En este diseño, la confiabilidad se refuerza con reconexión automática, heartbeat y persistencia del lado del broker.

## Identificadores de nodo esperados

- Hardware: `ESP32-GARAGE-CO-001`
- Simulado: `SIM-GARAGE-CO-001`

Node-RED distingue la fuente exclusivamente por `device_id`.

## Regla de los tópicos (Maqiatto)

- Maqiatto requiere usar tópicos bajo tu prefijo de usuario.
- En este proyecto, ese prefijo se define con `MQTT_TOPIC_BASE` o con la variable de entorno `MQTT_BROKER_HOST` para distinguir brokers.
- Ejemplo recomendado en `.env`:
  - `MQTT_TOPIC_BASE=tu_usuario_maqiatto/fiot/garage`
