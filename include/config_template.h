#ifndef CONFIG_TEMPLATE_H
#define CONFIG_TEMPLATE_H

// Wi-Fi creds
#define WIFI_SSID      "WIFI_SSID"
#define WIFI_PASSWORD  "WIFI_PASSWORD"

// MQTT creds
#define MQTT_SERVER    "broker.com"
#define MQTT_PORT      1883
#define MQTT_USER      "USER_MQTT"
#define MQTT_PASS      "PASS_MQTT"

// Node identity
#define DEVICE_ID      "ESP32-HW-01"
#define HABITACION     "HTL-N-P1-103"

// Topics
#define TOPICO_DATOS   "USUARIO_MQTT/datos"
#define TOPICO_COMANDOS "USUARIO_MQTT/comandos"

#endif