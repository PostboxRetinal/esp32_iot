#include <Arduino.h>
#include <ArduinoJson.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <WiFi.h>
#include <time.h>
#include "config.h"

// ==========================================
// 1. ASIGNACIÓN DE PINES
// ==========================================
#define DHT11_PIN           26
#define MQ135_ANALOG_PIN    34
#define MQ7_ANALOG_PIN      35
#define PIR_DIGITAL_PIN     25
#define LED_INTEGRADO       2

// ==========================================
// 2. CONFIGURACIÓN DE UMBRALES DE RIESGO
// ==========================================
const int UMBRAL_MQ135_PELIGRO = 2500;
const int UMBRAL_MQ7_PELIGRO = 2000;
const float UMBRAL_TEMP_INCENDIO = 45.0;

const unsigned long INTERVALO_ENVIO_MS_LIBRE = 2500;
const unsigned long INTERVALO_ENVIO_MS_RESERVADA = 2000;
const unsigned long INTERVALO_ENVIO_MS_FUMIGACION = 1200;

// Variable global que guarda el contexto del sistema externo
String estadoHabitacion = "LIBRE"; // Estados posibles: "LIBRE", "RESERVADA", "FUMIGACION"

// ==========================================
// 3. CREDENCIALES Y RED
// ==========================================
const char* ssid = WIFI_SSID;
const char* password = WIFI_PASSWORD;
const char* mqtt_server = MQTT_SERVER;
const int mqtt_port = MQTT_PORT;
const char* mqtt_user = MQTT_USER;
const char* mqtt_pass = MQTT_PASS;
const char* topico_datos = TOPICO_DATOS;
const char* topico_comandos = TOPICO_COMANDOS;
bool sistemaActivo = true;

// Variables de estado de sensores
int sensorMQ135;
int sensorMQ7;
int movimiento;
int pirState = LOW;

DHT dht11(DHT11_PIN, DHT11);
WiFiClient espClient;
PubSubClient mqttClient(espClient);

void reconnect();
void setup_wifi();
unsigned long getIntervaloEnvioMs(const String& contextoHabitacion);

const long GMT_OFFSET_SEC = -5 * 3600;  // UTC-5
const int DAYLIGHT_OFFSET_SEC = 0;

bool ensureNtpTime() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 10000)) {
    return false;
  }
  return (timeinfo.tm_year > 110);
}

String getUtcOffsetIsoTimestamp() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    return String("unsynced-") + String(millis());
  }
  char buf[25];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  return String(buf);
}

void parpadearLedFeedback(int veces = 2, int onMs = 100, int offMs = 100) {
  for (int i = 0; i < veces; i++) {
    digitalWrite(LED_INTEGRADO, HIGH);
    delay(onMs);
    digitalWrite(LED_INTEGRADO, LOW);
    delay(offMs);
  }
}

unsigned long getIntervaloEnvioMs(const String& contextoHabitacion) {
  if (contextoHabitacion == "FUMIGACION") {
    return INTERVALO_ENVIO_MS_FUMIGACION;
  }

  if (contextoHabitacion == "RESERVADA") {
    return INTERVALO_ENVIO_MS_RESERVADA;
  }

  return INTERVALO_ENVIO_MS_LIBRE;
}

// ==========================================
// 4. CALLBACK: ESCUCHA DEL SISTEMA EXTERNO
// ==========================================
// Aquí es donde la ESP32 recibe la orden de la "Recepcionista" o "App Externa"
void callback(char* topic, byte* payload, unsigned int length) {
  String mensaje = "";
  for (int i = 0; i < length; i++) {
    mensaje += (char)payload[i];
  }
  
  Serial.print("Comando recibido: ");
  Serial.println(mensaje);

  parpadearLedFeedback(2, 80, 80);

  JsonDocument docCmd;
  DeserializationError error = deserializeJson(docCmd, mensaje);

  if (error) {
    Serial.println("ERROR: Error al parsear JSON de comando");
    return;
  }

  String comando = docCmd["msg"] | "";
  if (comando == "PAUSA") {
    sistemaActivo = false;
    Serial.println("SISTEMA PAUSADO");
    return;
  }
  if (comando == "INICIAR") {
    sistemaActivo = true;
    Serial.println("SISTEMA INICIADO");
    return;
  }

  String nuevoEstado = docCmd["estado"] | "";
  if (nuevoEstado == "LIBRE" || nuevoEstado == "RESERVADA" || nuevoEstado == "FUMIGACION") {
    estadoHabitacion = nuevoEstado;
    Serial.println("Contexto de habitacion actualizado a: " + estadoHabitacion);
  } else {
    Serial.println("ERROR: Comando/estado desconocido. Ignorando...");
  }
}

void setup_wifi() {
  Serial.print("\nConectando a Wi-Fi: ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n¡WiFi conectado!");

  configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, "pool.ntp.org", "time.nist.gov");
  Serial.print("Sincronizando hora NTP");

  struct tm timeinfo;
  int retries = 0;
  while (!getLocalTime(&timeinfo) && retries < 20) {
    delay(500);
    Serial.print(".");
    retries++;
  }

  if (retries < 20) {
    Serial.println("\n¡Hora sincronizada!");
  } else {
    Serial.println("\nNo se logró sincronizar NTP, se usará timestamp de respaldo.");
  }
}

// ==========================================
// SETUP
// ==========================================
void setup() {
  Serial.begin(115200);
  pinMode(MQ135_ANALOG_PIN, INPUT);
  pinMode(MQ7_ANALOG_PIN, INPUT);
  pinMode(PIR_DIGITAL_PIN, INPUT);
  pinMode(LED_INTEGRADO, OUTPUT);
  digitalWrite(LED_INTEGRADO, LOW);

  dht11.begin();

  setup_wifi();

  mqttClient.setServer(mqtt_server, mqtt_port);
  mqttClient.setCallback(callback); // Asignar la función que escucha comandos
  mqttClient.setKeepAlive(60);
  mqttClient.setSocketTimeout(15);

  Serial.print("MQTT broker: "); 
  Serial.print(mqtt_server);
  Serial.print(":"); 
  Serial.print(mqtt_port);
  Serial.println("Alertas: "); 
  Serial.print(topico_datos);
  Serial.print("Comandos: "); 
  Serial.println(topico_comandos);
}

// ==========================================
// LOOP PRINCIPAL
// ==========================================
void loop() {
  // 1. Mantener WiFi
  if (WiFi.status() != WL_CONNECTED) {
    setup_wifi();
  }

  // 2. Mantener MQTT y procesar comandos entrantes
  if (!mqttClient.connected()) {
    reconnect();
  }
  mqttClient.loop();

  if (!sistemaActivo) {
    delay(100);
    return;
  }

  // 3. Temporizador NO bloqueante (intervalo dinámico según estado)
  static unsigned long lastReadMs = 0;
  static unsigned long intervaloEnvioActualMs = INTERVALO_ENVIO_MS_LIBRE;
  if (millis() - lastReadMs < intervaloEnvioActualMs) return;
  lastReadMs = millis();

  // 4. Leer sensores
  sensorMQ135 = analogRead(MQ135_ANALOG_PIN);
  delayMicroseconds(10);
  sensorMQ7   = analogRead(MQ7_ANALOG_PIN);
  movimiento  = digitalRead(PIR_DIGITAL_PIN);
  float humidity    = dht11.readHumidity();
  float temperature = dht11.readTemperature();

  bool motion = (movimiento == HIGH);
  const char* event = nullptr;
  if (motion && pirState == LOW) {
    event    = "movimiento_iniciado";
    pirState = HIGH;
  } else if (!motion && pirState == HIGH) {
    event    = "movimiento_detenido";
    pirState = LOW;
  }

  // ==========================================
  // 5. INTELIGENCIA DE CONTEXTO (Context-Awareness)
  // ==========================================
  String estadoRiesgo = "NORMAL";

  if (estadoHabitacion == "FUMIGACION") {

    if (motion) {
      estadoRiesgo = "CRITICO: INTRUSO EN FUMIGACION";
    } else if (temperature > UMBRAL_TEMP_INCENDIO) {
      estadoRiesgo = "CRITICO: FUEGO DURANTE FUMIGACION";
    } else {
      estadoRiesgo = "OPERACION_FUMIGACION_ACTIVA";
    }
  } 
  else { 
    if (sensorMQ135 >= UMBRAL_MQ135_PELIGRO) {
      estadoRiesgo = "CRITICO: FUGA DE FOSFINA/HUMO";
    } else if (sensorMQ7 >= UMBRAL_MQ7_PELIGRO) {
      estadoRiesgo = "CRITICO: MONOXIDO DE CARBONO ALTO";
    } else if (temperature >= UMBRAL_TEMP_INCENDIO) {
      estadoRiesgo = "CRITICO: CONATO DE INCENDIO";
    }
  }

  intervaloEnvioActualMs = getIntervaloEnvioMs(estadoHabitacion);

  // ==========================================
  // 6. CREAR Y ENVIAR JSON
  // ==========================================
  JsonDocument doc;
  String timestamp = getUtcOffsetIsoTimestamp();
  doc["timestamp"] = timestamp;

  if (isnan(humidity) || isnan(temperature)) {
    doc["error"] = "Fallo lectura DHT11";
  } else {
    doc["habitacion"]       = "HTL-N-P1-103";
    doc["contexto_hotel"]   = estadoHabitacion;  // LIBRE, RESERVADA, FUMIGACION
    doc["nivel_alerta"]     = estadoRiesgo;      // NORMAL, CRITICO, etc.
    doc["temperatura_C"]    = temperature;
    doc["humedad_pct"]      = humidity;
    doc["fosfina_mq135"]    = sensorMQ135;
    doc["co_mq7"]           = sensorMQ7;
    doc["presencia_pir"]    = motion;
    if (event) doc["evento_pir"] = event;
  }

  char outBuf[512];
  size_t outLen = serializeJsonPretty(doc, outBuf, sizeof(outBuf));

  if (!mqttClient.connected()) {
    Serial.println("ERROR: MQTT no conectado al publicar, reintentando reconexión...");
    reconnect();
  } else {
    bool published = mqttClient.publish(topico_datos, outBuf, outLen);
    if (!published) {
      Serial.print("ERROR: MQTT publish retornó false, state=");
      Serial.println(mqttClient.state());
      reconnect();
    } else {
      Serial.print("Publicado en ");
      Serial.println(topico_datos);
    }
    Serial.print("Enviado -> ");
    serializeJsonPretty(doc, Serial);
    Serial.println();
  }
}

// ==========================================
// FUNCIÓN DE RECONEXIÓN MQTT
// ==========================================
void reconnect() {
  while (!mqttClient.connected() && WiFi.status() == WL_CONNECTED) {
    Serial.print("Conectando a Maqiatto...");
    String clientId = "HotelESP32-" + String((uint32_t)esp_random(), HEX);

    if (mqttClient.connect(clientId.c_str(), mqtt_user, mqtt_pass)) {
      Serial.println(" ¡Conectado al Bróker MQTT!");
      bool subscribed = mqttClient.subscribe(topico_comandos);
      if (subscribed) {
        Serial.println("Escuchando comandos en: " + String(topico_comandos));
      } else {
        Serial.println("Fallo suscripcion al topico de comandos");
      }
    } else {
      Serial.print(" Falló, rc=");
      Serial.print(mqttClient.state());
      Serial.println(". Reintentando en 2s...");
      delay(2000);
    }
  }
}