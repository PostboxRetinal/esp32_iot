# ESP32 IoT - Calidad de datos y simulador

Este repositorio incluye el flujo de ingestión en Node-RED, la base de datos MySQL y un simulador MQTT para validar reglas de calidad sin hardware.

La documentación completa de la página web y la API está en [docs/DOCUMENTACION_WEB_API.md](docs/DOCUMENTACION_WEB_API.md). Para control y pruebas por MQTT, ver [docs/GUIA_ESTADOS_MQTT.md](docs/GUIA_ESTADOS_MQTT.md).

## Limpieza de datos (Node-RED)

El flujo **HTL-IOT-LIMPIEZA** procesa por demanda lotes de 100 registros con `limpio = 0` y aplica:
- validación de registros incompletos
- detección de atípicos
- duplicados (batch + cache TTL)
- reglas temporales (huecos y pérdida de comunicación)
- homogeneidad de formato

Regla de imputación:
- 1-2 columnas con error -> imputación por mediana (por `id_habitacion`)
- >2 columnas con error -> se rechaza y se registra en `incidencias`
- `mediciones_limpias` no acepta valores `0` en columnas medidas; se tratan como atípicos y se imputan solo con medianas no cero.

Variables de entorno relacionadas (ver `.env`):
- `TEMP_MIN_C`, `TEMP_MAX_C`, `HUM_MIN_PCT`, `HUM_MAX_PCT`
- `MQ135_RAW_MIN`, `MQ135_RAW_MAX`, `MQ7_RAW_MIN`, `MQ7_RAW_MAX`

## Auditoría de datos

Consultas recomendadas (ejecutar en MySQL):

```sql
SELECT COUNT(*) AS faltan_claves
FROM mediciones_brutas
WHERE id_habitacion IS NULL OR id_habitacion = ''
  OR timestamp_origen IS NULL;

SELECT contexto_hotel, COUNT(*) AS total
FROM mediciones_brutas
GROUP BY contexto_hotel;

SELECT COUNT(*) AS temp_fuera_rango
FROM mediciones_brutas
WHERE temperatura_c IS NOT NULL AND (temperatura_c < -20 OR temperatura_c > 80);

SELECT COUNT(*) AS humedad_fuera_rango
FROM mediciones_brutas
WHERE humedad_pct IS NOT NULL AND (humedad_pct < 0 OR humedad_pct > 100);

SELECT COUNT(*) AS mq135_fuera_rango
FROM mediciones_brutas
WHERE fosfina_mq135 IS NOT NULL AND (fosfina_mq135 < 0 OR fosfina_mq135 > 4095);

SELECT COUNT(*) AS mq7_fuera_rango
FROM mediciones_brutas
WHERE co_mq7 IS NOT NULL AND (co_mq7 < 0 OR co_mq7 > 4095);

SELECT COUNT(*) AS grupos_duplicados, COALESCE(SUM(dup_count - 1),0) AS filas_duplicadas
FROM (
  SELECT COUNT(*) AS dup_count
  FROM mediciones_brutas
  GROUP BY id_habitacion, contexto_hotel, timestamp_origen,
           temperatura_c, humedad_pct, fosfina_mq135, co_mq7,
           presencia_pir, intervalo_envio_ms
  HAVING COUNT(*) > 1
) t;

SELECT COUNT(*) AS limpias_con_ceros
FROM mediciones_limpias
WHERE temperatura_c = 0 OR humedad_pct = 0 OR fosfina_mq135 = 0 OR co_mq7 = 0;
```

## Análisis mensual (Node-RED)

En el flujo **HTL-IOT-PROCESAMIENTO** hay un inject **ANALISIS MENSUAL (ULTIMO MES)** que ejecuta un
análisis de 30 días sobre `mediciones_limpias` y llena la tabla `analisis_mediciones` con:
- estadística descriptiva de temperatura, humedad, fosfina y CO,
- anomalías y valores fuera de rango,
- correlaciones, patrones temporales, relaciones entre variables y limitaciones,
- total de registros y rango de fechas del último mes.

La web incluye una pestaña **Análisis de datos** para consultar resúmenes, incidencias, datos limpios, eventos y `analisis_mediciones`. También permite disparar los flujos **LIMPIAR LOTE (100)** y el análisis mensual de 30 días desde los controles de la pestaña.

## Simulador MQTT

El simulador permite validar el flujo sin ESP32. Revisa [simulator/README.md](simulator/README.md) para configuración y variables de pruebas, y [docs/GUIA_ESTADOS_MQTT.md](docs/GUIA_ESTADOS_MQTT.md) si necesitas comandos de contexto por MQTT.
