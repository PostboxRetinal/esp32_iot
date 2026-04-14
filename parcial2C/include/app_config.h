#pragma once

// -------- Wi-Fi --------
#define WIFI_SSID "Bastian_IoT"
#define WIFI_PASSWORD "A1B2C3D4"

// -------- MQTT (Maqiatto) --------
#define MQTT_BROKER_HOST "maqiatto.com"
#define MQTT_BROKER_PORT 1883
#define MQTT_USERNAME "lung-apply-staring@duck.com"
#define MQTT_PASSWORD "ZsHcyUikxDmcooEogQk4"
#define MQTT_TOPIC_BASE "lung-apply-staring@duck.com/fiot/garage"

// Unique hardware node identifier (must be different from simulator ID)
#define DEVICE_ID "ESP32-GARAGE-CO-001"

// -------- NTP / Timezone --------
#define NTP_SERVER_1 "pool.ntp.org"
#define NTP_SERVER_2 "time.nist.gov"
#define TZ_OFFSET_SECONDS (-5 * 3600)
#define TZ_DAYLIGHT_OFFSET 0

// -------- Timing (ms) --------
#define TELEMETRY_PUBLISH_INTERVAL_MS 5000UL
#define HEARTBEAT_INTERVAL_MS 60000UL
#define WIFI_RETRY_INTERVAL_MS 10000UL
#define MQTT_RETRY_INTERVAL_MS 5000UL
#define WIFI_CONNECT_TIMEOUT_MS 20000UL
#define MQ7_WARMUP_MS 10000UL

// -------- CO thresholds for demo (PPM) --------
// LED mapping on ESP32:
// - SEGURO: LED_WHITE
// - PRECAUCION: LED_GREEN
// - PELIGRO/CRITICO: LED_RED (CRITICO blinking)
#define CO_SEGURO_MAX_PPM 8.0f
#define CO_PRECAUCION_MAX_PPM 14.0f
#define CO_PELIGRO_MAX_PPM 22.0f
#define CO_URGENTE_MIN_PPM CO_PELIGRO_MAX_PPM

// -------- MQ-7 calibration constants --------
#define RO 10.0f
#define MQ7_ADC_REF_VOLTAGE 3.3f
#define MQ7_SENSOR_VCC_VOLTAGE 5.0f
#define MQ7_LOAD_RESISTOR_KOHM 10.0f
