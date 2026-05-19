# Simulador MQTT de nodos remotos

Este simulador publica telemetría JSON de un solo nodo virtual por máquina. La idea es que cada máquina actúe como si fuera otro ESP32.

Para ver cómo este simulador se integra con la web/API y la limpieza, consulta [../docs/DOCUMENTACION_WEB_API.md](../docs/DOCUMENTACION_WEB_API.md). Para comandos manuales de contexto, consulta [../docs/GUIA_ESTADOS_MQTT.md](../docs/GUIA_ESTADOS_MQTT.md).

## Uso rápido (Docker)

Desde otra máquina con Docker:

1. Copia este proyecto o solo la carpeta `simulator` y `docker-compose.simulator.yml` junto al archivo `.env`.
2. Ajusta en `.env` el broker y credenciales MQTT reales.
3. Define identificadores del nodo de esa máquina (en `.env` o exportando variables):

```bash
SIM_ID_HABITACION=HTL-N-P2-305
```

4. Ejecuta:

```bash
docker compose -f docker-compose.simulator.yml up -d --build
```

5. Ver logs:

```bash
docker compose -f docker-compose.simulator.yml logs -f mqtt-simulator
```

Si quieres simular 3 nodos, ejecuta este mismo servicio en 3 máquinas distintas con diferente `SIM_ID_HABITACION`.

## Variables útiles

- `SIM_ID_HABITACION`: identificador único de la habitación/zona (`SIM_HABITACION` y `HOSTNAME` quedan como fallback)
- `SIM_CONTEXTO_HOTEL`: `LIBRE`, `RESERVADA` o `FUMIGACION`
- `SIM_INTERVAL_SECONDS`: segundos entre rondas de envío
- `SIM_QOS`: nivel QoS MQTT para publicar y suscribirse (por defecto `1`)
- `SIM_MOTION_PROB`: probabilidad de presencia PIR
- `SIM_DHT_FAIL_PROB`: probabilidad de simular falla DHT
- `SIM_ALERT_PROB`: probabilidad de inyectar valores altos de gas
- `SIM_MISSING_PROB`: probabilidad de eliminar una variable medida (null)
- `SIM_OUTLIER_PROB`: probabilidad de inyectar valores fuera de rango
- `SIM_DUP_PROB`: probabilidad de reenviar el último payload (duplicado)
- `SIM_GAP_PROB`: probabilidad de generar un hueco temporal extra
- `SIM_GAP_SECONDS`: segundos adicionales en el hueco temporal

## Compatibilidad con comandos MQTT

El simulador escucha `TOPICO_COMANDOS` y aplica comandos como el firmware del ESP32:

- `sample_interval_ms` o `intervalo_ms`
- `estado` (`LIBRE`, `RESERVADA`, `FUMIGACION`)
- `id_habitacion` opcional para comando dirigido (si no llega, se toma como broadcast)

## Formato de mensaje emitido

Incluye campos compatibles con el flujo del proyecto:
- `id_habitacion`
- `contexto_hotel`
- `timestamp`
- `intervalo_envio_ms`
- `fosfina_mq135`
- `co_mq7`
- `presencia_pir`
- `temperatura_C`
- `humedad_pct`

## Pruebas de calidad de datos

Para validar la limpieza sin ESP32, usa estos ajustes en `.env`:

```bash
SIM_MISSING_PROB=0.15
SIM_OUTLIER_PROB=0.10
SIM_DUP_PROB=0.08
SIM_GAP_PROB=0.05
SIM_GAP_SECONDS=60
```

Esto genera:
- registros incompletos (variables faltantes)
- valores atípicos
- duplicados
- huecos temporales
