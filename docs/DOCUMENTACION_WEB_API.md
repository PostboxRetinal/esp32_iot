# Documentación de página web y API

Este documento resume qué hace la página web, qué expone la API y cómo se conectan MQTT, Node-RED y MySQL en el proyecto.

Si necesitas la guía de comandos MQTT o probar sin hardware, ver [GUIA_ESTADOS_MQTT.md](GUIA_ESTADOS_MQTT.md) y [../simulator/README.md](../simulator/README.md).

## Arquitectura

- ESP32 o simulador publica telemetría JSON en `TOPICO_DATOS`.
- Node-RED recibe la telemetría, normaliza campos, calcula riesgo y escribe en MySQL.
- MySQL guarda datos brutos, estados, eventos, incidencias, datos limpios y análisis mensual.
- La API Express consulta MySQL, publica comandos MQTT y expone datos para la web.
- La página web consume `/api/*` desde el mismo servicio Express.
- La limpieza por lote se ejecuta en Node-RED y se dispara desde la web a través de la API.

## Página web

La web está en `api/public` y se sirve desde el contenedor `api` en `http://localhost:3001`.

### Dashboard

- Lista nodos activos por `id_habitacion` usando `GET /api/nodes`.
- Permite filtrar por búsqueda, contexto de habitación y estado de riesgo.
- Muestra si un nodo está en línea usando la última marca de tiempo recibida.
- El panel de detalle muestra contexto, riesgo y motivo de activación en la parte superior.
- El motivo de activación viene de `eventos_actuadores.motivo_activacion`; si no existe, usa `razon_riesgo`.
- El último comando enviado aparece como chip compacto y destacado debajo de los botones.
- Permite enviar contexto `LIBRE`, `RESERVADA` o `FUMIGACION` al nodo seleccionado.
- Grafica temperatura/humedad y gases PH3/CO con Chart.js.
- Lista las últimas incidencias de calidad del nodo seleccionado.
- Recibe actualizaciones periódicas con Server-Sent Events desde `GET /api/stream/latest`.

### Análisis de datos

- Muestra totales de brutas, pendientes, limpias, incidencias, análisis y eventos.
- Muestra últimas fechas de medición bruta, limpia, incidencia, análisis y evento.
- Muestra desglose de calidad por `limpio = 0/1`.
- Muestra desglose de riesgo por `NORMAL`, `ALERTA`, `EMERGENCIA` e `INVALIDO`.
- Muestra desglose de incidencias por tipo.
- Incluye botón `Limpiar lote (100)` para disparar la limpieza implementada en Node-RED.
- Incluye el botón para disparar el análisis mensual de 30 días.
- Tabla `Brutas pendientes de limpieza` muestra registros `mediciones_brutas.limpio = 0`.
- Tabla `Incidencias recientes` muestra problemas detectados en calidad de datos.
- Tabla `Datos limpios recientes` muestra registros ya validados o imputados.
- Tabla `Análisis mensual` muestra resumen de `analisis_mediciones`.
- Tabla `Eventos actuadores recientes` muestra comandos automáticos emitidos por política de riesgo.

## API Express

La API está en `api/server.js` y sus rutas están bajo `/api`.

### Salud

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `/api/health` | Verifica que el servicio Express responde. |

### Nodos y control

| Metodo | Ruta | Uso |
| --- | --- | --- |
| GET | `/api/nodes` | Lista la última medición de cada habitación. Acepta `estado`, `contexto`, `limit`, `offset`. |
| GET | `/api/nodes/:id/latest` | Devuelve la última medición de una habitación y el último motivo de activación. |
| GET | `/api/nodes/:id/series` | Devuelve serie histórica para gráficas. Acepta `from`, `to`, `limit` y `recent=1|true`. |
| GET | `/api/nodes/:id/incidencias` | Devuelve incidencias recientes de una habitación. |
| POST | `/api/nodes/:id/state` | Publica comando MQTT con `estado` dirigido a la habitación. |
| GET | `/api/stream/latest` | SSE con últimos nodos para refresco en tiempo real. |

Payload para cambiar estado:

```json
{
  "estado": "LIBRE"
}
```

Respuesta esperada:

```json
{
  "ok": true,
  "payload": {
    "estado": "LIBRE",
    "id_habitacion": "HTL-N-P1-103"
  }
}
```

### Análisis

| Metodo | Ruta | Uso |
| --- | --- | --- |
| GET | `/api/analysis/summary` | Totales, últimas fechas, desglose de calidad, riesgos e incidencias por tipo. |
| GET | `/api/analysis/brutas` | Lista mediciones brutas. Acepta `limpio=0/1`, `id_habitacion`, `limit`. |
| GET | `/api/analysis/limpias` | Lista mediciones limpias con habitación, contexto y riesgo. |
| GET | `/api/analysis/incidencias` | Lista incidencias globales. Acepta `id_habitacion`, `limit`. |
| GET | `/api/analysis/eventos` | Lista eventos de actuadores y motivos de activación. |
| GET | `/api/analysis/analisis` | Lista registros de `analisis_mediciones` con estadísticos del periodo. |
| POST | `/api/analysis/clean` | Solicita a Node-RED limpiar un lote de 100 registros pendientes. |
| POST | `/api/analysis/monthly` | Solicita a Node-RED generar el análisis mensual de 30 días. |

`POST /api/analysis/clean` y `POST /api/analysis/monthly` solo disparan flujos asíncronos de Node-RED. La API responde `202` y luego hay que verificar el resultado en la web o en MySQL.

## Limpieza de datos

La limpieza vive en la pestaña Node-RED `HTL-IOT-LIMPIEZA`.

Si quieres probar estados por MQTT antes o después de la limpieza, consulta [GUIA_ESTADOS_MQTT.md](GUIA_ESTADOS_MQTT.md).

Flujo operativo:

1. La web llama `POST /api/analysis/clean`.
2. Express llama a Node-RED en `POST /api/limpieza/lote`.
3. Node-RED responde rápido con `202` y dispara `LIMPIAR_100`.
4. Node-RED selecciona hasta 100 registros de `mediciones_brutas` con `limpio = 0`.
5. El flujo calcula medianas por habitación para imputación.
6. Cada registro se valida por completitud, formato, rangos, duplicados y temporalidad.
7. Si el registro es recuperable, se inserta en `mediciones_limpias`.
8. Si tiene problema relevante, se inserta en `incidencias`.
9. Al terminar cada registro procesado, se marca `mediciones_brutas.limpio = 1`.

Reglas principales:

- Registros con 1 o 2 columnas medidas con error se imputan con mediana por habitación.
- Registros con más de 2 columnas medidas con error se registran como incidencia y no generan limpia.
- Valores `0` en columnas medidas se tratan como inválidos para `mediciones_limpias`.
- Incidencias puramente temporales de intervalo se filtran antes de insertar, para no llenar la tabla con ruido operativo.

## Tablas de MySQL

| Tabla | Función |
| --- | --- |
| `mediciones_brutas` | Guarda la telemetría original del ESP32 o simulador. Incluye `limpio` para saber si ya fue procesada. |
| `estados_medicion` | Guarda riesgo calculado, razón de riesgo y color de alerta por medición. |
| `eventos_actuadores` | Guarda comandos automáticos emitidos por política de riesgo, motivo de activación e intervalo objetivo. |
| `mediciones_limpias` | Guarda valores validados o imputados, sin ceros en columnas medidas. |
| `incidencias` | Guarda errores, observaciones, duplicados, incompletos, formatos inválidos y atípicos. |
| `analisis_mediciones` | Guarda análisis de 30 días por habitación con estadística descriptiva y relaciones. |

## Vistas de MySQL

| Vista | Función |
| --- | --- |
| `vw_mediciones_estado` | Une mediciones brutas con estado de riesgo para consultas de dashboard. |
| `vw_incidencias_medicion` | Une incidencias con la medición bruta para trazabilidad temporal. |

## Análisis mensual

El inject Node-RED `ANALISIS MENSUAL (ULTIMO MES)` calcula datos de los últimos 30 días desde `mediciones_limpias` y escribe en `analisis_mediciones`. La API lo expone con `POST /api/analysis/monthly`, que llama internamente a `POST /api/analisis/mensual` en Node-RED.

Campos importantes:

- Periodo, total de registros, fecha inicio, fecha fin y fecha de generación.
- Promedio, mediana, moda, mínimo, máximo, rango, desviación estándar y varianza.
- Conteo fuera de rango y anomalías por temperatura, humedad, fosfina y CO.
- Correlación temperatura-humedad y fosfina-CO.
- JSON de distribución de categorías, patrones temporales, relaciones, comparación de periodos, justificación y limitaciones.

## Variables de entorno relevantes

| Variable | Uso |
| --- | --- |
| `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` | Conexión API/Node-RED a MySQL. |
| `MQTT_SERVER`, `MQTT_PORT`, `MQTT_USER`, `MQTT_PASS` | Conexión a broker MQTT. |
| `TOPICO_DATOS` | Topic donde ESP32 o simulador publican telemetría. |
| `TOPICO_COMANDOS` | Topic donde API y Node-RED publican comandos. |
| `NODE_RED_BASE_URL` | URL interna que usa la API para llamar a Node-RED. En Docker es `http://nodered:1880`. |
| `NODE_RED_CLEAN_URL` | URL opcional para sobrescribir el endpoint exacto de limpieza. |
| `NODE_RED_MONTHLY_ANALYSIS_URL` | URL opcional para sobrescribir el endpoint exacto de análisis mensual. |
| `NODE_RED_TIMEOUT_MS` | Timeout en ms para llamadas de la API a Node-RED. |
| `SSE_INTERVAL_MS` | Intervalo de refresco del stream SSE de la web. |
| `SAMPLE_MS_NORMAL`, `SAMPLE_MS_ALERTA`, `SAMPLE_MS_EMERGENCIA` | Intervalos objetivo que Node-RED manda según riesgo. |
| `TEMP_MIN_C`, `TEMP_MAX_C`, `HUM_MIN_PCT`, `HUM_MAX_PCT` | Rangos de calidad para limpieza. |
| `MQ135_RAW_MIN`, `MQ135_RAW_MAX`, `MQ7_RAW_MIN`, `MQ7_RAW_MAX` | Rangos de calidad para sensores de gas. |

## Operación recomendada

1. Levantar servicios con `docker compose up --build -d`.
2. Verificar stack con `bash scripts/verify-mysql.sh`.
3. Abrir web en `http://localhost:3001`.
4. Revisar Dashboard para estado en tiempo real y comandos de contexto.
5. Abrir Análisis de datos para ver pendientes, incidencias, limpias y análisis mensual.
6. Usar `Limpiar lote (100)` cuando existan registros pendientes y generar el análisis mensual cuando quieras refrescar `analisis_mediciones`.
7. Ejecutar el inject `ANALISIS MENSUAL (ULTIMO MES)` en Node-RED para actualizar `analisis_mediciones`.

## Consideraciones

- La limpieza por lote es asíncrona: la API confirma que Node-RED recibió la solicitud, no que el lote completo ya terminó.
- El botón de limpieza no usa `sp_limpiar_datos_iot`; ese procedimiento borra datos y solo debe usarse para reinicialización controlada.
- Si Node-RED no responde, `POST /api/analysis/clean` devuelve error 502 o 504.
- Si el broker MQTT no está conectado, `POST /api/nodes/:id/state` devuelve error 503.
