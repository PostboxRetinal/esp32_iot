# Parcial 3 - Arquitectura IoT Garage CO

## Resumen

Esta solución integra un nodo físico ESP32-S3, un nodo simulado en Node-RED, una base de datos MariaDB, una API REST servida por Node-RED y una aplicación web React para visualización y operación.

## Objetivo

Realizar limpieza y análisis de datos IoT, exponerlos mediante interfaces REST e integrarlos con una aplicación externa para visualización de información.

## Arquitectura

- Nodo hardware: configurable via `HARDWARE_DEVICE_ID` en `.env`
- Nodo simulado: configurable via `SIM_DEVICE_ID` en `.env`
- Backend IoT y API REST: Node-RED
- Persistencia: MariaDB
- Visualización: ReactTS
- Broker MQTT externo: Maqiatto

## Flujo de datos

1. El ESP32 lee MQ-7 y PIR cada 5 segundos.
2. Node-RED genera telemetría simulada para el segundo nodo.
3. Ambos nodos publican en `<MQTT_TOPIC_BASE>/telemetry`.
4. Node-RED valida, normaliza y clasifica la telemetría, guarda lecturas y genera alertas o comandos.
5. La API REST de Node-RED expone consultas para el dashboard y para clientes externos.
6. La aplicación web muestra estado, tendencias, alertas y auditoría de comandos.

## Protocolos y decisiones técnicas

### Conectividad de red

- **Capa física/enlace**: Wi-Fi 802.11 b/g/n en modo estación
- **Capa de red/transporte**: IPv4 + TCP
- **Sincronización temporal**: NTP (`pool.ntp.org`, `time.nist.gov`) para timestamps ISO-8601

### Mensajería IoT

- **Protocolo**: MQTT 3.1.1
- **Patrón**: Publicador/Suscriptor
- **Formato de datos**: JSON
- **Control de disponibilidad**:
  - Last Will (`status=offline`)
  - Heartbeat periódico (`.../heartbeat`)

### Persistencia

- **Base de datos**: MySQL/MariaDB
- **Tablas principales**:
  - `sensor_readings`: mediciones
  - `state_events`: estados derivados
  - `alerts`: eventos accionables
  - `actuator_commands`: auditoría de comandos MQTT generados por reglas
  - `devices`: registro de nodos

## Lógica de negocio

Umbrales de CO (PPM) y raw ADC:

- `< CO_SEGURO_MAX_PPM` y `< MQ7_ADC_SEGURO_RAW_MAX` -> `SEGURO`
- `< CO_PRECAUCION_MAX_PPM` y `< MQ7_ADC_PRECAUCION_RAW_MAX` -> `PRECAUCION`
- `< CO_PELIGRO_MAX_PPM` y `< MQ7_ADC_PELIGRO_RAW_MAX` -> `PELIGRO`
- `>=` cualquiera de los anteriores -> `CRITICO`

Regla de urgencia (doble disparador OR):

- Si `presencia == SI` y (`co_ppm > CO_URGENTE_MIN_PPM` o `raw_co_adc > MQ7_ADC_URGENTE_RAW_MIN`) -> sufijo `_URGENTE`

Regla de alerta:

- Se genera alerta cuando el estado derivado es `PELIGRO`, `CRITICO` o cualquier `_URGENTE`
- Severidad `CRITICAL` si `urgente == true`, de lo contrario `HIGH`

Fuente única de los umbrales compartidos (MQTT + DEVICE_ID + CO + ADC):

- Archivo `.env` en la raíz del proyecto
- Firmware: `scripts/generate_firmware_shared_config.py` genera `include/app_shared_config.generated.h` desde `.env` durante la compilación
- Node-RED: al iniciar el contenedor, `auto-import-entrypoint.sh` ejecuta `seed-data.js` sobre el template `/opt/fiot-seed/flows.template.json` (derivado de `nodered/flow_parcial3.json` durante el build), reemplazando tokens `${...}` con valores de `process.env` heredados de `.env`

Nota de conversión MQ-7:

- Si `raw_co_adc` llega a zona de saturación ADC (umbral `MQ7_ADC_SATURATION_RAW` en `.env`, default 4090), el firmware marca la condición como no confiable y aplica un valor controlado de demostración (`CO_URGENTE_MIN_PPM + 3.0`) manteniendo estado crítico. El simulador de Node-RED también respeta este umbral configurable.

## Seguridad y confiabilidad

- Broker externo Maqiatto con autenticación por usuario y clave
- Tópicos bajo el prefijo de usuario Maqiatto (`<maqiatto_user>/...`)
- Reintentos automáticos Wi-Fi/MQTT en firmware
- Heartbeat y LWT para visibilidad de disponibilidad
- Persistencia de eventos en MariaDB

## Componentes de despliegue

- `podman-compose.yml`
  - Orquestación con `podman-compose`
  - `fiot-nodered`
  - `fiot-mariadb`
  - `fiot-dashboard`
- `nodered/flow_parcial3.json`: procesamiento, simulación, persistencia y API REST
- `database/schema.sql`: modelo relacional
- `docs/PARCIAL3.md`: evidencia de implementación

## Interfaces Parcial 3

- API REST Node-RED: `http://localhost:1880/api/*` (requiere header `Authorization: Bearer <token>` donde `<token>` es el valor de `API_BEARER_TOKEN` definido en `.env`; generar con `openssl rand -hex 32`)
- Dashboard web: `http://localhost:5173` (ReactTS + Tailwind + Shadcn/UI + Sonner)
- UI "Sleek Minimalist": tema oscuro con notificaciones por severidad y actualización periódica desde REST

## Firmware ESP32-S3 N16R8

- Entorno PlatformIO por defecto: `esp32-s3-n16r8-uart`
- Entorno alternativo USB CDC nativo: `esp32-s3-n16r8-usbcdc`
- Flash: 16 MB
- PSRAM: 8 MB OPI
- LED RGB integrado: `RGB_BUILTIN` / GPIO48

Conexiones usadas por el firmware:

- MQ-7 `AOUT` -> GPIO4 (ADC, máximo 3.3 V; usar divisor si el módulo entrega 5 V)
- PIR `OUT` -> GPIO5
- LED de estado -> RGB integrado de la placa

Evitar GPIO26-GPIO32 porque suelen estar reservados para flash/PSRAM en ESP32-S3 con PSRAM, y evitar GPIO0/GPIO3/GPIO45/GPIO46 para cableado permanente porque son pines de arranque.

Compilar:

```sh
pio run -e esp32-s3-n16r8-uart
```

Usar `esp32-s3-n16r8-uart` cuando la placa aparece como puente USB a serie, por ejemplo `USB VID:PID=1A86:55D3` / `USB Single Serial`. Usar `esp32-s3-n16r8-usbcdc` solo si se conecta al USB nativo del ESP32-S3.
