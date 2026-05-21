# Recursos de Node-RED

- `flows.json`: flujo de ingesta, procesamiento, simulación, persistencia y API REST.
- `package.json`: nodos extra de Node-RED requeridos por este flujo (`node-red-node-mysql`).
- `Dockerfile`: imagen personalizada de Node-RED que instala las dependencias de `package.json`.
- `seed-data.js` + `auto-import-entrypoint.sh`: carga inicial de `flows.json` y `flows_cred.json` en `/data`.

Cuando se ejecuta con Podman Compose (`podman-compose`), el proyecto sigue el enfoque oficial de la imagen Docker de Node-RED:

- Los datos de ejecución de Node-RED viven en un volumen nombrado montado en `/data`.
- Los nodos extra se instalan durante la construcción de la imagen desde `package.json`.
- En el primer arranque, el contenedor importa automáticamente el flujo y las credenciales en `/data` desde las plantillas del proyecto y las variables de entorno.
- El control de reimportación está disponible mediante las variables `NR_AUTO_IMPORT` y `NR_FORCE_IMPORT`.

Los valores de MQTT, MariaDB, CORS e identificadores de nodos se obtienen del archivo raíz `.env` y apuntan a Maqiatto/MariaDB.

La API REST se sirve directamente desde Node-RED en `http://localhost:1880/api/*`.
