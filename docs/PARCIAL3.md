# Parcial 3 - Evidencia de implementación

Este documento mapea los requerimientos de `Parcial3-FIoT-2026-01.pdf` con la implementación del repositorio.

## 1. Dos nodos IoT activos

- Nodo real: `ESP32-GARAGE-CO-001`, firmware PlatformIO para ESP32-S3 N16R8 en `src/main.cpp`.
- Nodo simulado: `SIM-GARAGE-CO-001`, generado por el flujo Node-RED en `nodered/flows.json`.
- Ambos publican telemetría MQTT bajo `MQTT_TOPIC_BASE` y Node-RED persiste los datos en MariaDB.

## 2. Plataforma IoT operativa

- Node-RED ingesta telemetría MQTT, normaliza mensajes, recalcula estado, genera alertas y audita comandos.
- MariaDB almacena dispositivos, lecturas, eventos de estado, alertas y comandos.
- ElysiaJS expone la información por REST para aplicaciones externas.
- ReactTS consume la API y presenta un dashboard web.

## 3. Limpieza y análisis de datos

La limpieza se realiza en Node-RED, función `Normalize + derive state`:

- valida `device_id`;
- convierte `co_ppm` a número;
- normaliza `presencia` a booleano y texto `SI`/`NO`;
- asigna timestamp cuando falta;
- recalcula `estado` server-side usando umbrales únicos desde `include/app_config.h`;
- descarta mensajes inválidos antes de persistir.

El análisis se expone desde ElysiaJS:

- `GET /api/analytics/summary?hours=24`: promedio, máximo, mínimo, alertas, nodos activos y urgencias.
- `GET /api/analytics/state-distribution?hours=24`: distribución de estados.
- `GET /api/analytics/timeseries?device_id=&hours=24`: serie temporal de CO por minuto y nodo.
- `GET /api/alerts/stream`: canal SSE para alertas MQTT en tiempo real.

Valor para el problema: permite identificar periodos de mayor concentración de CO, validar si hay presencia durante estados críticos y priorizar acciones de ventilación o evacuación.

## 4. Interfaces REST

La API REST está implementada con ElysiaJS en `apps/api`.

| Método | Ruta | Propósito |
| --- | --- | --- |
| GET | `/api/health` | Estado de API, DB y configuración MQTT |
| GET | `/api/devices` | Lista nodos y último estado conocido |
| GET | `/api/readings/latest?device_id=&limit=` | Últimas lecturas de sensores |
| GET | `/api/alerts/recent?hours=&limit=` | Alertas recientes |
| GET | `/api/alerts/stream` | Alertas en tiempo real (SSE) |
| PUT | `/api/alerts/:id/ack` | Confirmar alerta pendiente |
| DELETE | `/api/alerts/:id` | Cierre lógico de alerta |
| GET | `/api/analytics/summary?hours=24` | Resumen analítico |
| GET | `/api/analytics/state-distribution?hours=24` | Distribución de estados |
| GET | `/api/analytics/timeseries?device_id=&hours=24` | Serie temporal de CO |
| GET | `/api/commands/recent?limit=` | Auditoría reciente de comandos |
| POST | `/api/commands/ventilation` | Publicar comando MQTT de ventilación |

Ejemplo de comando:

```sh
curl -X POST http://localhost:3000/api/commands/ventilation \
  -H 'Content-Type: application/json' \
  -d '{"action":"ENCENDER","reason":"Prueba desde API"}'
```

## 5. Dashboard web

El dashboard principal se implementa con Bun + ReactTS en `apps/dashboard`.

- URL local: `http://localhost:5173`
- Consume exclusivamente la API REST de ElysiaJS.
- **Alertas en tiempo real**: Suscripción vía SSE (`/api/alerts/stream`), categorizadas por severidad (`INFO`, `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`) y mostradas mediante `sonner` con estilos CSS minimalistas.
- **Estado de nodos**: Cálculo en tiempo real (`online` si `last_seen_at` >= `NOW()` - 90s, caso contrario `offline`).
- **UI**: Diseño "Sleek Minimalist" con Tailwind y Shadcn/UI.
- Enlaza Node-RED en `http://localhost:1880` como plataforma IoT de procesamiento.

Se decidió no usar Node-RED Dashboard. Node-RED queda como plataforma IoT y la visualización se realiza en una aplicación web React, aceptando la desviación frente al literal del PDF.

## 6. Aplicación web

La aplicación web es el dashboard ReactTS. Consume los endpoints REST con `fetch` desde `apps/dashboard/src/api.ts` y permite interacción con alertas y comandos.

## Ejecución

```sh
source ~/Documents/code/py_venvs/podman_compose/bin/activate
podman-compose --env-file .env -f podman-compose.yml up --build
```

Servicios esperados:

- Node-RED: `http://localhost:1880`
- API ElysiaJS: `http://localhost:3000/api/health`
- Dashboard React: `http://localhost:5173`
