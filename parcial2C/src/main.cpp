#include <ArduinoJson.h>
#include <PubSubClient.h>
#include <WiFi.h>
#include <math.h>
#include <time.h>

#include "app_config.h"

#define MQ7_PIN    36
#define PIR_PIN    5
#define LED_WHITE  27
#define LED_GREEN  14
#define LED_RED    12

WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

unsigned long lastBlinkMs = 0;
unsigned long lastTelemetryMs = 0;
unsigned long lastHeartbeatMs = 0;
unsigned long lastWifiRetryMs = 0;
unsigned long lastMqttRetryMs = 0;
bool ledState = false;
uint32_t messageCounter = 0;

char topicTelemetry[96];
char topicStatus[96];
char topicHeartbeat[96];

void buildTopics() {
  snprintf(topicTelemetry, sizeof(topicTelemetry), "%s/%s/telemetry", MQTT_TOPIC_BASE, DEVICE_ID);
  snprintf(topicStatus, sizeof(topicStatus), "%s/%s/status", MQTT_TOPIC_BASE, DEVICE_ID);
  snprintf(topicHeartbeat, sizeof(topicHeartbeat), "%s/%s/heartbeat", MQTT_TOPIC_BASE, DEVICE_ID);
}

float calcularPPM(int rawValue) {
  if (rawValue <= 0) {
    rawValue = 1;
  }

  float voltage = rawValue * (MQ7_ADC_REF_VOLTAGE / 4095.0f);
  if (voltage < 0.01f) {
    voltage = 0.01f;
  }

  float rs = (MQ7_SENSOR_VCC_VOLTAGE - voltage) / voltage * MQ7_LOAD_RESISTOR_KOHM;
  float ratio = rs / RO;
  float ppm = 99.042f * pow(ratio, -1.518f);

  if (isnan(ppm) || isinf(ppm) || ppm < 0.0f) {
    return 0.0f;
  }

  return ppm;
}

void setLED(bool w, bool g, bool r) {
  digitalWrite(LED_WHITE, w);
  digitalWrite(LED_GREEN, g);
  digitalWrite(LED_RED,   r);
}

String getTimestamp() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 100)) {
    return "1970-01-01T00:00:00-05:00";
  }

  char buf[30];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%S-05:00", &timeinfo);
  return String(buf);
}

void ensureWiFiConnection() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  unsigned long now = millis();
  if (now - lastWifiRetryMs < WIFI_RETRY_INTERVAL_MS) {
    return;
  }

  lastWifiRetryMs = now;
  Serial.println("[WiFi] Conexion perdida. Intentando reconexion...");
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

bool connectMqtt() {
  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }

  bool connected = mqttClient.connect(
    DEVICE_ID,
    MQTT_USERNAME,
    MQTT_PASSWORD,
    topicStatus,
    1,
    true,
    "offline"
  );

  if (!connected) {
    Serial.print("[MQTT] Conexion fallida. rc=");
    Serial.println(mqttClient.state());
    return false;
  }

  Serial.println("[MQTT] Conectado al broker.");
  mqttClient.publish(topicStatus, "online", true);
  return true;
}

void ensureMqttConnection() {
  if (mqttClient.connected() || WiFi.status() != WL_CONNECTED) {
    return;
  }

  unsigned long now = millis();
  if (now - lastMqttRetryMs < MQTT_RETRY_INTERVAL_MS) {
    return;
  }

  lastMqttRetryMs = now;
  connectMqtt();
}

String clasificarEstado(float co_ppm, int pir) {
  String estado;

  if (co_ppm < 10) {
    estado = "SEGURO";
    setLED(1, 0, 0);
    ledState = false;
  } else if (co_ppm < 15) {
    estado = "PRECAUCION";
    setLED(0, 1, 0);
    ledState = false;
  } else if (co_ppm < 30) {
    estado = "PELIGRO";
    setLED(0, 0, 1);
    ledState = false;
  } else {
    estado = "CRITICO";
    if (millis() - lastBlinkMs >= 150) {
      lastBlinkMs = millis();
      ledState = !ledState;
      setLED(0, 0, ledState);
    }
  }

  if (pir == 1 && co_ppm >= 30) {
    estado += "_URGENTE";
  }

  return estado;
}

void publishTelemetry(int rawCO, float co_ppm, int pir, const String& estado) {
  JsonDocument doc;
  doc["device_id"] = DEVICE_ID;
  doc["timestamp"] = getTimestamp();
  doc["co_ppm"] = roundf(co_ppm * 10.0f) / 10.0f;
  doc["presencia"] = (pir == 1) ? "SI" : "NO";
  doc["estado"] = estado;
  doc["raw_co_adc"] = rawCO;
  doc["message_id"] = ++messageCounter;

  char payload[384];
  size_t len = serializeJson(doc, payload, sizeof(payload));

  if (len == 0) {
    Serial.println("[MQTT] Error serializando payload JSON.");
    return;
  }

  if (mqttClient.connected()) {
    bool sent = mqttClient.publish(topicTelemetry, payload, false);
    if (!sent) {
      Serial.println("[MQTT] Error publicando telemetry.");
    }
  }

  serializeJsonPretty(doc, Serial);
  Serial.println();
}

void publishHeartbeat() {
  if (!mqttClient.connected()) {
    return;
  }

  JsonDocument hb;
  hb["device_id"] = DEVICE_ID;
  hb["timestamp"] = getTimestamp();
  hb["status"] = "online";
  hb["uptime_ms"] = millis();
  hb["rssi"] = WiFi.RSSI();

  char payload[256];
  size_t len = serializeJson(hb, payload, sizeof(payload));

  if (len > 0) {
    mqttClient.publish(topicHeartbeat, payload, true);
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(PIR_PIN,   INPUT);
  pinMode(LED_WHITE, OUTPUT);
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_RED,   OUTPUT);
  setLED(1, 0, 0);

  buildTopics();

  mqttClient.setServer(MQTT_BROKER_HOST, MQTT_BROKER_PORT);
  mqttClient.setBufferSize(512);

  // WiFi
  Serial.print("Conectando a WiFi...");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long wifiStart = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - wifiStart < WIFI_CONNECT_TIMEOUT_MS) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println(" conectado.");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println(" no disponible, se intentara reconexion en loop().");
  }

  // NTP — GMT-5
  configTime(TZ_OFFSET_SECONDS, TZ_DAYLIGHT_OFFSET, NTP_SERVER_1, NTP_SERVER_2);
  Serial.print("Sincronizando hora...");
  struct tm timeinfo;

  int retries = 0;
  while (!getLocalTime(&timeinfo, 500) && retries < 10) {
    delay(500);
    Serial.print(".");
    retries++;
  }

  if (retries < 10) {
    Serial.println(" listo.");
  } else {
    Serial.println(" no disponible, se usara timestamp por NTP cuando vuelva la red.");
  }

  if (WiFi.status() == WL_CONNECTED) {
    connectMqtt();
  }

  Serial.println("Calentando sensor MQ-7 (10s) ...");
  delay(MQ7_WARMUP_MS);
  Serial.println("Sistema listo.");
}

void loop() {
  ensureWiFiConnection();
  ensureMqttConnection();
  mqttClient.loop();

  unsigned long now = millis();

  if (now - lastHeartbeatMs >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatMs = now;
    publishHeartbeat();
  }

  if (now - lastTelemetryMs < TELEMETRY_PUBLISH_INTERVAL_MS) {
    delay(20);
    return;
  }

  lastTelemetryMs = now;

  int   rawCO  = analogRead(MQ7_PIN);
  float co_ppm = calcularPPM(rawCO);
  int   pir    = digitalRead(PIR_PIN);

  String estado = clasificarEstado(co_ppm, pir);
  publishTelemetry(rawCO, co_ppm, pir, estado);
}