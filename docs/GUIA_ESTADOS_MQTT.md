# Guia practica: cambiar estados por MQTT (ESP32 y simulador)

Esta guia explica como controlar por broker MQTT:
- contexto de habitacion (`LIBRE`, `RESERVADA`, `FUMIGACION`),
- frecuencia de envio (`sample_interval_ms`),
- pruebas de PIR y validacion de que el cambio realmente se aplico.

## 1) Como funciona el control (resumen rapido)

- El dispositivo (ESP32 real o `simulator/simulate_nodes.py`) publica telemetria en `TOPICO_DATOS`.
- Ese mismo dispositivo escucha comandos en `TOPICO_COMANDOS`.
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

Comando minimo (ESP32):

```json
{
  "estado": "LIBRE"
}
```

Campos disponibles:
- `estado`: `LIBRE`, `RESERVADA`, `FUMIGACION`
- `sample_interval_ms`: frecuencia de envio en ms
- `intervalo_ms`: alias compatible para frecuencia
- `id_habitacion`: opcional (si viene y no coincide, el comando se ignora)

Notas:
- `estado` debe venir en mayusculas para ser aceptado.
- Los comandos solo usan `estado` y `sample_interval_ms` (o `intervalo_ms`).

Rangos:
- intervalo minimo: `1000` ms
- intervalo maximo: `60000` ms

## 4) Preparacion antes de enviar comandos

1. Verifica variables en `.env`:
  - `MQTT_SERVER`, `MQTT_PORT`, `MQTT_USER`, `MQTT_PASS`
  - `TOPICO_DATOS`, `TOPICO_COMANDOS`
2. Si vas a probar con ESP32, ajusta `ID_HABITACION` en `include/config.h`.
3. Levanta servicios:
   - `docker compose up --build -d`
4. Verifica backend:
   - `bash scripts/verify-mysql.sh`

## 5) Cambiar estados desde Node-RED (sin terminal)

1. Abre `http://localhost:1880`.
2. En el flujo usa los injects:
   - `Contexto LIBRE`
   - `Contexto RESERVADA`
   - `Contexto FUMIGACION`
3. Haz click en el boton del inject deseado.
4. Node-RED publica en `TOPICO_COMANDOS` con `id_habitacion` en el payload.
5. El dispositivo aplica el contexto y lo reporta en la siguiente telemetria.

## 6) Cambiar estados por broker con comando (terminal)

### Opcion A: `mosquitto_pub` local

```bash
mosquitto_pub -h "$MQTT_SERVER" -p "$MQTT_PORT" -u "$MQTT_USER" -P "$MQTT_PASS" -t "$TOPICO_COMANDOS" -m '{"estado":"LIBRE","sample_interval_ms":15000,"id_habitacion":"HTL-N-P1-103"}' -q 1
```

### Opcion B: sin instalar nada (usando Docker)

```bash
docker run --rm eclipse-mosquitto mosquitto_pub -h "$MQTT_SERVER" -p "$MQTT_PORT" -u "$MQTT_USER" -P "$MQTT_PASS" -t "$TOPICO_COMANDOS" -m '{"estado":"LIBRE","sample_interval_ms":15000,"id_habitacion":"HTL-N-P1-103"}' -q 1
```

Comandos tipicos:

```bash
# Cambiar a RESERVADA
docker run --rm eclipse-mosquitto mosquitto_pub -h "$MQTT_SERVER" -p "$MQTT_PORT" -u "$MQTT_USER" -P "$MQTT_PASS" -t "$TOPICO_COMANDOS" -m '{"estado":"RESERVADA","sample_interval_ms":15000,"id_habitacion":"HTL-N-P1-103"}' -q 1

# Cambiar a FUMIGACION
docker run --rm eclipse-mosquitto mosquitto_pub -h "$MQTT_SERVER" -p "$MQTT_PORT" -u "$MQTT_USER" -P "$MQTT_PASS" -t "$TOPICO_COMANDOS" -m '{"estado":"FUMIGACION","sample_interval_ms":7000,"id_habitacion":"HTL-N-P1-103"}' -q 1

```

Comando dirigido a un simulador especifico:

```bash
docker run --rm eclipse-mosquitto mosquitto_pub -h "$MQTT_SERVER" -p "$MQTT_PORT" -u "$MQTT_USER" -P "$MQTT_PASS" -t "$TOPICO_COMANDOS" -m '{"estado":"LIBRE","id_habitacion":"HTL-N-P1-103"}' -q 1
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
docker run --rm eclipse-mosquitto mosquitto_pub -h "$MQTT_SERVER" -p "$MQTT_PORT" -u "$MQTT_USER" -P "$MQTT_PASS" -t "$TOPICO_DATOS" -m '{"id_habitacion":"HTL-N-P1-103","timestamp":"2026-04-21T12:00:00Z","contexto_hotel":"FUMIGACION","intervalo_envio_ms":7000,"fosfina_mq135":1800,"co_mq7":300,"presencia_pir":true,"temperatura_C":28,"humedad_pct":60}' -q 1
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
  - `intervalo_envio_ms`
  - `presencia_pir`

Validacion 3: MySQL
- Revisar en `mediciones_brutas`:
  - `contexto_hotel`, `intervalo_envio_ms`, `presencia_pir`

### Trazabilidad de datos erroneos

El sistema ya no descarta una medicion con problemas de calidad. La estrategia es:

- `mediciones_brutas` conserva el registro original y el flag `limpio` (0/1).
- `mediciones_limpias` guarda los registros corregidos o imputados.
- `incidencias` guarda el detalle del problema detectado (duplicados, incompletos, temporales, formato, atipicos).
- `vw_mediciones_estado` muestra mediciones con su estado de riesgo.
- Los injects de Node-RED para `RESUMEN_CALIDAD` e `INCIDENCIAS_RECIENTES` sirven para demostrar el analisis en clase.

## 9) Errores comunes

- Estado no cambia:
  - `estado` debe ser exactamente `LIBRE`, `RESERVADA` o `FUMIGACION`.
- Comando parece correcto y no surte efecto:
  - revisar `TOPICO_COMANDOS` y credenciales del broker.
- Simulador no toma comando dirigido:
  - confirmar `id_habitacion` exacto del simulador (`SIM_ID_HABITACION`).

## 10) Flujo operativo recomendado

1. Levantar stack: `docker compose up --build -d`
2. Verificar: `bash scripts/verify-mysql.sh`
3. Cambiar contexto (`LIBRE`, `RESERVADA`, `FUMIGACION`) desde Node-RED o `mosquitto_pub`
4. Verificar en telemetria MQTT y en MySQL
5. Ajustar `sample_interval_ms` segun escenario de prueba

Con este flujo puedes operar y demostrar el sistema completo por broker MQTT, sin modificar codigo.
