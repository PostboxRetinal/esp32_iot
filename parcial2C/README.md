# Parcial2 - Arquitectura IoT Garage CO

## Resumen

Este proyecto implementa una solución IoT híbrida con dos nodos de telemetría:

- **Nodo hardware ESP32 (Wemos D1 R32)**: `ESP32-GARAGE-CO-001`
- **Nodo simulado (Node-RED)**: `SIM-GARAGE-CO-001`

Ambos publican telemetría de CO/PIR vía MQTT usando Maqiatto como broker externo. Node-RED centraliza procesamiento, clasificación de estados/alertas y persistencia en MySQL/MariaDB.

## Protocolos y decisiones técnicas

### 1) Conectividad de red

- **Capa física/enlace**: Wi-Fi 802.11 b/g/n (modo estación en ESP32)
- **Capa de red/transporte**: IPv4 + TCP
- **Sincronización temporal**: NTP (`pool.ntp.org`, `time.nist.gov`) para timestamp ISO-8601

### 2) Mensajería IoT

- **Protocolo**: MQTT 3.1.1 (broker externo Maqiatto)
- **Patrón**: Publicador/Suscriptor (desacopla adquisición, procesamiento y almacenamiento)
- **Formato de datos**: JSON
- **Control de disponibilidad**:
  - Last Will (`status=offline`)
  - Heartbeat periódico (`.../heartbeat`)

### 3) Persistencia

- **Base de datos**: MySQL/MariaDB
- **Persistencia separada por dominio**:
  - `sensor_readings`: mediciones
  - `state_events`: estados derivados
  - `alerts`: eventos accionables
  - `devices`: registro de nodos

## Flujo de datos

1. ESP32 lee MQ-7 y PIR cada 5 segundos.
2. Firmware clasifica estado (`SEGURO`, `PRECAUCION`, `PELIGRO`, `CRITICO`) y aplica urgencia cuando hay presencia con CO crítico (`CRITICO_URGENTE`).
3. ESP32 publica JSON en `fiot/garage/<device_id>/telemetry`.
4. Node-RED consume `fiot/garage/+/telemetry`, valida payload, recalcula estado/urgencia (validación server-side) con umbrales tomados desde `include/app_config.h` y enruta por `device_id`.
5. Node-RED inserta en MySQL tablas de lecturas, estados y alertas.
6. Cuando aplica alerta, Node-RED publica evento en `fiot/garage/alerts/<device_id>`.

## Lógica de negocio (estado y alertas)

Umbrales de CO (PPM):

- `< CO_SEGURO_MAX_PPM`  -> `SEGURO`
- `CO_SEGURO_MAX_PPM .. < CO_PRECAUCION_MAX_PPM` -> `PRECAUCION`
- `CO_PRECAUCION_MAX_PPM .. < CO_PELIGRO_MAX_PPM` -> `PELIGRO`
- `>= CO_PELIGRO_MAX_PPM` -> `CRITICO`

Fuente única de estos umbrales:

- Firmware: `include/app_config.h`
- Node-RED: al importar el flujo, `nodered/seed-data.js` lee `app_config.h` y reemplaza tokens del template para mantener consistencia.

Regla de urgencia:

- Si `presencia == SI` y `co_ppm > CO_URGENTE_MIN_PPM` -> estado `CRITICO_URGENTE`

Regla de alerta:

- Generar alerta cuando `co_ppm >= CO_PELIGRO_MAX_PPM`
- Severidad `CRITICAL` si además `presencia == SI`, de lo contrario `HIGH`

Nota de conversión MQ-7:

- Si `raw_co_adc` llega a zona de saturación ADC (`>= 4090`), el firmware marca condición no confiable y aplica un fallback controlado de ppm para demo (`25.0`) manteniendo estado crítico.

## Seguridad y confiabilidad aplicadas

- Broker externo Maqiatto con autenticación por usuario/clave
- Tópicos bajo prefijo de usuario Maqiatto (`<maqiatto_user>/...`)
- Reintentos automáticos Wi-Fi/MQTT en firmware
- Heartbeat y LWT para visibilidad de disponibilidad
- Persistencia de eventos en MySQL/MariaDB

## Componentes de despliegue

- `infrastructure/docker-compose.yml`
  - Orquestado con `podman-compose`
  - `fiot-nodered`
  - `fiot-mariadb`
- Broker MQTT externo: `maqiatto.com`
- `nodered/flows.json` (procesamiento y simulación)
- `database/schema.sql` (modelo relacional)
