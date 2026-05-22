# Recursos de Node-RED

- `flows.json`: flujo de ingesta, procesamiento, simulación, persistencia y API REST.
- `package.json`: nodos extra de Node-RED requeridos por este flujo (`node-red-node-mysql`).
- `Dockerfile`: imagen personalizada de Node-RED que instala las dependencias de `package.json`.
- `seed-data.js` + `auto-import-entrypoint.sh`: carga inicial de `flows.json` y `flows_cred.json` cifrado en `/data`. Las credenciales se cifran con `aes-256-ctr` usando `NODE_RED_CREDENTIAL_SECRET`.

Cuando se ejecuta con Podman Compose (`podman-compose`), el proyecto sigue el enfoque oficial de la imagen Docker de Node-RED:

- Los datos de ejecución de Node-RED viven en un volumen nombrado montado en `/data`.
- Los nodos extra se instalan durante la construcción de la imagen desde `package.json`.
- En el primer arranque, el contenedor importa automáticamente el flujo y las credenciales en `/data` desde las plantillas del proyecto y las variables de entorno.
- El control de reimportación está disponible mediante las variables `NR_AUTO_IMPORT` y `NR_FORCE_IMPORT`.

Los valores de MQTT, MariaDB, CORS, identificadores de nodos y umbrales compartidos (CO_PPM + ADC) se obtienen del archivo raíz `.env` y apuntan a Maqiatto/MariaDB.

La API REST se sirve directamente desde Node-RED en `http://localhost:1880/api/*`. Todas las rutas `/api/*` requieren `Authorization: Bearer <token>`, validado por `httpNodeMiddleware` en `settings.js` usando la variable `API_BEARER_TOKEN`. Las solicitudes `OPTIONS` se responden con `204` automáticamente para suportar CORS preflight.
