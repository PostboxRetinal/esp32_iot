# Organizacion del root y criterio de limpieza

Este repositorio integra tres partes:
1) firmware ESP32 (PlatformIO),
2) backend de procesamiento (Node-RED),
3) persistencia (MySQL).

## Resultado de la revision

Se eliminaron del root los archivos duplicados o de ejecucion indirecta:
- `init-db.sql` (duplicado): no era el archivo usado por Docker Compose.
- `verify-mysql.sh` (script suelto en root): se centralizo en `scripts/verify-mysql.sh`.

## Que archivo SQL si usa el sistema

El archivo realmente montado por Compose es:
- `docker/mysql/init-db.sql`

Referencia en `docker-compose.yml`:
- `./docker/mysql/init-db.sql:/docker-entrypoint-initdb.d/01-init-db.sql:ro,Z`

## Estructura recomendada despues de limpiar

Archivos root que si conviene mantener:
- `docker-compose.yml`
- `docker-compose.simulator.yml`
- `Dockerfile.nodered`
- `flows.json`
- `flows_cred.json`
- `settings.js`
- `platformio.ini`
- `.env`

Scripts operativos:
- `scripts/verify-mysql.sh`

Provisionamiento:
- `docker/mysql/init-db.sql`
- `docker/node-red/bootstrap.sh`

## Notas operativas

- Para validar stack ahora usa: `bash scripts/verify-mysql.sh`
- El script toma credenciales desde `.env` (no usa contrasenas hardcodeadas).
- Si borras `flows_cred.json`, Node-RED pedira reconfigurar credenciales MQTT/MySQL.
