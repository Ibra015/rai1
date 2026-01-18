/*
 * =========================================================================
 *  PROJECT: AGRO-OMNI SMART IRRIGATION SYSTEM (V3 Final)
 * =========================================================================
 *
 *  IMPORTANT SETUP INSTRUCTIONS (READ CAREFULLY):
 *  1. In Arduino IDE, go to Tools > Board > ESP32 Arduino > Select "AI Thinker
 * ESP32-CAM".
 *  2. Go to Tools > Partition Scheme > Select "Huge APP (3MB No OTA/1MB
 * SPIFFS)". (This is CRITICAL to fit the camera code and web server).
 *  3. Install Libraries (Sketch > Include Library > Manage Libraries):
 *     - "Adafruit GFX Library"
 *     - "Adafruit SSD1306"
 *     - "ArduinoJson" (by Benoit Blanchon)
 *     - "DHT sensor library" (by Adafruit)
 *     - "WebSockets" (by Markus Sattler)
 *
 *  NOTE ON PINS:
 *  - The ESP32-CAM uses almost all GPIOs for the Camera.
 *  - Using WiFi disables ADC2 pins (GPIO 0,2,4,12,13,14,15,25,26,27).
 *  - You might experience noise on sensors if connected to these pins.
 *  - Best practice: Use an external I2C Mux (ADS1115) for stable readings.
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

// --- CAMERA CONFIG (AI THINKER MODEL) ---
#define CAMERA_MODEL_AI_THINKER
#if defined(CAMERA_MODEL_AI_THINKER)
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
#else
#error "Camera model not selected"
#endif

// --- SENSORS & ACTUATORS ---
#define DHTPIN 13 // IO13 (Free on most boards)
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

// PINS CONFIGURATION
// WARNING: ESP32-CAM has very few free pins.
// Using these requires disabling camera features or using specific 'SD Card'
// mode pins. We proceed with the User's requested mapping, but stability
// depends on wiring.
const int soilPins[6] = {12, 14, 15, 16, 17, 18};
const int relayPins[9] = {2, 4, 19, 21, 22, 25, 26, 27};
const int pumpPin =
    33; // Usually the internal LED on some boards, check schematic.

// --- NETWORK CREDENTIALS ---
const char *ssid = "YOUR_WIFI_SSID";         // <--- CHANGE THIS
const char *password = "YOUR_WIFI_PASSWORD"; // <--- CHANGE THIS

WebServer server(80);
WebSocketsServer webSocket = WebSocketsServer(81);

// --- LOGIC VARIABLES ---
bool valveStates[10] = {false};
unsigned long wateringTimers[10] = {0};
unsigned long lastSensorRead = 0;

// Function Prototypes
void setupCamera();
void setupWiFi();
void checkTimers();
void sendSensorData();
void handleControl();
void broadcastUpdate();
void webSocketEvent(uint8_t num, WStype_t type, uint8_t *payload,
                    size_t length);

void setup() {
  Serial.begin(115200);
  Serial.println("\n[System] Booting Agro-Omni V3...");

  // 1. Initialize Pins
  pinMode(pumpPin, OUTPUT);
  digitalWrite(pumpPin, HIGH); // Assuming Active LOW Relay

  for (int i = 0; i < 6; i++)
    pinMode(soilPins[i], INPUT);
  for (int i = 0; i < 9; i++) {
    pinMode(relayPins[i], OUTPUT);
    digitalWrite(relayPins[i], HIGH); // Active LOW
  }

  // 2. Initialize Sensors (Display/DHT)
  dht.begin();

  // Try initializing OLED on default I2C (SDA=14, SCL=15 on some boards, check
  // wire) Or standard Wire (21, 22). NOTE: ESP32-CAM doesn't have standard I2C
  // pins exposed easily. We assume User has configured Wire pins correctly in
  // library or hardware.
  Wire.begin(14, 15); // Custom I2C pins for ESP32-CAM often used

  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println(F("[Error] SSD1306 not found"));
  } else {
    display.clearDisplay();
    display.setTextColor(WHITE);
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.println("Agro-Omni System");
    display.println("Initializing...");
    display.display();
  }

  // 3. Initialize Camera
  setupCamera();

  // 4. Mount SPIFFS (Filesystem)
  if (!SPIFFS.begin(true)) {
    Serial.println("[Error] SPIFFS Mount Failed");
  } else {
    Serial.println("[System] SPIFFS Mounted");
  }

  // 5. Connect WiFi
  setupWiFi();

  // 6. Setup Web Server
  server.on("/", HTTP_GET, []() {
    File file = SPIFFS.open("/dashboard_simulation.html", "r");
    if (!file) {
      server.send(500, "text/plain",
                  "Dashboard File Missing in SPIFFS. Upload Data.");
      return;
    }
    server.streamFile(file, "text/html");
    file.close();
  });

  server.on("/data", HTTP_GET, sendSensorData);
  server.on("/control", HTTP_POST, handleControl);

  server.begin();
  webSocket.begin();
  webSocket.onEvent(webSocketEvent);

  Serial.println("[System] Ready.");
}

void loop() {
  // Keep connections alive
  if (WiFi.status() != WL_CONNECTED) {
    // Optional: Reconnect logic here
  }

  webSocket.loop();
  server.handleClient();

  checkTimers();

  // Periodic Sensor Read (every 2 seconds)
  if (millis() - lastSensorRead > 2000) {
    lastSensorRead = millis();

    // Read DHT
    float t = dht.readTemperature();
    float h = dht.readHumidity();

    // Convert float to int safe for display
    if (isnan(t))
      t = 0.0;
    if (isnan(h))
      h = 0.0;

    // Update OLED
    display.clearDisplay();
    display.setCursor(0, 0);
    display.printf("WiFi: %s\n", WiFi.localIP().toString().c_str());
    display.printf("Temp: %.1f C\n", t);
    display.printf("Hum:  %.1f %%\n", h);

    int activeCount = 0;
    for (bool s : valveStates)
      if (s)
        activeCount++;
    display.printf("Active Valves: %d", activeCount);

    display.display();
  }
}

// --- HARDWARE FUNCTIONS ---

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
    config.frame_size = FRAMESIZE_UXGA; // High Quality
    config.jpeg_quality = 10;
    config.fb_count = 2;
  } else {
    config.frame_size = FRAMESIZE_SVGA;
    config.jpeg_quality = 12;
    config.fb_count = 1;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera Init Failed: 0x%x\n", err);
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
    Serial.println("\nWiFi Connected");
  } else {
    Serial.println("\nWiFi Timed Out (Check Credentials)");
  }
}

void checkTimers() {
  bool anyRunning = false;
  for (int i = 0; i < 10; i++) {
    if (valveStates[i]) {
      anyRunning = true;
      if (millis() > wateringTimers[i]) {
        // Stop Valve
        int relayIndex = i % 9;                    // Safety mapping
        digitalWrite(relayPins[relayIndex], HIGH); // OFF
        valveStates[i] = false;
        wateringTimers[i] = 0;
        broadcastUpdate();
      }
    }
  }
  // Master Pump Logic: If no valve is running, turn off pump
  if (!anyRunning) {
    digitalWrite(pumpPin, HIGH); // OFF
  }
}

void startWatering(int zone, float durationMins) {
  if (zone < 0 || zone >= 10)
    return;

  // 1. Turn on Relay
  int relayIndex = zone % 9;
  digitalWrite(relayPins[relayIndex], LOW); // ON

  // 2. Turn on Pump
  digitalWrite(pumpPin, LOW); // ON

  // 3. Set Timer
  valveStates[zone] = true;
  wateringTimers[zone] = millis() + (unsigned long)(durationMins * 60000UL);

  broadcastUpdate();
}

void sendSensorData() {
  DynamicJsonDocument doc(1024);
  doc["type"] = "data";
  doc["t"] = dht.readTemperature();
  doc["h"] = dht.readHumidity();

  JsonArray soils = doc.createNestedArray("soils");
  for (int i = 0; i < 6; i++) {
    // Note: analogRead might conflict with WiFi on ADC2.
    // If you see '0' or random noise, this is why.
    soils.add(analogRead(soilPins[i]));
  }

  JsonArray valves = doc.createNestedArray("valves");
  for (bool s : valveStates)
    valves.add(s);

  String out;
  serializeJson(doc, out);
  server.send(200, "application/json", out);
}

void handleControl() {
  if (!server.hasArg("zone") || !server.hasArg("state")) {
    server.send(400, "text/plain", "Missing Args");
    return;
  }
  int zone = server.arg("zone").toInt();
  int state = server.arg("state").toInt();

  if (state == 1) {
    startWatering(zone, 1.0); // Default 1 min
  } else {
    // Manually Stop
    valveStates[zone] = false;
    int relayIndex = zone % 9;
    digitalWrite(relayPins[relayIndex], HIGH); // OFF
    broadcastUpdate();
  }
  server.send(200, "text/plain", "OK");
}

void webSocketEvent(uint8_t num, WStype_t type, uint8_t *payload,
                    size_t length) {
  // Handle incoming websocket messages if needed
}

void broadcastUpdate() {
  // Notify all dashboard clients of change
  DynamicJsonDocument doc(512);
  doc["type"] = "update";
  JsonArray valves = doc.createNestedArray("valves");
  for (bool s : valveStates)
    valves.add(s);

  String msg;
  serializeJson(doc, msg);
  webSocket.broadcastTXT(msg);
}
