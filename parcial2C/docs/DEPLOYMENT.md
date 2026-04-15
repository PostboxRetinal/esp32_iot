# Despliegue local (Podman)

## 1) Preparar variables de entorno

1. Copiar y ajustar variables en `infrastructure/.env` (o usar `infrastructure/.env.example` como base).
2. Mantener IDs de nodos distintos (`HARDWARE_DEVICE_ID` y `SIM_DEVICE_ID`).
3. Si cambias usuario/clave en `.env`, no necesitas editar `docker-compose.yml` ni `nodered/flows.json`.
4. Definir `MQTT_TOPIC_BASE` con prefijo de usuario Maqiatto, por ejemplo:
  - `tu_usuario_maqiatto/fiot/garage`
5. Opcionalmente ajustar rama de comandos:
  - `MQTT_COMMAND_TOPIC` (topic de publicación de comandos)
  - `COMMANDS_ENABLED` (`true/false` para habilitar/deshabilitar publicación)

## 2) Levantar servicios

Desde la raíz del proyecto, iniciar stack:

- MariaDB (persistencia)
- Node-RED (ingesta/procesamiento/simulador)
- Broker MQTT externo: Maqiatto (`maqiatto.com`)

> Nota: `fiot-nodered` se construye con `nodered/Dockerfile` para dejar preinstalado `node-red-node-mysql` siguiendo el enfoque oficial de imagen personalizada.

Comando recomendado (Podman nativo):

- `podman-compose --env-file infrastructure/.env -f infrastructure/docker-compose.yml up -d`

Detener y limpiar:

- `podman-compose --env-file infrastructure/.env -f infrastructure/docker-compose.yml down`

> Nota: en algunos sistemas `podman compose` delega a `docker-compose` y requiere socket de Podman. Para evitar ese problema, este proyecto usa `podman-compose` como ruta principal.

## 3) Importación automática del flujo (sin pasos manuales)

1. En el primer arranque (volumen `nodered_data` vacío), el contenedor carga automáticamente:
  - `flows.json` en `/data/flows.json`
  - credenciales MQTT/MySQL en `/data/flows_cred.json` usando variables de `infrastructure/.env`
  - umbrales de CO (`CO_SEGURO_MAX_PPM`, `CO_PRECAUCION_MAX_PPM`, `CO_PELIGRO_MAX_PPM`, `CO_URGENTE_MIN_PPM`) leyendo `include/app_config.h` montado en `/opt/fiot-seed/app_config.h`
  - espera activa de MariaDB antes de iniciar Node-RED para evitar errores de conexión por arranque desfasado
2. No es necesario importar desde la UI de Node-RED para arrancar el flujo base.
3. El seed se ejecuta una sola vez por volumen. Para forzar recarga del flujo:
  - establecer `NR_FORCE_IMPORT=true` en `.env` y reiniciar Node-RED, o
  - eliminar el volumen `nodered_data` y volver a levantar el stack.

> Importante: si ya tenías el volumen de MariaDB creado antes de esta versión, `schema.sql` no se vuelve a ejecutar automáticamente. Para incluir tablas nuevas (por ejemplo `actuator_commands`), aplica el script manualmente o recrea el volumen `mariadb_data`.

## 4) Configurar firmware ESP32

Editar `include/app_config.h`:

- `WIFI_SSID`, `WIFI_PASSWORD`
- `MQTT_BROKER_HOST` (`maqiatto.com`)
- `MQTT_BROKER_PORT`
- `MQTT_USERNAME`, `MQTT_PASSWORD`
- `MQTT_TOPIC_BASE` (debe incluir prefijo de usuario Maqiatto)
- `DEVICE_ID`

> Recomendación: mantener consistentes los datos del firmware (`app_config.h`) con los valores MQTT del backend (`.env`).

Luego compilar/subir con PlatformIO y abrir monitor serie.

## 5) Verificación rápida

- Ver mensajes JSON de telemetría en monitor serie.
- En Node-RED, validar que llegan mensajes de:
  - `ESP32-GARAGE-CO-001` (hardware)
  - `SIM-GARAGE-CO-001` (simulado)
- En MariaDB verificar inserciones en:
  - `sensor_readings`
  - `state_events`
  - `alerts` (solo cuando CO >= 22)
  - `actuator_commands` (cuando se emiten comandos)

También puedes ejecutar los inject de consulta histórica en Node-RED para obtener resúmenes rápidos de `sensor_readings`, `state_events`, `alerts` y `actuator_commands`.

## 6) Consideraciones de seguridad mínima

- No usar credenciales por defecto en laboratorio compartido.
- Usar credenciales dedicadas en Maqiatto.
- Mantener los tópicos autorizados en Maqiatto bajo tu prefijo de usuario.
