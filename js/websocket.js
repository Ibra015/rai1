/**
 * Agro-Omni WebSocket Client
 * اتصال حقيقي مع ESP32 عبر WebSocket
 */

class IrrigationSocket {
    constructor() {
        this.ws = null;
        this.reconnectInterval = 3000;
        this.maxReconnectAttempts = 10;
        this.reconnectAttempts = 0;
        this.isConnected = false;
        this.serverIP = null;
        this.onDataCallback = null;
        this.onStatusCallback = null;
    }

    connect(ip) {
        if (!ip) {
            // محاولة استخدام IP من URL الحالي (عند الوصول من ESP32 مباشرة)
            ip = window.location.hostname;
            if (ip === '' || ip === 'localhost' || ip === '127.0.0.1') {
                console.log('[WS] وضع المحاكاة — لا يوجد ESP32');
                this.simulationMode = true;
                this._startSimulation();
                return;
            }
        }

        this.serverIP = ip;
        this._connectWS();
    }

    _connectWS() {
        try {
            this.ws = new WebSocket(`ws://${this.serverIP}:81`);

            this.ws.onopen = () => {
                console.log('[WS] متصل بـ ESP32');
                this.isConnected = true;
                this.reconnectAttempts = 0;

                if (typeof updateConnectionStatus === 'function') {
                    updateConnectionStatus(true);
                }
                if (typeof showNotification === 'function') {
                    showNotification('تم الاتصال بنظام الري', 'success');
                }

                // طلب البيانات الأولية
                this.sendCommand('getData');
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this._handleMessage(data);
                } catch (e) {
                    console.warn('[WS] رسالة غير صالحة:', event.data);
                }
            };

            this.ws.onclose = () => {
                console.log('[WS] انقطع الاتصال');
                this.isConnected = false;

                if (typeof updateConnectionStatus === 'function') {
                    updateConnectionStatus(false);
                }

                // إعادة المحاولة
                if (this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++;
                    setTimeout(() => this._connectWS(), this.reconnectInterval);
                }
            };

            this.ws.onerror = (error) => {
                console.error('[WS] خطأ:', error);
            };

        } catch (e) {
            console.error('[WS] فشل الاتصال:', e);
        }
    }

    _handleMessage(data) {
        switch (data.type) {
            case 'update':
                this._handleValveUpdate(data);
                break;
            case 'data':
                this._handleSensorData(data);
                break;
            case 'health':
                if (typeof updateSystemHealth === 'function') {
                    updateSystemHealth(data);
                }
                break;
            case 'alert':
                if (typeof showNotification === 'function') {
                    showNotification(data.message, data.level || 'warning');
                }
                if (typeof sendPushNotification === 'function') {
                    sendPushNotification('Agro-Omni', data.message);
                }
                break;
        }

        if (this.onDataCallback) this.onDataCallback(data);
    }

    _handleValveUpdate(data) {
        if (!data.valves) return;

        data.valves.forEach((state, i) => {
            const toggle = document.getElementById(`zone-toggle-${i}`);
            const card = document.getElementById(`zone-${i}`);

            if (toggle && toggle.checked !== state) {
                toggle.checked = state;
            }
            if (card) {
                card.classList.toggle('watering', state);
            }
        });
    }

    _handleSensorData(data) {
        // تحديث درجة الحرارة والرطوبة
        if (data.t !== undefined) {
            const tempKpi = document.getElementById('tempKpi');
            if (tempKpi && !isNaN(data.t)) tempKpi.innerText = `${Math.round(data.t)}°C`;
        }
        if (data.h !== undefined) {
            const humidKpi = document.getElementById('humidKpi');
            if (humidKpi && !isNaN(data.h)) humidKpi.innerText = `${Math.round(data.h)}%`;
        }

        // تحديث رطوبة التربة
        if (data.soils && Array.isArray(data.soils)) {
            data.soils.forEach((raw, i) => {
                // تحويل القراءة الخام (0-4095) إلى نسبة مئوية
                const percent = Math.round(Math.max(0, Math.min(100, (4095 - raw) / 4095 * 100)));
                if (typeof updateZoneMoisture === 'function') {
                    updateZoneMoisture(i, percent);
                }
            });
        }

        // تحديث حالة الصمامات
        if (data.valves) this._handleValveUpdate(data);
    }

    sendCommand(cmd, zone, duration) {
        if (this.simulationMode) {
            console.log(`[WS Sim] أمر: ${cmd}, منطقة: ${zone}, مدة: ${duration}`);
            return;
        }

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const msg = { cmd };
            if (zone !== undefined) msg.zone = zone;
            if (duration !== undefined) msg.duration = duration;
            this.ws.send(JSON.stringify(msg));
        } else {
            console.warn('[WS] غير متصل — لا يمكن إرسال الأمر');
        }
    }

    // وضع المحاكاة عند عدم وجود ESP32
    _startSimulation() {
        console.log('[WS] تفعيل وضع المحاكاة');

        // تحديث دوري للبيانات المحاكاة
        setInterval(() => {
            if (typeof PLANTS !== 'undefined') {
                PLANTS.forEach((plant, i) => {
                    // تغيير طفيف عشوائي في الرطوبة
                    const variation = (Math.random() - 0.5) * 4;
                    const newMoisture = Math.max(5, Math.min(95, plant.m + variation));
                    plant.m = Math.round(newMoisture);

                    if (typeof updateZoneMoisture === 'function') {
                        updateZoneMoisture(i, plant.m);
                    }
                });
            }
        }, 10000);
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
    }
}

// إنشاء instance عام
window.irrigationSocket = new IrrigationSocket();

// الاتصال التلقائي عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    window.irrigationSocket.connect();
});
