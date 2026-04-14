#include <ArduinoJson.h>
#include <WiFi.h>
#include <time.h>

#define MQ7_PIN    36
#define PIR_PIN    5
#define LED_WHITE  27
#define LED_GREEN  14
#define LED_RED    12
#define DEVICE_ID  "ESP32-GARAGE-CO-001"

#define RO         10.0

const char* ssid     = "Bastian_IoT";
const char* password = "A1B2C3D4";

unsigned long lastBlink = 0;
bool ledState = false;

float calcularPPM(int rawValue) {
  float voltage = rawValue * (3.3 / 4095.0);
  float rs = (5.0 - voltage) / voltage * 10.0;
  float ratio = rs / RO;
  return 99.042 * pow(ratio, -1.518);
}

void setLED(bool w, bool g, bool r) {
  digitalWrite(LED_WHITE, w);
  digitalWrite(LED_GREEN, g);
  digitalWrite(LED_RED,   r);
}

String getTimestamp() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) return "ERROR";
  char buf[30];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%S-05:00", &timeinfo);
  return String(buf);
}

void setup() {
  Serial.begin(115200);
  pinMode(PIR_PIN,   INPUT);
  pinMode(LED_WHITE, OUTPUT);
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_RED,   OUTPUT);
  setLED(1, 0, 0);

  // WiFi
  Serial.print("Conectando a WiFi...");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println(" conectado.");

  // NTP — GMT-5
  configTime(-5 * 3600, 0, "pool.ntp.org", "time.nist.gov");
  Serial.print("Sincronizando hora...");
  struct tm timeinfo;
  while (!getLocalTime(&timeinfo)) {
    delay(500);
    Serial.print(".");
  }
  Serial.println(" listo.");

  Serial.println("Calentando sensor MQ-7 (10s) ...");
  delay(10000);
  Serial.println("Sistema listo.");
}

void loop() {
  int   rawCO  = analogRead(MQ7_PIN);
  float co_ppm = calcularPPM(rawCO);
  int   pir    = digitalRead(PIR_PIN);

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
    if (millis() - lastBlink >= 150) {
      lastBlink = millis();
      ledState = !ledState;
      setLED(0, 0, ledState);
    }
  }

  if (pir == 1 && co_ppm >= 30) {
    estado += "_URGENTE";
  }

  JsonDocument doc;
  doc["device_id"] = DEVICE_ID;
  doc["timestamp"] = getTimestamp();
  doc["co_ppm"]    = (int)co_ppm;
  doc["presencia"] = (pir == 1) ? "SI" : "NO";
  doc["estado"]    = estado;

  serializeJsonPretty(doc, Serial);
  Serial.println();
  delay(5000);
}