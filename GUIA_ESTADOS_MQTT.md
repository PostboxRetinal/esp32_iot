# Guia practica: cambiar estados por MQTT (ESP32 y simulador)

Esta guia explica como controlar por broker MQTT:
- contexto de habitacion (`LIBRE`, `RESERVADA`, `FUMIGACION`),
- estado del ciclo (`INICIAR`, `PAUSA`),
- frecuencia de envio (`sample_interval_ms`),
- pruebas de PIR y validacion de que el cambio realmente se aplico.

## 1) Como funciona el control (resumen rapido)

- El dispositivo (ESP32 real o `simulator/simulate_nodes.py`) publica telemetria en `TOPICO_DATOS`.
- Ese mismo dispositivo escucha comandos en `TOPICO_COMANDOS/device_id`.
- Cuando recibe comando valido, actualiza su estado interno.
- El siguiente mensaje de telemetria ya sale con el nuevo estado.

## 2) Donde esta implementado

- Firmware ESP32 que interpreta comandos MQTT:
  - `src/main.cpp` (funcion `callback`)
- Configuracion de topics y broker del firmware:
  - `include/config_template.h`
- Simulador con la misma logica de comandos:
  - `simulator/simulate_nodes.py` (`on_message`)
- Flujo Node-RED con injects listos para estados:
  - `flows.json` (nodos `Contexto LIBRE`, `Contexto RESERVADA`, `Contexto FUMIGACION`)

## 3) Campos JSON que entiende el sistema

Comando minimo:

```json
{
  "msg": "INICIAR",
  "estado": "LIBRE"
}
```

Campos disponibles:
- `msg`: `INICIAR` o `PAUSA`
- `estado`: `LIBRE`, `RESERVADA`, `FUMIGACION`
- `sample_interval_ms`: frecuencia de envio en ms
- `intervalo_ms`: alias compatible para frecuencia
- `device_id`: obligatorio para enrutar el comando a un nodo concreto

Rangos:
- intervalo minimo: `1000` ms
- intervalo maximo: `60000` ms

## 4) Preparacion antes de enviar comandos

1. Verifica variables en `.env`:
   - `MQTT_SERVER`, `MQTT_PORT`, `MQTT_USER`, `MQTT_PASS`
   - `TOPICO_DATOS`, `TOPICO_COMANDOS`
  - `DEVICE_ID` si vas a probar los ejemplos de shell con tu nodo local
2. Levanta servicios:
   - `docker compose up --build -d`
3. Verifica backend:
   - `bash scripts/verify-mysql.sh`

## 5) Cambiar estados desde Node-RED (sin terminal)

1. Abre `http://localhost:1880`.
2. En el flujo usa los injects:
   - `Contexto LIBRE`
   - `Contexto RESERVADA`
   - `Contexto FUMIGACION`
3. Haz click en el boton del inject deseado.
4. Node-RED publica en `TOPICO_COMANDOS/device_id`.
5. El dispositivo aplica el contexto y lo reporta en la siguiente telemetria.

## 6) Cambiar estados por broker con comando (terminal)

### Opcion A: `mosquitto_pub` local

```bash
mosquitto_pub -h "$MQTT_SERVER" -p "$MQTT_PORT" -u "$MQTT_USER" -P "$MQTT_PASS" -t "$TOPICO_COMANDOS/ESP32-HW-01" -m '{"msg":"INICIAR","estado":"LIBRE","sample_interval_ms":15000,"device_id":"ESP32-HW-01"}' -q 1
```

### Opcion B: sin instalar nada (usando Docker)

```bash
docker run --rm eclipse-mosquitto mosquitto_pub -h "$MQTT_SERVER" -p "$MQTT_PORT" -u "$MQTT_USER" -P "$MQTT_PASS" -t "$TOPICO_COMANDOS/ESP32-HW-01" -m '{"msg":"INICIAR","estado":"LIBRE","sample_interval_ms":15000,"device_id":"ESP32-HW-01"}' -q 1
```

Comandos tipicos:

```bash
# Cambiar a RESERVADA
docker run --rm eclipse-mosquitto mosquitto_pub -h "$MQTT_SERVER" -p "$MQTT_PORT" -u "$MQTT_USER" -P "$MQTT_PASS" -t "$TOPICO_COMANDOS/ESP32-HW-01" -m '{"msg":"INICIAR","estado":"RESERVADA","sample_interval_ms":15000,"device_id":"ESP32-HW-01"}' -q 1

# Cambiar a FUMIGACION
docker run --rm eclipse-mosquitto mosquitto_pub -h "$MQTT_SERVER" -p "$MQTT_PORT" -u "$MQTT_USER" -P "$MQTT_PASS" -t "$TOPICO_COMANDOS/ESP32-HW-01" -m '{"msg":"INICIAR","estado":"FUMIGACION","sample_interval_ms":7000,"device_id":"ESP32-HW-01"}' -q 1

# Pausar envio
docker run --rm eclipse-mosquitto mosquitto_pub -h "$MQTT_SERVER" -p "$MQTT_PORT" -u "$MQTT_USER" -P "$MQTT_PASS" -t "$TOPICO_COMANDOS/ESP32-HW-01" -m '{"msg":"PAUSA","device_id":"ESP32-HW-01"}' -q 1

# Reanudar envio
docker run --rm eclipse-mosquitto mosquitto_pub -h "$MQTT_SERVER" -p "$MQTT_PORT" -u "$MQTT_USER" -P "$MQTT_PASS" -t "$TOPICO_COMANDOS/ESP32-HW-01" -m '{"msg":"INICIAR","device_id":"ESP32-HW-01"}' -q 1
```

Comando dirigido a un simulador especifico:

```bash
docker run --rm eclipse-mosquitto mosquitto_pub -h "$MQTT_SERVER" -p "$MQTT_PORT" -u "$MQTT_USER" -P "$MQTT_PASS" -t "$TOPICO_COMANDOS/$SIM_DEVICE_ID" -m '{"msg":"INICIAR","estado":"LIBRE","device_id":"SIM-NODO-01"}' -q 1
```

## 7) PIR: que se puede comandar y que no

ESP32 real:
- `presencia_pir` se lee del pin fisico.
- No hay comando MQTT para forzar PIR directamente en firmware.

Simulador:
- El PIR se genera por probabilidad (`SIM_MOTION_PROB`).
- Tampoco hay comando MQTT para forzarlo en tiempo real.

Si quieres probar un caso puntual de intruso, puedes inyectar telemetria manual en `TOPICO_DATOS`:

```bash
docker run --rm eclipse-mosquitto mosquitto_pub -h "$MQTT_SERVER" -p "$MQTT_PORT" -u "$MQTT_USER" -P "$MQTT_PASS" -t "$TOPICO_DATOS" -m '{"device_id":"TEST-PIR-01","habitacion":"HTL-N-P1-103","timestamp":"2026-04-21T12:00:00Z","contexto_hotel":"FUMIGACION","sistema_activo":true,"intervalo_envio_ms":7000,"fosfina_mq135":1800,"co_mq7":300,"presencia_pir":true,"evento_pir":"movimiento_iniciado","dht_ok":true,"temperatura_C":28,"humedad_pct":60}' -q 1
```

## 8) Como validar que el cambio si aplico

Validacion 1: logs de dispositivo
- ESP32 serial monitor debe mostrar mensajes tipo:
  - `Comando recibido: ...`
  - `Contexto de habitacion actualizado a: ...`
  - `Frecuencia de muestreo actualizada a: ...`

Validacion 2: telemetria MQTT
- Suscribete a `TOPICO_DATOS` y confirma:
  - `contexto_hotel`
  - `sistema_activo`
  - `intervalo_envio_ms`
  - `presencia_pir` y `evento_pir`

Validacion 3: MySQL
- Revisar en `mediciones_brutas`:
  - `contexto_hotel`, `sistema_activo`, `intervalo_envio_ms`, `presencia_pir`, `evento_pir`

## 9) Errores comunes

- Estado no cambia:
  - `estado` debe ser exactamente `LIBRE`, `RESERVADA` o `FUMIGACION`.
- Se pausa y no vuelve a enviar:
  - enviar `{ "msg": "INICIAR" }`.
- Comando parece correcto y no surte efecto:
  - revisar `TOPICO_COMANDOS` y credenciales del broker.
- Simulador no toma comando dirigido:
  - confirmar `device_id` exacto del simulador (`SIM_DEVICE_ID`).

## 10) Flujo operativo recomendado

1. Levantar stack: `docker compose up --build -d`
2. Verificar: `bash scripts/verify-mysql.sh`
3. Cambiar contexto (`LIBRE`, `RESERVADA`, `FUMIGACION`) desde Node-RED o `mosquitto_pub`
4. Verificar en telemetria MQTT y en MySQL
5. Ajustar `sample_interval_ms` segun escenario de prueba

Con este flujo puedes operar y demostrar el sistema completo por broker MQTT, sin modificar codigo.
