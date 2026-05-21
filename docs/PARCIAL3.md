# Parcial 3 - Evidencia de implementación

Este documento mapea los requerimientos de `Parcial3-FIoT-2026-01.pdf` con la implementación del repositorio.

## 1. Dos nodos IoT activos

- Nodo real: `ESP32-GARAGE-CO-001`, firmware PlatformIO para ESP32-S3 N16R8 en `src/main.cpp`.
- Nodo simulado: `SIM-GARAGE-CO-001`, generado por el flujo Node-RED en `nodered/flows.json`.
- Ambos publican telemetría MQTT en `MQTT_TOPIC_BASE/telemetry` y Node-RED persiste los datos en MariaDB.

## 2. Plataforma IoT operativa

- Node-RED ingesta telemetría MQTT compartida, normaliza mensajes, recalcula estado, genera alertas y audita comandos.
- MariaDB almacena dispositivos, lecturas, eventos de estado, alertas y comandos.
- Node-RED expone la información por REST para aplicaciones externas.
- ReactTS consume la API y presenta un dashboard web.

## 3. Limpieza y análisis de datos

La limpieza se realiza en Node-RED, función `Normalize + derive state`:

- valida `device_id`;
- convierte `co_ppm` a número;
- normaliza `presencia` a booleano y texto `SI`/`NO`;
- convierte `raw_co_adc` a número;
- asigna timestamp cuando falta;
- **recalcula `estado` server-side usando lógica "Dual-Trigger" (OR)**:
  - Estado `SEGURO`: `co_ppm < CO_SEGURO_MAX_PPM` Y `raw_adc < MQ7_ADC_SEGURO_RAW_MAX`.
  - Estado `PRECAUCION`: Si `co_ppm` o `raw_adc` superan sus umbrales de SEGURO.
  - Estado `PELIGRO`: Si `co_ppm` o `raw_adc` superan sus umbrales de PRECAUCION.
  - Estado `CRITICO`: Si `co_ppm` o `raw_adc` superan sus umbrales de PELIGRO.
  - Urgencia (`_URGENTE`): Si hay presencia Y (`co_ppm` > URGENTE_PPM O `raw_adc` > URGENTE_RAW).
- descarta mensajes inválidos antes de persistir.

El análisis se expone desde Node-RED:

- `GET /api/analytics/summary?hours=24`: promedio, máximo, mínimo, alertas, nodos activos y urgencias.
- `GET /api/analytics/state-distribution?hours=24`: distribución de estados.
- `GET /api/analytics/timeseries?device_id=&hours=24`: serie temporal de CO por minuto y nodo (incluye `avg_raw_co_adc`).

Valor para el problema: permite identificar periodos de mayor concentración de CO, validar si hay presencia durante estados críticos y priorizar acciones de ventilación o evacuación. La incorporación de `raw_co_adc` permite verificar el trigger por cualquiera de los dos sensores.

## 4. Interfaces REST

La API REST está implementada 100% en Node-RED dentro de `nodered/flows.json`, usando nodos `http in`, `function`, `mysql`, `mqtt out` y `http response`.

| Método | Ruta | Propósito |
| --- | --- | --- |
| GET | `/api/health` | Estado de API, DB y configuración MQTT |
| GET | `/api/devices` | Lista nodos y último estado conocido |
| GET | `/api/readings/latest?device_id=&limit=` | Últimas lecturas de sensores |
| GET | `/api/alerts/recent?device_id=&hours=&limit=` | Alertas recientes |
| PUT | `/api/alerts/:id/ack` | Confirmar alerta pendiente |
| DELETE | `/api/alerts/:id` | Cierre lógico de alerta |
| GET | `/api/analytics/summary?hours=24` | Resumen analítico |
| GET | `/api/analytics/state-distribution?hours=24` | Distribución de estados |
| GET | `/api/analytics/timeseries?device_id=&hours=24` | Serie temporal de CO |
| GET | `/api/commands/recent?limit=` | Auditoría reciente de comandos |
| POST | `/api/commands/ventilation` | Publicar comando MQTT de ventilación |

Las operaciones se pueden probar en Postman usando `http://localhost:1880` como base URL. Los ejemplos `curl` equivalen a las mismas solicitudes REST.

Ejemplo de comando:

```sh
curl -X POST http://localhost:1880/api/commands/ventilation \
  -H 'Content-Type: application/json' \
  -d '{"action":"ENCENDER","reason":"Prueba desde API"}'
```

## 5. Dashboard web

El dashboard principal se implementa con Bun + ReactTS en `apps/dashboard`.

- URL local: `http://localhost:5173`
- Consume exclusivamente la API REST de Node-RED.
- **Alertas**: Consulta periódica de `/api/alerts/recent`, categorizadas por severidad (`INFO`, `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`) y mostradas mediante `sonner` con estilos CSS minimalistas. Las alertas incluyen el valor `raw_co_adc` en la descripción.
- **Estado de nodos**: Cálculo en tiempo real (`online` si `last_seen_at` >= `NOW()` - 90s, caso contrario `offline`). Cada nodo muestra tanto `co_ppm` como `raw_co_adc`.
- **Métricas**: La tarjeta principal muestra `co_ppm` y `raw_co_adc`. El gráfico de series temporales usa doble eje Y (ppm en cyan, raw ADC en ámbar).
- **UI**: Diseño "Sleek Minimalist" con Tailwind y Shadcn/UI.
- Enlaza Node-RED en `http://localhost:1880` como plataforma IoT de procesamiento.

Se decidió no usar Node-RED Dashboard. Node-RED queda como plataforma IoT, motor REST y backend de procesamiento; la visualización se realiza en una aplicación web React.

## 6. Aplicación web

La aplicación web es el dashboard ReactTS. Consume los endpoints REST de Node-RED con `fetch` desde `apps/dashboard/src/api.ts` y permite interacción con alertas y comandos.

## Ejecución

```sh
source ~/Documents/code/py_venvs/podman_compose/bin/activate
podman-compose --env-file .env -f podman-compose.yml up --build
```

Servicios esperados:

- Node-RED: `http://localhost:1880`
- API REST Node-RED: `http://localhost:1880/api/health`
- Dashboard React: `http://localhost:5173`
