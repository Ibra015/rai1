/**
 * Agro-Omni Internationalization (i18n)
 * دعم العربية والإنجليزية
 */

const TRANSLATIONS = {
    ar: {
        dashboard: 'الرئيسية',
        reports: 'التقارير',
        settings: 'الإعدادات',
        health: 'صحة النظام',
        pageTitle: 'لوحة التحكم المركزية',
        statusOnline: 'النظام متصل',
        statusOffline: 'غير متصل',
        temperature: 'درجة الحرارة',
        humidity: 'الرطوبة',
        solarEnergy: 'الطاقة الشمسية',
        pumpFlow: 'تدفق المضخة',
        cameraTitle: 'كاميرا التعرف على النباتات',
        startCamera: 'تشغيل الكاميرا',
        weatherTitle: 'حالة الطقس',
        pumpControl: 'التحكم بالمضخة',
        mainPump: 'المضخة الرئيسية',
        zonesControl: 'التحكم بالمناطق',
        activeZones: 'مناطق نشطة',
        moisture: 'رطوبة',
        reportsTitle: 'التقارير التفصيلية',
        exportData: 'تصدير البيانات',
        historyTitle: 'سجل الرطوبة (7 أيام)',
        settingsTitle: 'الإعدادات',
        scheduleTitle: 'جدولة الري',
        addSchedule: 'إضافة جدول',
        healthTitle: 'صحة النظام',
        uptime: 'وقت التشغيل',
        freeMemory: 'الذاكرة المتاحة',
        wifiSignal: 'إشارة WiFi',
        sensorsStatus: 'حالة الحساسات',
        aiStatus: 'حالة الذكاء الاصطناعي',
        aiWaiting: 'في الانتظار...',
        aiLoading: 'جاري تحميل النموذج...',
        aiActive: 'الذكاء الاصطناعي نشط',
        aiFailed: 'فشل تحميل النموذج',
        devMode: 'وضع المطور',
        soilMoisture: 'رطوبة التربة (%)',
        noData: 'لا توجد بيانات',
        loading: 'جاري التحميل...',
        lang: 'EN'
    },
    en: {
        dashboard: 'Dashboard',
        reports: 'Reports',
        settings: 'Settings',
        health: 'Health',
        pageTitle: 'Central Control Panel',
        statusOnline: 'System Online',
        statusOffline: 'Offline',
        temperature: 'Temperature',
        humidity: 'Humidity',
        solarEnergy: 'Solar Energy',
        pumpFlow: 'Pump Flow',
        cameraTitle: 'Plant Recognition Camera',
        startCamera: 'Start Camera',
        weatherTitle: 'Weather Status',
        pumpControl: 'Pump Control',
        mainPump: 'Main Pump',
        zonesControl: 'Zone Control',
        activeZones: 'active zones',
        moisture: 'moisture',
        reportsTitle: 'Detailed Reports',
        exportData: 'Export Data',
        historyTitle: 'Moisture History (7 days)',
        settingsTitle: 'Settings',
        scheduleTitle: 'Irrigation Schedule',
        addSchedule: 'Add Schedule',
        healthTitle: 'System Health',
        uptime: 'Uptime',
        freeMemory: 'Free Memory',
        wifiSignal: 'WiFi Signal',
        sensorsStatus: 'Sensors Status',
        aiStatus: 'AI Status',
        aiWaiting: 'Waiting...',
        aiLoading: 'Loading model...',
        aiActive: 'AI Active',
        aiFailed: 'Model load failed',
        devMode: 'Dev Mode',
        soilMoisture: 'Soil Moisture (%)',
        noData: 'No data',
        loading: 'Loading...',
        lang: 'عربي'
    }
};

let currentLang = localStorage.getItem('language') || 'ar';

function setLanguage(lang) {
    currentLang = lang;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    localStorage.setItem('language', lang);

    // تحديث كل العناصر التي تحمل data-i18n
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        if (TRANSLATIONS[lang][key]) {
            el.textContent = TRANSLATIONS[lang][key];
        }
    });

    // تحديث زر اللغة
    const langBtn = document.getElementById('langToggle');
    if (langBtn) langBtn.textContent = TRANSLATIONS[lang].lang;

    // إطلاق حدث
    window.dispatchEvent(new CustomEvent('languageChange', { detail: { lang } }));
}

function toggleLanguage() {
    setLanguage(currentLang === 'ar' ? 'en' : 'ar');
}

function t(key) {
    return TRANSLATIONS[currentLang][key] || key;
}

// تهيئة اللغة عند التحميل
document.addEventListener('DOMContentLoaded', () => {
    setLanguage(currentLang);
});
