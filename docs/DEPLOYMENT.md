# Despliegue local con Podman Compose

## 1) Preparar variables de entorno

1. Copiar y ajustar variables en `.env` (o usar `.env.example` como base).
2. Mantener IDs de nodos distintos (`HARDWARE_DEVICE_ID` y `SIM_DEVICE_ID`).
3. Si cambias usuario/clave en `.env`, no necesitas editar `podman-compose.yml` ni `nodered/flow_parcial3.json`.
4. Definir `MQTT_TOPIC_BASE` con prefijo de usuario Maqiatto, por ejemplo:
  - `tu_usuario_maqiatto/fiot/garage`
5. Opcionalmente ajustar rama de comandos:
  - `MQTT_COMMAND_TOPIC` (topic de publicación de comandos)
  - `COMMANDS_ENABLED` (`true/false` para habilitar/deshabilitar publicación)

## 2) Levantar servicios

Desde la raíz del proyecto, iniciar el stack:

- MariaDB (persistencia)
- Node-RED (ingesta/procesamiento/simulador/API REST)
- Dashboard ReactTS (visualización web)
- Broker MQTT externo: Maqiatto (`maqiatto.com`)

> Nota: `fiot-nodered` se construye con `nodered/Dockerfile` para dejar preinstalado `node-red-node-mysql` siguiendo el enfoque oficial de imagen personalizada.

Comando recomendado (wrapper `podman-compose`):

- `source ~/Documents/code/py_venvs/podman_compose/bin/activate`

- `podman-compose --env-file .env -f podman-compose.yml up -d`

Detener y limpiar:

- `podman-compose --env-file .env -f podman-compose.yml down`

> Nota: en algunos sistemas `podman compose` delega a `docker-compose` y requiere socket de Podman. Para evitar ese problema, este proyecto usa el wrapper `podman-compose` dentro del virtualenv dedicado.

Servicios expuestos:

- Node-RED: `http://localhost:1880`
- API REST Node-RED: `http://localhost:1880/api/health`
- Dashboard ReactTS: `http://localhost:5173`

## 3) Importación automática del flujo (sin pasos manuales)

1. En el primer arranque (volumen `nodered_data` vacío), el contenedor carga automáticamente:
  - `flow_parcial3.json` en `/data/flows.json` (sin credenciales inline)
  - `flows_cred.json` cifrado en `/data/flows_cred.json` usando `NODE_RED_CREDENTIAL_SECRET` de `.env`
   - credenciales MQTT/MySQL extraídas de variables de `.env`
   - umbrales de CO y ADC (`CO_*`, `MQ7_ADC_*`) desde las variables de entorno de `.env`
   - espera activa de MariaDB antes de iniciar Node-RED para evitar errores de conexión por arranque desfasado
2. No es necesario importar desde la UI de Node-RED para arrancar el flujo base.
3. El seed se ejecuta una sola vez por volumen. Para forzar recarga del flujo:
  - establecer `NR_FORCE_IMPORT=true` en `.env` y reiniciar Node-RED, o
  - eliminar el volumen `nodered_data` y volver a levantar el stack.

> Importante: si ya tenías el volumen de MariaDB creado antes de esta versión, `schema.sql` no se vuelve a ejecutar automáticamente. Para incluir tablas o columnas nuevas (por ejemplo `actuator_commands` o `alerts.raw_co_adc`), aplica una migración manual o recrea el volumen `mariadb_data`.
> Reimportación: `auto-import-entrypoint.sh` compara el hash combinado de `flows.template.json`, `seed-data.js` y `settings.js`. Si cambia cualquiera, se aplica una reimportación automática al reiniciar el contenedor de Node-RED.
> Despliegue: usa `podman-compose --env-file .env -f podman-compose.yml down && podman-compose --env-file .env -f podman-compose.yml up --build -d` para asegurar que los cambios locales en el código y los volúmenes se propaguen correctamente.

## 4) Configurar firmware ESP32

Editar `include/app_config.h` (solo valores locales del firmware):

- `WIFI_SSID`, `WIFI_PASSWORD`
- `NTP_SERVER_*`, timings, pines

> Los valores MQTT y umbrales compartidos (`DEVICE_ID`, `MQTT_*`, `CO_*`, `MQ7_ADC_*`) se leen automáticamente de `.env` mediante el script `scripts/generate_firmware_shared_config.py` que genera `include/app_shared_config.generated.h` durante la compilación con PlatformIO. El contenedor Node-RED nunca accede a `app_config.h`.

Luego compilar y subir con PlatformIO, y abrir el monitor serie.

## 5) Verificación rápida

- Ver mensajes JSON de telemetría en el monitor serie.
- En Node-RED, validar que llegan mensajes de:
  - `ESP32-GARAGE-CO-001` (hardware)
  - `SIM-GARAGE-CO-001` (simulado)
- En MariaDB verificar inserciones en:
  - `sensor_readings`
  - `state_events`
  - `alerts` (solo cuando el estado derivado es `PELIGRO`, `CRITICO` o `_URGENTE`)
  - `actuator_commands` (cuando se emiten comandos)

También puedes ejecutar los `inject` de consulta histórica en Node-RED para obtener resúmenes rápidos de `sensor_readings`, `state_events`, `alerts` y `actuator_commands`.

## 6) Consideraciones de seguridad mínima

- No usar credenciales por defecto en laboratorio compartido.
- Usar credenciales dedicadas en Maqiatto.
- Mantener los tópicos autorizados en Maqiatto bajo tu prefijo de usuario.
- La API REST requiere `Authorization: Bearer <token>` en todas las solicitudes `/api/*`. El token se define en `API_BEARER_TOKEN` dentro de `.env` y se genera con `openssl rand -hex 32`. El dashboard React y la colección de Insomnia ya incluyen la variable correspondiente.
