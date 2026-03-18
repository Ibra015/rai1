/**
 * Agro-Omni Weather Module
 * جلب بيانات الطقس من Open-Meteo API مع دعم الموقع الجغرافي
 */

let _weatherData = null;
let _weatherInterval = null;

async function initWeather() {
    const defaultLat = 30.0444;
    const defaultLon = 31.2357;

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => fetchWeather(position.coords.latitude, position.coords.longitude),
            () => {
                console.log("[Weather] تم رفض الموقع، استخدام القاهرة كافتراضي");
                fetchWeather(defaultLat, defaultLon);
            }
        );
    } else {
        fetchWeather(defaultLat, defaultLon);
    }

    // تحديث كل 5 دقائق
    if (_weatherInterval) clearInterval(_weatherInterval);
    _weatherInterval = setInterval(() => initWeather(), 300000);
}

async function fetchWeather(lat, lon) {
    const tempKpi = document.getElementById('tempKpi');
    const humidKpi = document.getElementById('humidKpi');
    const weatherTemp = document.getElementById('weatherTemp');
    const weatherDetails = document.getElementById('weatherDetails');

    if (tempKpi) tempKpi.innerText = "...";
    if (humidKpi) humidKpi.innerText = "...";

    try {
        const response = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,is_day,precipitation&timezone=auto`
        );
        const data = await response.json();

        if (!data.current) throw new Error("لا توجد بيانات طقس");

        const current = data.current;
        const temp = Math.round(current.temperature_2m);
        const humidity = current.relative_humidity_2m;
        const wind = current.wind_speed_10m;
        const isDay = current.is_day;
        const precipitation = current.precipitation || 0;

        // حفظ البيانات للاستخدام من أجزاء أخرى
        _weatherData = { temp, humidity, wind, isDay, precipitation, timestamp: Date.now() };

        // تحديث لوحة التحكم
        if (tempKpi) tempKpi.innerText = `${temp}°C`;
        if (humidKpi) humidKpi.innerText = `${humidity}%`;
        if (weatherTemp) weatherTemp.innerText = `${temp}°C`;
        if (weatherDetails) weatherDetails.innerText = `رياح: ${wind} كم/س • رطوبة: ${humidity}%`;

        // تحديث أيقونة الطقس
        const weatherIcon = document.getElementById('weatherIcon');
        if (weatherIcon) {
            weatherIcon.textContent = precipitation > 0 ? 'rainy' : (isDay ? 'wb_sunny' : 'nights_stay');
        }

        // إطلاق حدث للمكونات الأخرى
        window.dispatchEvent(new CustomEvent('weatherUpdate', { detail: _weatherData }));

    } catch (error) {
        console.error("[Weather] خطأ:", error);
        if (tempKpi) tempKpi.innerText = "--°C";
        if (humidKpi) humidKpi.innerText = "--%";
    }
}

function getWeatherData() {
    return _weatherData;
}

function isRainExpected() {
    return _weatherData && _weatherData.precipitation > 0;
}

window.addEventListener('DOMContentLoaded', initWeather);
