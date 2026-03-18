/**
 * Agro-Omni Dashboard Core
 * إدارة الواجهة، الثيم، البطاقات، الرسوم البيانية، التنبيهات
 */

// ====== نظام الثيم ======
function toggleTheme() {
    const isDark = document.body.classList.toggle('dark-theme');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateThemeIcon(isDark);
}

function updateThemeIcon(isDark) {
    const icon = document.getElementById('themeIcon');
    if (icon) icon.textContent = isDark ? 'light_mode' : 'dark_mode';
}

(function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = savedTheme === 'dark' || (!savedTheme && prefersDark);
    if (isDark) document.body.classList.add('dark-theme');
    updateThemeIcon(isDark);
})();

// ====== التنقل بين الأقسام ======
function switchView(id, btn) {
    document.querySelectorAll('.view-section').forEach(e => e.classList.remove('active'));
    const section = document.getElementById(id);
    if (section) section.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(e => e.classList.remove('active'));
    if (btn) btn.classList.add('active');
}

// ====== تبديل المضخة ======
function togglePump(el) {
    const flowBar = document.getElementById('flowBar');
    const flowDisplay = document.getElementById('flowDisplay');
    if (flowBar) flowBar.style.width = el.checked ? '100%' : '0%';
    if (flowDisplay) flowDisplay.innerText = el.checked ? '45.0 L' : '0.0 L';

    // إرسال أمر عبر WebSocket إذا متصل
    if (window.irrigationSocket) {
        window.irrigationSocket.sendCommand(el.checked ? 'pumpOn' : 'pumpOff');
    }

    showNotification(
        el.checked ? 'تم تشغيل المضخة الرئيسية' : 'تم إيقاف المضخة الرئيسية',
        el.checked ? 'success' : 'info'
    );
}

// ====== بناء بطاقات المناطق (آمن من XSS) ======
function buildZoneCards() {
    const zBox = document.getElementById('zBox');
    if (!zBox || typeof PLANTS === 'undefined') return;

    zBox.innerHTML = '';

    PLANTS.forEach((p, i) => {
        const color = p.m < 40 ? 'var(--danger)' : (p.m > 70 ? 'var(--success)' : 'var(--warning)');

        const card = document.createElement('div');
        card.className = 'zone-card';
        card.id = `zone-${i}`;

        const img = document.createElement('img');
        img.className = 'z-img';
        img.alt = p.a;
        img.src = p.i;
        // SVG placeholder بدلاً من placeholder.com
        img.onerror = function () {
            this.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' fill='%2394a3b8'%3E%3Crect width='80' height='80' rx='10' fill='%23f1f5f9'/%3E%3Ctext x='40' y='45' text-anchor='middle' font-size='12'%3E" + encodeURIComponent(p.a) + "%3C/text%3E%3C/svg%3E";
        };

        const content = document.createElement('div');
        content.className = 'z-content';

        const name = document.createElement('div');
        name.className = 'z-name';
        name.textContent = `${p.a} (${p.n})`;

        const moisture = document.createElement('div');
        moisture.className = 'z-moisture';
        moisture.style.color = color;
        moisture.id = `zone-moisture-${i}`;
        moisture.textContent = `💧 ${p.m}% رطوبة`;

        const switchLabel = document.createElement('label');
        switchLabel.className = 'switch';
        switchLabel.style.cssFloat = 'left';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `zone-toggle-${i}`;
        checkbox.addEventListener('change', function () {
            toggleZone(i, this.checked);
        });

        const slider = document.createElement('span');
        slider.className = 'slider';

        switchLabel.appendChild(checkbox);
        switchLabel.appendChild(slider);

        const bar = document.createElement('div');
        bar.className = 'moisture-bar';

        const fill = document.createElement('div');
        fill.className = 'moisture-fill';
        fill.id = `zone-fill-${i}`;
        fill.style.width = `${p.m}%`;
        fill.style.background = color;
        bar.appendChild(fill);

        content.appendChild(name);
        content.appendChild(moisture);
        content.appendChild(switchLabel);
        content.appendChild(bar);

        card.appendChild(img);
        card.appendChild(content);
        zBox.appendChild(card);
    });
}

function toggleZone(zone, state) {
    if (window.irrigationSocket) {
        window.irrigationSocket.sendCommand(state ? 'water' : 'stop', zone, PLANTS[zone].waterDuration);
    }
    showNotification(
        state ? `بدء ري المنطقة ${zone + 1}: ${PLANTS[zone].a}` : `إيقاف ري المنطقة ${zone + 1}`,
        state ? 'success' : 'info'
    );
}

// ====== تحديث بيانات المناطق من الحساسات ======
function updateZoneMoisture(zoneIndex, moisturePercent) {
    const moistureEl = document.getElementById(`zone-moisture-${zoneIndex}`);
    const fillEl = document.getElementById(`zone-fill-${zoneIndex}`);
    const card = document.getElementById(`zone-${zoneIndex}`);

    if (!moistureEl || !fillEl) return;

    const color = moisturePercent < 40 ? 'var(--danger)' : (moisturePercent > 70 ? 'var(--success)' : 'var(--warning)');

    moistureEl.textContent = `💧 ${moisturePercent}% رطوبة`;
    moistureEl.style.color = color;
    fillEl.style.width = `${moisturePercent}%`;
    fillEl.style.background = color;

    // حفظ القراءة للتاريخ
    recordMoistureReading(zoneIndex, moisturePercent);
}

// ====== الرسم البياني ======
let moistureChart = null;

function initChart() {
    const chartEl = document.getElementById('repChart');
    if (!chartEl || typeof PLANTS === 'undefined') return;

    const isDark = document.body.classList.contains('dark-theme');
    const textColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? '#334155' : '#f1f5f9';

    if (moistureChart) moistureChart.destroy();

    moistureChart = new Chart(chartEl, {
        type: 'bar',
        data: {
            labels: PLANTS.map(p => p.a),
            datasets: [{
                label: 'رطوبة التربة (%)',
                data: PLANTS.map(p => p.m),
                backgroundColor: '#4f46e5',
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, labels: { color: textColor } }
            },
            scales: {
                y: { ticks: { color: textColor }, grid: { color: gridColor } },
                x: { ticks: { color: textColor }, grid: { display: false } }
            }
        }
    });
}

// ====== الرسم البياني التاريخي (7 أيام) ======
function recordMoistureReading(zoneIndex, moisture) {
    const key = 'moistureHistory';
    const readings = JSON.parse(localStorage.getItem(key) || '[]');
    readings.push({ ts: Date.now(), z: zoneIndex, m: moisture });

    // الاحتفاظ بـ 7 أيام فقط
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const filtered = readings.filter(r => Date.now() - r.ts < sevenDays);
    localStorage.setItem(key, JSON.stringify(filtered));
}

function renderHistoryChart() {
    const historyEl = document.getElementById('historyChart');
    if (!historyEl || typeof PLANTS === 'undefined') return;

    const readings = JSON.parse(localStorage.getItem('moistureHistory') || '[]');
    if (readings.length === 0) return;

    const colors = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444',
        '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316'];

    const datasets = PLANTS.map((plant, i) => {
        const zoneReadings = readings.filter(r => r.z === i);
        return {
            label: plant.a,
            data: zoneReadings.map(r => ({ x: r.ts, y: r.m })),
            borderColor: colors[i],
            backgroundColor: 'transparent',
            tension: 0.4,
            pointRadius: 0
        };
    }).filter(ds => ds.data.length > 0);

    if (datasets.length === 0) return;

    new Chart(historyEl, {
        type: 'line',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'linear',
                    ticks: {
                        callback: (val) => new Date(val).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' }),
                        color: '#64748b'
                    },
                    grid: { display: false }
                },
                y: {
                    min: 0, max: 100,
                    ticks: { color: '#64748b' },
                    grid: { color: '#f1f5f9' }
                }
            },
            plugins: {
                legend: { display: true, labels: { color: '#64748b', usePointStyle: true } }
            }
        }
    });
}

// ====== تصدير CSV ======
function exportCSV() {
    const readings = JSON.parse(localStorage.getItem('moistureHistory') || '[]');
    if (readings.length === 0) {
        showNotification('لا توجد بيانات للتصدير', 'warning');
        return;
    }

    let csv = '\uFEFFالتوقيت,المنطقة,النبات,الرطوبة%\n';
    readings.forEach(r => {
        const date = new Date(r.ts).toLocaleString('ar-EG');
        const plant = PLANTS[r.z] ? PLANTS[r.z].a : `منطقة ${r.z}`;
        csv += `${date},${r.z + 1},${plant},${r.m}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agro-omni-data-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showNotification('تم تصدير البيانات بنجاح', 'success');
}

// ====== نظام التنبيهات Toast ======
function showNotification(message, type = 'info') {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        if (toast.parentNode) toast.remove();
    }, 4500);
}

// ====== إشعارات Push ======
async function requestNotifications() {
    if (!('Notification' in window)) return false;
    const permission = await Notification.requestPermission();
    return permission === 'granted';
}

function sendPushNotification(title, body) {
    if (Notification.permission === 'granted') {
        new Notification(title, {
            body,
            icon: 'assets/icons/icon-192.png',
            dir: 'rtl',
            lang: 'ar'
        });
    }
}

// ====== حالة الاتصال ======
function updateConnectionStatus(isOnline) {
    const badge = document.getElementById('statusBadge');
    if (!badge) return;

    if (isOnline) {
        badge.className = 'status-badge';
        badge.innerHTML = '<span class="material-icons-round" style="font-size:14px">wifi</span> النظام متصل • V19';
    } else {
        badge.className = 'status-badge offline';
        badge.innerHTML = '<span class="material-icons-round" style="font-size:14px">wifi_off</span> غير متصل';
    }
}

window.addEventListener('online', () => updateConnectionStatus(true));
window.addEventListener('offline', () => updateConnectionStatus(false));

// ====== صحة النظام ======
function updateSystemHealth(data) {
    const fields = {
        'healthUptime': data.uptime ? formatUptime(data.uptime) : '--',
        'healthHeap': data.freeHeap ? `${Math.round(data.freeHeap / 1024)} KB` : '--',
        'healthWifi': data.wifiRSSI ? `${data.wifiRSSI} dBm` : '--',
        'healthSensors': data.sensorsOk !== undefined ? (data.sensorsOk ? 'سليم' : 'خلل') : '--'
    };

    for (const [id, value] of Object.entries(fields)) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }
}

function formatUptime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h} ساعة ${m} دقيقة`;
}

// ====== المؤشرات الدائرية (Circular Gauges) ======
function updateGauge(id, value, max) {
    const el = document.getElementById(id);
    if (!el) return;
    const circumference = 88; // 2 * PI * 14
    const offset = circumference - (value / max) * circumference;
    el.style.strokeDashoffset = Math.max(0, offset);
}

function updateAllGauges() {
    if (typeof PLANTS === 'undefined') return;

    // حساب متوسط الرطوبة
    const avgM = Math.round(PLANTS.reduce((s, p) => s + p.m, 0) / PLANTS.length);

    // تحديث بيانات الطقس من DOM
    const tempText = document.getElementById('tempKpi')?.textContent || '--';
    const humidText = document.getElementById('humidKpi')?.textContent || '--';
    const temp = parseFloat(tempText) || 0;
    const humid = parseFloat(humidText) || 0;

    updateGauge('tempGauge', Math.min(temp, 50), 50);
    updateGauge('humidGauge', humid, 100);
    updateGauge('flowGauge', avgM, 100);

    // استهلاك المياه اليوم
    const todayUsage = getWaterUsageToday();
    const waterEl = document.getElementById('waterUsageKpi');
    if (waterEl) waterEl.textContent = `${todayUsage} L`;
    updateGauge('waterGauge', Math.min(todayUsage, 200), 200);
}

// ====== استهلاك المياه ======
function recordWaterUsage(liters) {
    const key = 'waterUsage';
    const data = JSON.parse(localStorage.getItem(key) || '[]');
    data.push({ ts: Date.now(), l: liters });
    // احتفظ بـ 30 يوم
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    localStorage.setItem(key, JSON.stringify(data.filter(r => Date.now() - r.ts < thirtyDays)));
}

function getWaterUsageToday() {
    const data = JSON.parse(localStorage.getItem('waterUsage') || '[]');
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return Math.round(data.filter(r => r.ts >= todayStart.getTime()).reduce((s, r) => s + r.l, 0));
}

function renderWaterUsageChart() {
    const el = document.getElementById('waterUsageChart');
    if (!el) return;

    const data = JSON.parse(localStorage.getItem('waterUsage') || '[]');
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        const nextDay = new Date(d);
        nextDay.setDate(nextDay.getDate() + 1);
        const dayUsage = data.filter(r => r.ts >= d.getTime() && r.ts < nextDay.getTime()).reduce((s, r) => s + r.l, 0);
        days.push({
            label: d.toLocaleDateString('ar-EG', { weekday: 'short' }),
            value: Math.round(dayUsage)
        });
    }

    new Chart(el, {
        type: 'bar',
        data: {
            labels: days.map(d => d.label),
            datasets: [{
                label: 'استهلاك المياه (لتر)',
                data: days.map(d => d.value),
                backgroundColor: 'rgba(14, 165, 233, 0.6)',
                borderColor: '#0ea5e9',
                borderWidth: 1,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { ticks: { color: '#64748b' }, grid: { color: '#f1f5f9' } },
                x: { ticks: { color: '#64748b' }, grid: { display: false } }
            }
        }
    });
}

// ====== خريطة المزرعة ======
function buildFarmLayout() {
    const grid = document.getElementById('farmGrid');
    if (!grid || typeof PLANTS === 'undefined') return;

    grid.innerHTML = '';
    PLANTS.forEach((p, i) => {
        const zone = document.createElement('div');
        zone.className = 'farm-zone';
        zone.id = `farm-zone-${i}`;

        const color = p.m < 40 ? 'danger' : '';
        if (color) zone.classList.add(color);

        const moistureColor = p.m < 40 ? 'var(--danger)' : (p.m > 70 ? 'var(--success)' : 'var(--warning)');

        zone.innerHTML = `
            <img class="farm-zone-img" src="${p.i}" alt="${p.a}" onerror="this.style.display='none'">
            <div class="farm-zone-name">${p.a}</div>
            <div class="farm-zone-moisture" style="color:${moistureColor}" id="farm-moisture-${i}">${p.m}%</div>
        `;

        zone.onclick = () => {
            if (typeof toggleZone === 'function') {
                const toggle = document.getElementById(`zone-toggle-${i}`);
                if (toggle) {
                    toggle.checked = !toggle.checked;
                    toggleZone(i, toggle.checked);
                }
            }
        };

        grid.appendChild(zone);
    });
}

function updateFarmZone(zoneIndex, moisture, isWatering) {
    const zone = document.getElementById(`farm-zone-${zoneIndex}`);
    const moistureEl = document.getElementById(`farm-moisture-${zoneIndex}`);
    if (!zone || !moistureEl) return;

    const color = moisture < 40 ? 'var(--danger)' : (moisture > 70 ? 'var(--success)' : 'var(--warning)');
    moistureEl.textContent = `${moisture}%`;
    moistureEl.style.color = color;

    zone.classList.toggle('danger', moisture < 40);
    zone.classList.toggle('active', isWatering);
}

// ====== سجل الأحداث ======
function logEvent(title, type = 'info') {
    const events = JSON.parse(localStorage.getItem('eventLog') || '[]');
    events.unshift({ title, type, ts: Date.now() });
    // احتفظ بـ 200 حدث
    if (events.length > 200) events.length = 200;
    localStorage.setItem('eventLog', JSON.stringify(events));
    renderEventLog();
}

function renderEventLog() {
    const container = document.getElementById('eventLogList');
    if (!container) return;

    const events = JSON.parse(localStorage.getItem('eventLog') || '[]');
    if (events.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:var(--text-sub);padding:40px;">لا توجد أحداث بعد</p>';
        return;
    }

    container.innerHTML = events.slice(0, 50).map(e => {
        const icons = { water: 'water_drop', alert: 'warning', info: 'info', success: 'check_circle' };
        const time = new Date(e.ts).toLocaleString('ar-EG', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
        return `
            <div class="event-item">
                <div class="event-icon ${e.type}"><span class="material-icons-round">${icons[e.type] || 'info'}</span></div>
                <div class="event-text">
                    <div class="event-title">${e.title}</div>
                    <div class="event-time">${time}</div>
                </div>
            </div>
        `;
    }).join('');
}

function clearEventLog() {
    if (confirm('حذف سجل الأحداث؟')) {
        localStorage.removeItem('eventLog');
        renderEventLog();
        showNotification('تم مسح السجل', 'info');
    }
}

// ====== عتبات النباتات ======
function renderThresholdEditor() {
    const container = document.getElementById('thresholdList');
    if (!container || typeof PLANTS === 'undefined') return;

    container.innerHTML = PLANTS.map((p, i) => `
        <div class="threshold-card">
            <img class="threshold-img" src="${p.i}" alt="${p.a}" onerror="this.style.display='none'">
            <div class="threshold-info">
                <div class="threshold-name">${p.a} (${p.n})</div>
                <div class="threshold-range">
                    <span id="threshMin-${i}">${p.minMoisture}%</span>
                    <input type="range" min="5" max="95" value="${p.minMoisture}"
                        oninput="updateThreshold(${i}, 'min', this.value)">
                    <input type="range" min="5" max="95" value="${p.maxMoisture}"
                        oninput="updateThreshold(${i}, 'max', this.value)">
                    <span id="threshMax-${i}">${p.maxMoisture}%</span>
                </div>
            </div>
        </div>
    `).join('');
}

function updateThreshold(index, type, value) {
    if (typeof PLANTS === 'undefined') return;
    value = parseInt(value);

    if (type === 'min') {
        PLANTS[index].minMoisture = value;
        const el = document.getElementById(`threshMin-${index}`);
        if (el) el.textContent = `${value}%`;
    } else {
        PLANTS[index].maxMoisture = value;
        const el = document.getElementById(`threshMax-${index}`);
        if (el) el.textContent = `${value}%`;
    }

    localStorage.setItem('plantThresholds', JSON.stringify(
        PLANTS.map(p => ({ min: p.minMoisture, max: p.maxMoisture }))
    ));
}

function loadSavedThresholds() {
    const saved = JSON.parse(localStorage.getItem('plantThresholds') || '[]');
    if (saved.length > 0 && typeof PLANTS !== 'undefined') {
        saved.forEach((s, i) => {
            if (PLANTS[i]) {
                PLANTS[i].minMoisture = s.min;
                PLANTS[i].maxMoisture = s.max;
            }
        });
    }
}

// ====== تنبيهات ذكية ======
function generateSmartAlerts() {
    const container = document.getElementById('smartAlerts');
    if (!container || typeof PLANTS === 'undefined') return;

    const alerts = [];

    PLANTS.forEach((p, i) => {
        if (p.m < p.minMoisture) {
            alerts.push({ text: `${p.a} (المنطقة ${i + 1}) رطوبتها ${p.m}% — تحت الحد الأدنى ${p.minMoisture}%`, type: '', icon: '🚨' });
        } else if (p.m < p.minMoisture + 10) {
            alerts.push({ text: `${p.a} (المنطقة ${i + 1}) رطوبتها ${p.m}% — قريبة من الحد الأدنى`, type: 'warning', icon: '⚠️' });
        }
    });

    if (typeof isRainExpected === 'function' && isRainExpected()) {
        alerts.push({ text: 'أمطار متوقعة — الري التلقائي معلّق', type: 'success', icon: '🌧️' });
    }

    if (alerts.length === 0) {
        alerts.push({ text: 'جميع المناطق بحالة جيدة', type: 'success', icon: '✅' });
    }

    container.innerHTML = alerts.map(a =>
        `<div class="smart-alert ${a.type}"><span class="smart-alert-icon">${a.icon}</span><span class="smart-alert-text">${a.text}</span></div>`
    ).join('');
}

// ====== ملخص التقارير ======
function updateReportSummary() {
    if (typeof PLANTS === 'undefined') return;

    const avgM = Math.round(PLANTS.reduce((s, p) => s + p.m, 0) / PLANTS.length);
    const lowCount = PLANTS.filter(p => p.m < p.minMoisture).length;
    const todayUsage = getWaterUsageToday();
    const events = JSON.parse(localStorage.getItem('eventLog') || '[]');
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEvents = events.filter(e => e.ts >= todayStart.getTime() && e.type === 'water').length;

    const update = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    update('totalWaterUsed', `${todayUsage} L`);
    update('totalWateringEvents', todayEvents);
    update('avgMoisture', `${avgM}%`);
    update('lowMoistureCount', lowCount);
}

// ====== تهيئة عند التحميل ======
document.addEventListener('DOMContentLoaded', () => {
    loadSavedThresholds();
    buildZoneCards();
    buildFarmLayout();
    initChart();
    renderHistoryChart();
    renderWaterUsageChart();
    renderEventLog();
    renderThresholdEditor();
    generateSmartAlerts();
    updateReportSummary();
    updateConnectionStatus(navigator.onLine);
    requestNotifications();

    // تحديث المؤشرات الدائرية كل 5 ثوانٍ
    setInterval(() => {
        updateAllGauges();
        generateSmartAlerts();
        updateReportSummary();
    }, 5000);

    // تحديث أولي
    setTimeout(updateAllGauges, 1000);
});

// تكامل مع نظام الأحداث (Override toggleZone)
const _origToggleZone = typeof toggleZone !== 'undefined' ? toggleZone : null;
if (_origToggleZone) {
    window.toggleZone = function(zone, state) {
        _origToggleZone(zone, state);
        const plantName = PLANTS[zone] ? PLANTS[zone].a : `منطقة ${zone + 1}`;
        logEvent(state ? `بدء ري: ${plantName}` : `إيقاف ري: ${plantName}`, state ? 'water' : 'info');
        if (state) recordWaterUsage(PLANTS[zone] ? PLANTS[zone].waterDuration * 15 : 45);
        updateFarmZone(zone, PLANTS[zone]?.m || 0, state);
    };
}

// إعادة رسم عند تغيير الثيم
const _origToggleTheme = toggleTheme;
toggleTheme = function () {
    _origToggleTheme();
    setTimeout(initChart, 100);
};
