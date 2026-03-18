/*
 * Agro-Omni Configuration Template
 * انسخ هذا الملف إلى config.h وعدّل القيم
 * cp config.example.h config.h
 */

#ifndef CONFIG_H
#define CONFIG_H

// بيانات شبكة WiFi
const char *ssid = "YOUR_WIFI_SSID";
const char *password = "YOUR_WIFI_PASSWORD";

// مصادقة لوحة التحكم (Basic Auth)
const char *authUser = "admin";
const char *authPassword = "agro2026";

// رمز WebSocket
const char *wsAuthToken = "agro-omni-secret-token";

// إعدادات الري التلقائي
const bool autoWateringEnabled = true;
const unsigned long autoCheckInterval = 30000; // كل 30 ثانية

#endif
