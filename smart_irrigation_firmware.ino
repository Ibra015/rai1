/*
 * =========================================================================
 *  PROJECT: AGRO-OMNI SMART IRRIGATION SYSTEM (V4)
 * =========================================================================
 *
 *  SETUP:
 *  1. Board: "AI Thinker ESP32-CAM"
 *  2. Partition: "Huge APP (3MB No OTA/1MB SPIFFS)"
 *  3. Libraries: Adafruit GFX, Adafruit SSD1306, ArduinoJson, DHT, WebSockets
 *  4. Copy config.example.h to config.h and set WiFi credentials
 *
 *  PIN NOTES:
 *  - ESP32-CAM uses most GPIOs for Camera
 *  - WiFi disables ADC2 pins (GPIO 0,2,4,12,13,14,15,25,26,27)
 *  - Best practice: Use ADS1115 I2C multiplexer for stable analog readings
 *  - For full 10-zone support: Use MCP23017 I2C GPIO expander for relays
 * =========================================================================
 */

#include "esp_camera.h"
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <SPIFFS.h>
#include <WebServer.h>
#include <WebSocketsServer.h>
#include <WiFi.h>
#include <Wire.h>

// Configuration (copy config.example.h to config.h)
#include "config.h"

// --- CAMERA CONFIG (AI THINKER MODEL) ---
#define PWDN_GPIO_NUM 32
#define RESET_GPIO_NUM -1
#define XCLK_GPIO_NUM 0
#define SIOD_GPIO_NUM 26
#define SIOC_GPIO_NUM 27
#define Y9_GPIO_NUM 35
#define Y8_GPIO_NUM 34
#define Y7_GPIO_NUM 39
#define Y6_GPIO_NUM 36
#define Y5_GPIO_NUM 21
#define Y4_GPIO_NUM 19
#define Y3_GPIO_NUM 18
#define Y2_GPIO_NUM 5
#define VSYNC_GPIO_NUM 25
#define HREF_GPIO_NUM 23
#define PCLK_GPIO_NUM 22

// --- SENSORS ---
#define DHTPIN 13
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

// --- PIN CONFIGURATION ---
#define NUM_ZONES 10

#ifdef USE_GPIO_EXPANDER
  #include <Adafruit_MCP23X17.h>
  Adafruit_MCP23X17 mcp;
#else
  const int relayPins[] = {2, 4};
  const int NUM_DIRECT_RELAYS = sizeof(relayPins) / sizeof(relayPins[0]);
#endif

const int soilPins[] = {12, 14, 15, 16, 17, 18};
const int NUM_SOIL_SENSORS = sizeof(soilPins) / sizeof(soilPins[0]);
const int pumpPin = 33;

// --- NETWORK ---
WebServer server(80);
WebSocketsServer webSocket = WebSocketsServer(81);

// --- LOGIC ---
bool valveStates[NUM_ZONES] = {false};
unsigned long wateringTimers[NUM_ZONES] = {0};
unsigned long lastSensorRead = 0;
unsigned long lastAutoCheck = 0;
unsigned long lastReconnect = 0;
bool rainExpected = false;

// Plant moisture thresholds (matching plant_data.js)
struct PlantConfig {
  const char *name;
  int minMoisture;
  int maxMoisture;
  float waterMins;
};

const PlantConfig plantConfigs[NUM_ZONES] = {
    {"Tomato", 30, 70, 3.0},    {"Cucumber", 50, 85, 2.5},
    {"Arugula", 60, 90, 2.0},   {"Carrot", 25, 65, 4.0},
    {"Lettuce", 45, 80, 2.0},   {"Pepper", 35, 75, 3.0},
    {"Spinach", 65, 95, 1.5},   {"Beans", 15, 55, 5.0},
    {"Peas", 70, 95, 1.5},      {"Cabbage", 35, 70, 3.5}
};

// Prototypes
void setupCamera();
void setupWiFi();
void checkTimers();
void sendSensorData();
void handleControl();
void broadcastUpdate();
void broadcastSensorData();
void setRelay(int zone, bool state);
void autoWateringCheck();
void startWatering(int zone, float durationMins);
void webSocketEvent(uint8_t num, WStype_t type, uint8_t *payload, size_t length);

void setup() {
  Serial.begin(115200);
  Serial.println("\n[System] Booting Agro-Omni V4...");

  // 1. Initialize Pins
  pinMode(pumpPin, OUTPUT);
  digitalWrite(pumpPin, HIGH);

  #ifdef USE_GPIO_EXPANDER
    Wire.begin(14, 15);
    if (!mcp.begin_I2C(0x20, &Wire)) {
      Serial.println("[Error] MCP23017 not found");
    } else {
      for (int i = 0; i < NUM_ZONES; i++) {
        mcp.pinMode(i, OUTPUT);
        mcp.digitalWrite(i, HIGH);
      }
      Serial.println("[System] MCP23017 initialized (10 zones)");
    }
  #else
    for (int i = 0; i < NUM_DIRECT_RELAYS; i++) {
      pinMode(relayPins[i], OUTPUT);
      digitalWrite(relayPins[i], HIGH);
    }
    Serial.printf("[System] Direct GPIO mode (%d relays)\n", NUM_DIRECT_RELAYS);
  #endif

  for (int i = 0; i < NUM_SOIL_SENSORS; i++)
    pinMode(soilPins[i], INPUT);

  // 2. Sensors
  dht.begin();
  Wire.begin(14, 15);

  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("[Error] SSD1306 not found");
  } else {
    display.clearDisplay();
    display.setTextColor(WHITE);
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.println("Agro-Omni V4");
    display.println("Initializing...");
    display.display();
  }

  // 3. Camera
  setupCamera();

  // 4. Filesystem
  if (!SPIFFS.begin(true)) {
    Serial.println("[Error] SPIFFS Mount Failed");
  }

  // 5. WiFi
  setupWiFi();

  // 6. Web Server with Authentication
  server.on("/", HTTP_GET, []() {
    if (!server.authenticate(authUser, authPassword)) {
      return server.requestAuthentication();
    }
    File file = SPIFFS.open("/dashboard_simulation.html", "r");
    if (!file) {
      server.send(500, "text/plain", "Dashboard Missing");
      return;
    }
    server.streamFile(file, "text/html");
    file.close();
  });

  server.on("/data", HTTP_GET, sendSensorData);

  server.on("/control", HTTP_POST, []() {
    if (!server.authenticate(authUser, authPassword)) {
      return server.requestAuthentication();
    }
    handleControl();
  });

  server.begin();
  webSocket.begin();
  webSocket.onEvent(webSocketEvent);

  memset(wateringTimers, 0, sizeof(wateringTimers));
  Serial.println("[System] Agro-Omni V4 Ready.");
}

void loop() {
  // WiFi reconnection
  if (WiFi.status() != WL_CONNECTED) {
    if (millis() - lastReconnect > 10000) {
      lastReconnect = millis();
      Serial.println("[WiFi] Reconnecting...");
      WiFi.disconnect();
      WiFi.begin(ssid, password);
    }
  }

  webSocket.loop();
  server.handleClient();
  checkTimers();

  // Sensor read every 2 seconds
  if (millis() - lastSensorRead > 2000) {
    lastSensorRead = millis();

    float t = dht.readTemperature();
    float h = dht.readHumidity();
    if (isnan(t)) t = 0.0;
    if (isnan(h)) h = 0.0;

    display.clearDisplay();
    display.setCursor(0, 0);
    display.printf("WiFi: %s\n", WiFi.localIP().toString().c_str());
    display.printf("Temp: %.1f C\n", t);
    display.printf("Hum:  %.1f %%\n", h);

    int activeCount = 0;
    for (int i = 0; i < NUM_ZONES; i++)
      if (valveStates[i]) activeCount++;
    display.printf("Active: %d/%d", activeCount, NUM_ZONES);
    if (rainExpected) display.printf("\nRain: SKIP");
    display.display();

    broadcastSensorData();
  }

  // Auto watering check
  if (autoWateringEnabled && millis() - lastAutoCheck > autoCheckInterval) {
    lastAutoCheck = millis();
    autoWateringCheck();
  }
}

// --- RELAY CONTROL ---
void setRelay(int zone, bool state) {
  if (zone < 0 || zone >= NUM_ZONES) return;

  #ifdef USE_GPIO_EXPANDER
    mcp.digitalWrite(zone, state ? LOW : HIGH);
  #else
    if (zone < NUM_DIRECT_RELAYS) {
      digitalWrite(relayPins[zone], state ? LOW : HIGH);
    } else {
      Serial.printf("[Relay] Zone %d needs MCP23017\n", zone);
      return;
    }
  #endif

  valveStates[zone] = state;
}

// --- AUTO WATERING ---
void autoWateringCheck() {
  if (rainExpected) {
    Serial.println("[Auto] Rain expected, skipping");
    return;
  }

  for (int i = 0; i < NUM_ZONES; i++) {
    if (valveStates[i]) continue;
    if (i >= NUM_SOIL_SENSORS) continue;

    int rawValue = analogRead(soilPins[i]);
    int moisturePercent = map(rawValue, 4095, 0, 0, 100);
    moisturePercent = constrain(moisturePercent, 0, 100);

    if (moisturePercent < plantConfigs[i].minMoisture) {
      Serial.printf("[Auto] Zone %d (%s): %d%% < %d%%, watering %.1f min\n",
                    i, plantConfigs[i].name, moisturePercent,
                    plantConfigs[i].minMoisture, plantConfigs[i].waterMins);
      startWatering(i, plantConfigs[i].waterMins);

      // Alert dashboard
      DynamicJsonDocument alert(256);
      alert["type"] = "alert";
      alert["level"] = "info";
      char msg[100];
      snprintf(msg, sizeof(msg), "ري تلقائي: %s (%d%%)",
               plantConfigs[i].name, moisturePercent);
      alert["message"] = msg;
      String alertStr;
      serializeJson(alert, alertStr);
      webSocket.broadcastTXT(alertStr);
    }
  }
}

void setupCamera() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  if (psramFound()) {
    config.frame_size = FRAMESIZE_UXGA;
    config.jpeg_quality = 10;
    config.fb_count = 2;
  } else {
    config.frame_size = FRAMESIZE_SVGA;
    config.jpeg_quality = 12;
    config.fb_count = 1;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("[Error] Camera Init: 0x%x\n", err);
  }
}

void setupWiFi() {
  WiFi.begin(ssid, password);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[WiFi] Connected: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\n[WiFi] Connection Failed");
  }
}

void checkTimers() {
  bool anyRunning = false;
  for (int i = 0; i < NUM_ZONES; i++) {
    if (valveStates[i]) {
      anyRunning = true;
      if (wateringTimers[i] > 0 && millis() > wateringTimers[i]) {
        setRelay(i, false);
        wateringTimers[i] = 0;
        Serial.printf("[Timer] Zone %d stopped\n", i);
        broadcastUpdate();
      }
    }
  }
  if (!anyRunning) {
    digitalWrite(pumpPin, HIGH);
  }
}

void startWatering(int zone, float durationMins) {
  if (zone < 0 || zone >= NUM_ZONES) return;
  setRelay(zone, true);
  digitalWrite(pumpPin, LOW);
  wateringTimers[zone] = millis() + (unsigned long)(durationMins * 60000UL);
  broadcastUpdate();
}

void sendSensorData() {
  DynamicJsonDocument doc(1024);
  doc["type"] = "data";
  doc["t"] = dht.readTemperature();
  doc["h"] = dht.readHumidity();
  doc["freeHeap"] = ESP.getFreeHeap();
  doc["uptime"] = millis() / 1000;
  doc["wifiRSSI"] = WiFi.RSSI();

  JsonArray soils = doc.createNestedArray("soils");
  for (int i = 0; i < NUM_SOIL_SENSORS; i++)
    soils.add(analogRead(soilPins[i]));

  JsonArray valves = doc.createNestedArray("valves");
  for (int i = 0; i < NUM_ZONES; i++)
    valves.add(valveStates[i]);

  String out;
  serializeJson(doc, out);
  server.send(200, "application/json", out);
}

void broadcastSensorData() {
  DynamicJsonDocument doc(1024);
  doc["type"] = "data";
  doc["t"] = dht.readTemperature();
  doc["h"] = dht.readHumidity();
  doc["freeHeap"] = ESP.getFreeHeap();
  doc["uptime"] = millis() / 1000;
  doc["wifiRSSI"] = WiFi.RSSI();

  JsonArray soils = doc.createNestedArray("soils");
  for (int i = 0; i < NUM_SOIL_SENSORS; i++)
    soils.add(analogRead(soilPins[i]));

  JsonArray valves = doc.createNestedArray("valves");
  for (int i = 0; i < NUM_ZONES; i++)
    valves.add(valveStates[i]);

  String msg;
  serializeJson(doc, msg);
  webSocket.broadcastTXT(msg);
}

void handleControl() {
  if (!server.hasArg("zone") || !server.hasArg("state")) {
    server.send(400, "text/plain", "Missing Args");
    return;
  }
  int zone = server.arg("zone").toInt();
  int state = server.arg("state").toInt();

  if (state == 1) {
    float dur = server.hasArg("duration")
                    ? server.arg("duration").toFloat()
                    : plantConfigs[constrain(zone, 0, NUM_ZONES - 1)].waterMins;
    startWatering(zone, dur);
  } else {
    setRelay(zone, false);
    wateringTimers[zone] = 0;
    broadcastUpdate();
  }
  server.send(200, "text/plain", "OK");
}

void webSocketEvent(uint8_t num, WStype_t type, uint8_t *payload, size_t length) {
  switch (type) {
  case WStype_DISCONNECTED:
    Serial.printf("[WS] Client %u disconnected\n", num);
    break;

  case WStype_CONNECTED:
    Serial.printf("[WS] Client %u connected\n", num);
    broadcastSensorData();
    broadcastUpdate();
    break;

  case WStype_TEXT: {
    DynamicJsonDocument doc(256);
    if (deserializeJson(doc, payload, length)) break;

    String cmd = doc["cmd"].as<String>();

    if (cmd == "water") {
      int z = doc["zone"] | -1;
      if (z >= 0 && z < NUM_ZONES) {
        float mins = doc["duration"] | plantConfigs[z].waterMins;
        startWatering(z, mins);
      }
    } else if (cmd == "stop") {
      int z = doc["zone"] | -1;
      if (z >= 0 && z < NUM_ZONES) {
        setRelay(z, false);
        wateringTimers[z] = 0;
        broadcastUpdate();
      }
    } else if (cmd == "getData") {
      broadcastSensorData();
    } else if (cmd == "pumpOn") {
      digitalWrite(pumpPin, LOW);
      broadcastUpdate();
    } else if (cmd == "pumpOff") {
      digitalWrite(pumpPin, HIGH);
      broadcastUpdate();
    } else if (cmd == "setRain") {
      rainExpected = doc["value"] | false;
      Serial.printf("[Weather] Rain: %s\n", rainExpected ? "YES" : "NO");
    }
    break;
  }
  default:
    break;
  }
}

void broadcastUpdate() {
  DynamicJsonDocument doc(512);
  doc["type"] = "update";

  JsonArray valves = doc.createNestedArray("valves");
  for (int i = 0; i < NUM_ZONES; i++)
    valves.add(valveStates[i]);

  doc["pumpOn"] = (digitalRead(pumpPin) == LOW);
  doc["rainExpected"] = rainExpected;

  String msg;
  serializeJson(doc, msg);
  webSocket.broadcastTXT(msg);
}
