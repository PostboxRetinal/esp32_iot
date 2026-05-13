# Documentacion de pagina web y API

Este documento resume que hace la pagina web, que expone la API y como se conectan MQTT, Node-RED y MySQL en el proyecto.

## Arquitectura

- ESP32 o simulador publica telemetria JSON en `TOPICO_DATOS`.
- Node-RED recibe la telemetria, normaliza campos, calcula riesgo y escribe en MySQL.
- MySQL guarda datos brutos, estados, eventos, incidencias, datos limpios y analisis mensual.
- La API Express consulta MySQL, publica comandos MQTT y expone datos para la web.
- La pagina web consume `/api/*` desde el mismo servicio Express.
- La limpieza por lote se ejecuta en Node-RED y se dispara desde la web a traves de la API.

## Pagina web

La web esta en `api/public` y se sirve desde el contenedor `api` en `http://localhost:3001`.

### Dashboard

- Lista nodos activos por `id_habitacion` usando `GET /api/nodes`.
- Permite filtrar por busqueda, contexto de habitacion y estado de riesgo.
- Muestra si un nodo esta en linea usando la ultima marca de tiempo recibida.
- El panel de detalle muestra contexto, riesgo y motivo de activacion en la parte superior.
- El motivo de activacion viene de `eventos_actuadores.motivo_activacion`; si no existe, usa `razon_riesgo`.
- El ultimo comando enviado aparece como chip compacto y destacado debajo de los botones.
- Permite enviar contexto `LIBRE`, `RESERVADA` o `FUMIGACION` al nodo seleccionado.
- Grafica temperatura/humedad y gases PH3/CO con Chart.js.
- Lista las ultimas incidencias de calidad del nodo seleccionado.
- Recibe actualizaciones periodicas con Server-Sent Events desde `GET /api/stream/latest`.

### Analisis de datos

- Muestra totales de brutas, pendientes, limpias, incidencias, analisis y eventos.
- Muestra ultimas fechas de medicion bruta, limpia, incidencia, analisis y evento.
- Muestra desglose de calidad por `limpio = 0/1`.
- Muestra desglose de riesgo por `NORMAL`, `ALERTA`, `EMERGENCIA` e `INVALIDO`.
- Muestra desglose de incidencias por tipo.
- Incluye boton `Limpiar lote (100)` para disparar la limpieza implementada en Node-RED.
- Tabla `Brutas pendientes de limpieza` muestra registros `mediciones_brutas.limpio = 0`.
- Tabla `Incidencias recientes` muestra problemas detectados en calidad de datos.
- Tabla `Datos limpios recientes` muestra registros ya validados o imputados.
- Tabla `Analisis mensual` muestra resumen de `analisis_mediciones`.
- Tabla `Eventos actuadores recientes` muestra comandos automaticos emitidos por politica de riesgo.

## API Express

La API esta en `api/server.js` y sus rutas estan bajo `/api`.

### Salud

| Metodo | Ruta | Uso |
| --- | --- | --- |
| GET | `/api/health` | Verifica que el servicio Express responde. |

### Nodos y control

| Metodo | Ruta | Uso |
| --- | --- | --- |
| GET | `/api/nodes` | Lista la ultima medicion de cada habitacion. Acepta `estado`, `contexto`, `limit`, `offset`. |
| GET | `/api/nodes/:id/latest` | Devuelve la ultima medicion de una habitacion y el ultimo motivo de activacion. |
| GET | `/api/nodes/:id/series` | Devuelve serie historica para graficas. Acepta `from`, `to`, `limit`. |
| GET | `/api/nodes/:id/incidencias` | Devuelve incidencias recientes de una habitacion. |
| POST | `/api/nodes/:id/state` | Publica comando MQTT con `estado` dirigido a la habitacion. |
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

### Analisis

| Metodo | Ruta | Uso |
| --- | --- | --- |
| GET | `/api/analysis/summary` | Totales, ultimas fechas, desglose de calidad, riesgos e incidencias por tipo. |
| GET | `/api/analysis/brutas` | Lista mediciones brutas. Acepta `limpio=0/1`, `id_habitacion`, `limit`. |
| GET | `/api/analysis/limpias` | Lista mediciones limpias con habitacion, contexto y riesgo. |
| GET | `/api/analysis/incidencias` | Lista incidencias globales. Acepta `id_habitacion`, `limit`. |
| GET | `/api/analysis/eventos` | Lista eventos de actuadores y motivos de activacion. |
| GET | `/api/analysis/analisis` | Lista registros de `analisis_mediciones` con estadisticos del periodo. |
| POST | `/api/analysis/clean` | Solicita a Node-RED limpiar un lote de 100 registros pendientes. |

`POST /api/analysis/clean` no borra la base de datos. Solo dispara el flujo de limpieza por lote de Node-RED.

## Limpieza de datos

La limpieza vive en el tab Node-RED `HTL-IOT-LIMPIEZA`.

Flujo operativo:

1. La web llama `POST /api/analysis/clean`.
2. Express llama a Node-RED en `POST /api/limpieza/lote`.
3. Node-RED responde rapido con `202` y dispara `LIMPIAR_100`.
4. Node-RED selecciona hasta 100 registros de `mediciones_brutas` con `limpio = 0`.
5. El flujo calcula medianas por habitacion para imputacion.
6. Cada registro se valida por completitud, formato, rangos, duplicados y temporalidad.
7. Si el registro es recuperable, se inserta en `mediciones_limpias`.
8. Si tiene problema relevante, se inserta en `incidencias`.
9. Al terminar cada registro procesado, se marca `mediciones_brutas.limpio = 1`.

Reglas principales:

- Registros con 1 o 2 columnas medidas con error se imputan con mediana por habitacion.
- Registros con mas de 2 columnas medidas con error se registran como incidencia y no generan limpia.
- Valores `0` en columnas medidas se tratan como invalidos para `mediciones_limpias`.
- Incidencias puramente temporales de intervalo se filtran antes de insertar, para no llenar la tabla con ruido operativo.

## Tablas de MySQL

| Tabla | Funcion |
| --- | --- |
| `mediciones_brutas` | Guarda la telemetria original del ESP32 o simulador. Incluye `limpio` para saber si ya fue procesada. |
| `estados_medicion` | Guarda riesgo calculado, razon de riesgo y color de alerta por medicion. |
| `eventos_actuadores` | Guarda comandos automaticos emitidos por politica de riesgo, motivo de activacion e intervalo objetivo. |
| `mediciones_limpias` | Guarda valores validados o imputados, sin ceros en columnas medidas. |
| `incidencias` | Guarda errores, observaciones, duplicados, incompletos, formatos invalidos y atipicos. |
| `analisis_mediciones` | Guarda analisis de 30 dias por habitacion con estadistica descriptiva y relaciones. |

## Vistas de MySQL

| Vista | Funcion |
| --- | --- |
| `vw_mediciones_estado` | Une mediciones brutas con estado de riesgo para consultas de dashboard. |
| `vw_incidencias_medicion` | Une incidencias con la medicion bruta para trazabilidad temporal. |

## Analisis mensual

El inject Node-RED `ANALISIS MENSUAL (ULTIMO MES)` calcula datos de los últimos 30 dias desde `mediciones_limpias` y escribe en `analisis_mediciones`.

Campos importantes:

- Periodo, total de registros, fecha inicio, fecha fin y fecha de generacion.
- Promedio, mediana, moda, minimo, maximo, rango, desviacion estandar y varianza.
- Conteo fuera de rango y anomalias por temperatura, humedad, fosfina y CO.
- Correlacion temperatura-humedad y fosfina-CO.
- JSON de distribucion de categorias, patrones temporales, relaciones, comparacion de periodos, justificacion y limitaciones.

## Variables de entorno relevantes

| Variable | Uso |
| --- | --- |
| `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` | Conexion API/Node-RED a MySQL. |
| `MQTT_SERVER`, `MQTT_PORT`, `MQTT_USER`, `MQTT_PASS` | Conexion a broker MQTT. |
| `TOPICO_DATOS` | Topic donde ESP32 o simulador publican telemetria. |
| `TOPICO_COMANDOS` | Topic donde API y Node-RED publican comandos. |
| `NODE_RED_BASE_URL` | URL interna que usa la API para llamar a Node-RED. En Docker es `http://nodered:1880`. |
| `NODE_RED_CLEAN_URL` | URL opcional para sobrescribir el endpoint exacto de limpieza. |
| `SAMPLE_MS_NORMAL`, `SAMPLE_MS_ALERTA`, `SAMPLE_MS_EMERGENCIA` | Intervalos objetivo que Node-RED manda segun riesgo. |
| `TEMP_MIN_C`, `TEMP_MAX_C`, `HUM_MIN_PCT`, `HUM_MAX_PCT` | Rangos de calidad para limpieza. |
| `MQ135_RAW_MIN`, `MQ135_RAW_MAX`, `MQ7_RAW_MIN`, `MQ7_RAW_MAX` | Rangos de calidad para sensores de gas. |

## Operacion recomendada

1. Levantar servicios con `docker compose up --build -d`.
2. Verificar stack con `bash scripts/verify-mysql.sh`.
3. Abrir web en `http://localhost:3001`.
4. Revisar Dashboard para estado en tiempo real y comandos de contexto.
5. Abrir Analisis de datos para ver pendientes, incidencias, limpias y analisis mensual.
6. Usar `Limpiar lote (100)` cuando existan registros pendientes.
7. Ejecutar el inject `ANALISIS MENSUAL (ULTIMO MES)` en Node-RED para actualizar `analisis_mediciones`.

## Consideraciones

- La limpieza por lote es asincrona: la API confirma que Node-RED recibio la solicitud, no que el lote completo ya termino.
- El boton de limpieza no usa `sp_limpiar_datos_iot`; ese procedimiento borra datos y solo debe usarse para reinicializacion controlada.
- Si Node-RED no responde, `POST /api/analysis/clean` devuelve error 502 o 504.
- Si el broker MQTT no esta conectado, `POST /api/nodes/:id/state` devuelve error 503.
