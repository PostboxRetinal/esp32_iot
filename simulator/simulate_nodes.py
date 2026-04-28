import json
import os
import random
import threading
import time
from datetime import datetime, timezone

import paho.mqtt.client as mqtt


MQTT_SERVER = os.getenv("MQTT_SERVER", "maqiatto.com")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_USER = os.getenv("MQTT_USER", "")
MQTT_PASS = os.getenv("MQTT_PASS", "")
TOPICO_DATOS = os.getenv("TOPICO_DATOS", "usuario/alertas")
TOPICO_COMANDOS_BASE = os.getenv("TOPICO_COMANDOS", "usuario/comandos")
QOS = int(os.getenv("SIM_QOS", "1"))
INTERVAL_SECONDS = max(float(os.getenv("SIM_INTERVAL_SECONDS", "7")), 1.0)
DEVICE_ID = os.getenv("SIM_DEVICE_ID", os.getenv("HOSTNAME", "SIM-NODO")).strip() or "SIM-NODO"
HABITACION = os.getenv("SIM_HABITACION", f"SIM-{DEVICE_ID}").strip() or f"SIM-{DEVICE_ID}"
CONTEXTO_INICIAL = os.getenv("SIM_CONTEXTO_HOTEL", "LIBRE").strip().upper()
SISTEMA_INICIAL = os.getenv("SIM_SISTEMA_ACTIVO", "true").strip().lower() in {"1", "true", "on", "si", "yes"}
DHT_FAIL_PROB = float(os.getenv("SIM_DHT_FAIL_PROB", "0.05"))
ALERT_PROB = float(os.getenv("SIM_ALERT_PROB", "0.22"))
MOTION_PROB = float(os.getenv("SIM_MOTION_PROB", "0.3"))

VALID_CONTEXTOS = {"LIBRE", "RESERVADA", "FUMIGACION"}
MIN_INTERVAL_MS = 1000
MAX_INTERVAL_MS = 60000

state_lock = threading.Lock()
state = {
    "sistema_activo": SISTEMA_INICIAL,
    "intervalo_envio_ms": int(INTERVAL_SECONDS * 1000),
    "contexto_hotel": CONTEXTO_INICIAL if CONTEXTO_INICIAL in VALID_CONTEXTOS else "LIBRE",
    "pir_prev": False,
}
TOPICO_COMANDOS = f"{TOPICO_COMANDOS_BASE.rstrip('/')}/{DEVICE_ID}"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def clamp_interval_ms(v: int) -> int:
    return max(MIN_INTERVAL_MS, min(MAX_INTERVAL_MS, int(v)))


def snapshot_state() -> dict:
    with state_lock:
        return {
            "sistema_activo": bool(state["sistema_activo"]),
            "intervalo_envio_ms": int(state["intervalo_envio_ms"]),
            "contexto_hotel": str(state["contexto_hotel"]),
            "pir_prev": bool(state["pir_prev"]),
        }


def on_connect(client, _userdata, _flags, rc):
    print(f"Conectado a MQTT rc={rc}")
    client.subscribe(TOPICO_COMANDOS, qos=QOS)
    print(f"Escuchando comandos en topic: {TOPICO_COMANDOS}")


def on_message(_client, _userdata, msg):
    try:
        command = json.loads(msg.payload.decode("utf-8"))
    except Exception as exc:
        print(f"Comando ignorado (JSON invalido): {exc}")
        return

    if not isinstance(command, dict):
        return

    target = str(command.get("device_id") or "").strip()
    if target != DEVICE_ID:
        return

    changed = []

    cmd = str(command.get("msg") or "").strip().upper()
    if cmd == "PAUSA":
        with state_lock:
            state["sistema_activo"] = False
        changed.append("sistema_activo=false")
    elif cmd == "INICIAR":
        with state_lock:
            state["sistema_activo"] = True
        changed.append("sistema_activo=true")

    intervalo = command.get("sample_interval_ms", command.get("intervalo_ms"))
    if intervalo is not None:
        try:
            intervalo_ms = clamp_interval_ms(int(intervalo))
            with state_lock:
                state["intervalo_envio_ms"] = intervalo_ms
            changed.append(f"intervalo_envio_ms={intervalo_ms}")
        except Exception:
            pass

    contexto = str(command.get("estado") or "").strip().upper()
    if contexto in VALID_CONTEXTOS:
        with state_lock:
            state["contexto_hotel"] = contexto
        changed.append(f"contexto_hotel={contexto}")

    if changed:
        print(f"Comando aplicado para {DEVICE_ID}: {', '.join(changed)}")


def build_payload() -> dict:
    s = snapshot_state()

    temp = 24.0 + random.random() * 8.0
    mq135 = 1300 + random.randint(0, 1400)
    mq7 = 500 + random.randint(0, 1200)

    if temp > 29 or random.random() < ALERT_PROB:
        mq135 = 2200 + random.randint(0, 1700)
        mq7 = 900 + random.randint(0, 1400)

    motion = random.random() < MOTION_PROB
    dht_ok = random.random() > DHT_FAIL_PROB

    event = None
    if motion and not s["pir_prev"]:
        event = "movimiento_iniciado"
    elif (not motion) and s["pir_prev"]:
        event = "movimiento_detenido"

    with state_lock:
        state["pir_prev"] = motion

    payload = {
        "device_id": DEVICE_ID,
        "habitacion": HABITACION,
        "contexto_hotel": s["contexto_hotel"],
        "timestamp": iso_now(),
        "sistema_activo": s["sistema_activo"],
        "intervalo_envio_ms": s["intervalo_envio_ms"],
        "fosfina_mq135": mq135,
        "co_mq7": mq7,
        "presencia_pir": motion,
    }

    if event:
        payload["evento_pir"] = event

    if dht_ok:
        payload["dht_ok"] = True
        payload["temperatura_C"] = round(temp, 2)
        payload["humedad_pct"] = round(35 + random.random() * 40, 2)
    else:
        payload["dht_ok"] = False
        payload["error"] = "Fallo lectura DHT11 (simulado)"

    return payload


def main() -> None:
    with state_lock:
        state["intervalo_envio_ms"] = clamp_interval_ms(state["intervalo_envio_ms"])

    client = mqtt.Client(client_id=f"sim-{DEVICE_ID}-{int(time.time())}")
    if MQTT_USER:
        client.username_pw_set(MQTT_USER, MQTT_PASS)

    client.on_connect = on_connect
    client.on_message = on_message

    client.connect(MQTT_SERVER, MQTT_PORT, keepalive=60)
    client.loop_start()

    print(f"Simulador conectado a {MQTT_SERVER}:{MQTT_PORT}")
    print(f"Publicando en topic: {TOPICO_DATOS}")
    print(f"Nodo simulado: {DEVICE_ID} | Habitacion: {HABITACION}")

    try:
        while True:
            s = snapshot_state()
            if s["sistema_activo"]:
                payload = build_payload()
                body = json.dumps(payload, ensure_ascii=True)
                result = client.publish(TOPICO_DATOS, body, qos=QOS, retain=False)
                result.wait_for_publish()
                print(f"[{payload['device_id']}] -> {body}")
            else:
                print(f"[{DEVICE_ID}] sistema en PAUSA, sin envio")

            time.sleep(max(snapshot_state()["intervalo_envio_ms"] / 1000.0, 1.0))
    except KeyboardInterrupt:
        print("Simulador detenido por usuario")
    finally:
        client.loop_stop()
        client.disconnect()


if __name__ == "__main__":
    main()
