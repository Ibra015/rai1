/**
 * Agro-Omni Irrigation Scheduler
 * جدولة الري الزمنية + الجدولة بالعتبات
 */

class IrrigationScheduler {
    constructor() {
        this.schedules = JSON.parse(localStorage.getItem('irrigationSchedules') || '[]');
        this._checkInterval = null;
    }

    start() {
        this._checkInterval = setInterval(() => this.check(), 60000); // كل دقيقة
        this.check();
        this.renderUI();
    }

    addSchedule(zone, startTime, durationMins, daysOfWeek = [0, 1, 2, 3, 4, 5, 6]) {
        const schedule = {
            id: Date.now().toString(36),
            zone,
            startTime, // "HH:MM"
            duration: durationMins,
            days: daysOfWeek,
            enabled: true,
            type: 'time'
        };
        this.schedules.push(schedule);
        this._save();
        this.renderUI();
        return schedule;
    }

    addThresholdSchedule(zone, minMoisture, durationMins) {
        const schedule = {
            id: Date.now().toString(36),
            zone,
            minMoisture,
            duration: durationMins,
            enabled: true,
            type: 'threshold'
        };
        this.schedules.push(schedule);
        this._save();
        this.renderUI();
        return schedule;
    }

    removeSchedule(id) {
        this.schedules = this.schedules.filter(s => s.id !== id);
        this._save();
        this.renderUI();
    }

    toggleSchedule(id) {
        const schedule = this.schedules.find(s => s.id === id);
        if (schedule) {
            schedule.enabled = !schedule.enabled;
            this._save();
            this.renderUI();
        }
    }

    check() {
        const now = new Date();
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const currentDay = now.getDay();

        // فحص حالة المطر
        if (typeof isRainExpected === 'function' && isRainExpected()) {
            return;
        }

        this.schedules.forEach(schedule => {
            if (!schedule.enabled) return;

            if (schedule.type === 'time') {
                if (schedule.startTime === currentTime && schedule.days.includes(currentDay)) {
                    this._executeWatering(schedule);
                }
            }
        });
    }

    _executeWatering(schedule) {
        if (window.irrigationSocket) {
            window.irrigationSocket.sendCommand('water', schedule.zone, schedule.duration);
        }

        const plantName = typeof PLANTS !== 'undefined' && PLANTS[schedule.zone]
            ? PLANTS[schedule.zone].a : `منطقة ${schedule.zone + 1}`;

        if (typeof showNotification === 'function') {
            showNotification(`ري مجدول: ${plantName} (${schedule.duration} دقيقة)`, 'info');
        }
        if (typeof sendPushNotification === 'function') {
            sendPushNotification('Agro-Omni — ري مجدول', `${plantName}: ${schedule.duration} دقيقة`);
        }
    }

    renderUI() {
        const container = document.getElementById('scheduleList');
        if (!container) return;

        if (this.schedules.length === 0) {
            container.innerHTML = '<p style="color:var(--text-sub);text-align:center;padding:20px;">لا توجد جداول ري — أضف جدولاً جديداً</p>';
            return;
        }

        container.innerHTML = '';
        const dayNames = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

        this.schedules.forEach(s => {
            const plantName = typeof PLANTS !== 'undefined' && PLANTS[s.zone]
                ? PLANTS[s.zone].a : `منطقة ${s.zone + 1}`;

            const card = document.createElement('div');
            card.className = 'schedule-card';
            card.style.opacity = s.enabled ? '1' : '0.5';

            const info = document.createElement('div');
            info.className = 'schedule-info';

            if (s.type === 'time') {
                info.innerHTML = `
                    <div class="schedule-time">${s.startTime}</div>
                    <div class="schedule-zone">${plantName} • ${s.duration} دقيقة • ${s.days.map(d => dayNames[d]).join(', ')}</div>
                `;
            } else {
                info.innerHTML = `
                    <div class="schedule-time">عتبة: ${s.minMoisture}%</div>
                    <div class="schedule-zone">${plantName} • ${s.duration} دقيقة (عند انخفاض الرطوبة)</div>
                `;
            }

            const actions = document.createElement('div');
            actions.style.display = 'flex';
            actions.style.gap = '8px';

            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'lang-toggle';
            toggleBtn.textContent = s.enabled ? 'إيقاف' : 'تفعيل';
            toggleBtn.addEventListener('click', () => this.toggleSchedule(s.id));

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'lang-toggle';
            deleteBtn.style.color = 'var(--danger)';
            deleteBtn.textContent = 'حذف';
            deleteBtn.addEventListener('click', () => this.removeSchedule(s.id));

            actions.appendChild(toggleBtn);
            actions.appendChild(deleteBtn);

            card.appendChild(info);
            card.appendChild(actions);
            container.appendChild(card);
        });
    }

    _save() {
        localStorage.setItem('irrigationSchedules', JSON.stringify(this.schedules));
    }

    stop() {
        if (this._checkInterval) {
            clearInterval(this._checkInterval);
            this._checkInterval = null;
        }
    }
}

// إنشاء instance عام
window.irrigationScheduler = new IrrigationScheduler();

document.addEventListener('DOMContentLoaded', () => {
    window.irrigationScheduler.start();
});
