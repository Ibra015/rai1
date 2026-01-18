async function initWeather() {
    const defaultLat = 30.0444; // Cairo, Egypt (fallback)
    const defaultLon = 31.2357;

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => fetchWeather(position.coords.latitude, position.coords.longitude),
            () => {
                console.log("Location access denied. Using default.");
                fetchWeather(defaultLat, defaultLon);
            }
        );
    } else {
        fetchWeather(defaultLat, defaultLon);
    }
}

async function fetchWeather(lat, lon) {
    // DOM Elements
    const tempKpi = document.getElementById('tempKpi');
    const humidKpi = document.getElementById('humidKpi');
    const weatherWidgetTemp = document.getElementById('weatherWidgetTemp');
    const weatherWidgetDetails = document.getElementById('weatherWidgetDetails');

    // UI Feedback (Loading)
    const loadingText = "...";
    if (tempKpi) tempKpi.innerText = loadingText;
    if (humidKpi) humidKpi.innerText = loadingText;

    try {
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,is_day&timezone=auto`);
        const data = await response.json();

        if (!data.current) throw new Error("No weather data");

        const current = data.current;
        const temp = Math.round(current.temperature_2m);
        const humidity = current.relative_humidity_2m;
        const wind = current.wind_speed_10m;
        const isDay = current.is_day;

        // Update Dashboard
        if (tempKpi) tempKpi.innerText = `${temp}°C`;
        if (humidKpi) humidKpi.innerText = `${humidity}%`;

        // Update Side Widget
        if (weatherWidgetTemp) weatherWidgetTemp.innerText = `${temp}°C`;
        if (weatherWidgetDetails) weatherWidgetDetails.innerText = `Wind: ${wind} km/h • Humidity: ${humidity}%`;

    } catch (error) {
        console.error("Weather fetch failed:", error);
    }
}

// Auto-run on load
window.addEventListener('DOMContentLoaded', initWeather);
