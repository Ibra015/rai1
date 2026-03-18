/**
 * Agro-Omni Plant Database
 * المصدر الوحيد لبيانات النباتات في النظام
 * يُستخدم من: dashboard.js, camera_ai.js, scheduler.js, firmware
 */
const PLANTS = [
    {
        n: "Tomato", a: "طماطم", m: 45, i: "assets/images/tomato.png",
        minMoisture: 30, maxMoisture: 70, waterDuration: 3,
        color: "Red", keywords: ["tomato", "orange", "apple", "pomegranate", "peach"]
    },
    {
        n: "Cucumber", a: "خيار", m: 72, i: "assets/images/cucumber.png",
        minMoisture: 50, maxMoisture: 85, waterDuration: 2.5,
        color: "Green", keywords: ["cucumber", "zucchini", "squash"]
    },
    {
        n: "Arugula", a: "جرجير", m: 80, i: "assets/images/arugula.png",
        minMoisture: 60, maxMoisture: 90, waterDuration: 2,
        color: "Green", keywords: ["arugula", "rocket"]
    },
    {
        n: "Carrot", a: "جزر", m: 35, i: "assets/images/carrot.png",
        minMoisture: 25, maxMoisture: 65, waterDuration: 4,
        color: "Orange", keywords: ["carrot"]
    },
    {
        n: "Lettuce", a: "خس", m: 60, i: "assets/images/lettuce.png",
        minMoisture: 45, maxMoisture: 80, waterDuration: 2,
        color: "Green", keywords: ["lettuce", "cabbage", "broccoli"]
    },
    {
        n: "Pepper", a: "فلفل", m: 55, i: "assets/images/pepper.png",
        minMoisture: 35, maxMoisture: 75, waterDuration: 3,
        color: "Mixed", keywords: ["pepper", "bell pepper", "capsicum"]
    },
    {
        n: "Spinach", a: "سبانخ", m: 85, i: "assets/images/spinach.png",
        minMoisture: 65, maxMoisture: 95, waterDuration: 1.5,
        color: "Green", keywords: ["spinach"]
    },
    {
        n: "Beans", a: "فاصوليا", m: 20, i: "assets/images/beans.png",
        minMoisture: 15, maxMoisture: 55, waterDuration: 5,
        color: "Green", keywords: ["bean", "green bean", "string bean"]
    },
    {
        n: "Peas", a: "بازلاء", m: 90, i: "assets/images/peas.png",
        minMoisture: 70, maxMoisture: 95, waterDuration: 1.5,
        color: "Green", keywords: ["pea", "peas"]
    },
    {
        n: "Cabbage", a: "كرنب", m: 50, i: "assets/images/cabbage.png",
        minMoisture: 35, maxMoisture: 70, waterDuration: 3.5,
        color: "Green", keywords: ["cabbage", "head cabbage"]
    }
];

// للتوافق مع الكود القديم
const plants = PLANTS;
