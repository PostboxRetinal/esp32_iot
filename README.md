# ESP32 IoT - Calidad de datos y simulador

Este repositorio incluye el flujo de ingestion en Node-RED, la base de datos MySQL y un simulador MQTT para validar reglas de calidad sin hardware.

## Limpieza de datos (Node-RED)

El flujo **HTL-IOT-LIMPIEZA** procesa por demanda lotes de 100 registros con `limpio = 0` y aplica:
- validacion de registros incompletos
- deteccion de atipicos
- duplicados (batch + cache TTL)
- reglas temporales (huecos y perdida de comunicacion)
- homogeneidad de formato

Regla de imputacion:
- 1-2 columnas con error -> imputacion por mediana (por `id_habitacion`)
- >2 columnas con error -> se rechaza y se registra en `incidencias`

Variables de entorno relacionadas (ver `.env`):
- `TEMP_MIN_C`, `TEMP_MAX_C`, `HUM_MIN_PCT`, `HUM_MAX_PCT`
- `TEMPORAL_GAP_MAX_MS`, `TEMPORAL_LOSS_MAX_MS`, `TEMPORAL_INTERVALO_DEFAULT_MS`
- `DUP_SIG_TTL_MS`

## Auditoria de datos

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
```

## Analisis mensual (Node-RED)

En el flujo **HTL-IOT-PROCESAMIENTO** hay un inject **ANALISIS MENSUAL (ULTIMO MES)** que ejecuta un
`INSERT ... SELECT` y llena la tabla `analisis_mediciones` con:
- promedios, minimos y maximos de temperatura y humedad,
- conteo de valores fuera de rango (temp < 18 o > 25; hum < 30 o > 60),
- total de registros y rango de fechas del ultimo mes.

## Simulador MQTT

El simulador permite validar el flujo sin ESP32. Revisa [simulator/README.md](simulator/README.md) para configuracion y variables de pruebas.
