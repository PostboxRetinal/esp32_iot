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
4. Node-RED consume `fiot/garage/+/telemetry`, valida payload, recalcula estado/urgencia (validación server-side) y enruta por `device_id`.
5. Node-RED inserta en MySQL tablas de lecturas, estados y alertas.
6. Cuando aplica alerta, Node-RED publica evento en `fiot/garage/alerts/<device_id>`.

## Lógica de negocio (estado y alertas)

Umbrales de CO (PPM):

- `< 10`  -> `SEGURO`
- `10–14.99` -> `PRECAUCION`
- `15–29.99` -> `PELIGRO`
- `>= 30` -> `CRITICO`

Regla de urgencia:

- Si `presencia == SI` y `co_ppm >= 30` -> estado `CRITICO_URGENTE`

Regla de alerta:

- Generar alerta cuando `co_ppm >= 30`
- Severidad `CRITICAL` si además `presencia == SI`, de lo contrario `HIGH`

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
