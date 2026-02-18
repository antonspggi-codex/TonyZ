// airports.js
// 1) Минимальный набор (можно оставить твой текущий).
// 2) Умная подгрузка недостающих аэропортов по IATA из большой базы (mwgg/Airports).
// 3) Кэш в localStorage (сохраняем только те IATA, которые реально встретились в твоих перелётах).

window.AIRPORTS = window.AIRPORTS || {
  SVO: { name: "Moscow Sheremetyevo", lat: 55.9726, lon: 37.4146 },
  DME: { name: "Moscow Domodedovo", lat: 55.4088, lon: 37.9063 },
  VKO: { name: "Moscow Vnukovo", lat: 55.5915, lon: 37.2615 },
  LED: { name: "St Petersburg Pulkovo", lat: 59.8003, lon: 30.2625 },
  MJZ: { name: "Mirny", lat: 62.5347, lon: 114.0390 },
  UKX: { name: "Ust-Kut", lat: 56.8577, lon: 105.7300 },
  VVO: { name: "Vladivostok", lat: 43.3989, lon: 132.1489 },
  OVB: { name: "Novosibirsk Tolmachevo", lat: 55.0126, lon: 82.6507 },
  IKT: { name: "Irkutsk", lat: 52.2680, lon: 104.3889 },
};

const LS_AIRPORTS_KEY = "tony3_airports_cache_v1";

// Загружаем сохранённый кэш (если есть)
(function loadCache(){
  try {
    const cached = JSON.parse(localStorage.getItem(LS_AIRPORTS_KEY) || "{}");
    Object.assign(window.AIRPORTS, cached);
  } catch {}
})();

// Проверка: есть ли координаты для IATA
function hasAirport(iata){
  return !!(iata && window.AIRPORTS[iata] && isFinite(window.AIRPORTS[iata].lat) && isFinite(window.AIRPORTS[iata].lon));
}

// Главная функция: добрать недостающие IATA из большой базы
window.ensureAirports = async function ensureAirports(iataCodes){
  const need = [...new Set((iataCodes || []).filter(Boolean).map(x => x.toUpperCase()))]
    .filter(code => !hasAirport(code));

  if (!need.length) return { added: 0, skipped: 0 };

  // Большая база (MIT). Берём raw JSON.
  // Структура: ключи ICAO, внутри есть iata, lat, lon, name и т.п.
  const BIG_DB_URL = "https://raw.githubusercontent.com/mwgg/Airports/master/airports.json";

  let big;
  try {
    const res = await fetch(BIG_DB_URL, { cache: "force-cache" });
    if (!res.ok) throw new Error("Fetch failed: " + res.status);
    big = await res.json();
  } catch (e) {
    console.error(e);
    alert("Не удалось загрузить базу аэропортов для километров/карты. Проверь интернет или попробуй позже.");
    return { added: 0, skipped: need.length };
  }

  // Собираем IATA -> {lat,lon,name} только для нужных кодов
  const needSet = new Set(need);
  const add = {};
  let added = 0;

  for (const icao in big){
    const a = big[icao];
    const iata = (a && a.iata) ? String(a.iata).toUpperCase() : "";
    if (!iata || !needSet.has(iata)) continue;

    const lat = Number(a.lat);
    const lon = Number(a.lon);
    if (!isFinite(lat) || !isFinite(lon)) continue;

    add[iata] = { name: a.name || "", lat, lon };
    needSet.delete(iata);
    added++;

    if (needSet.size === 0) break;
  }

  // Применяем + сохраняем кэш (только найденное)
  Object.assign(window.AIRPORTS, add);
  try {
    const cached = JSON.parse(localStorage.getItem(LS_AIRPORTS_KEY) || "{}");
    Object.assign(cached, add);
    localStorage.setItem(LS_AIRPORTS_KEY, JSON.stringify(cached));
  } catch {}

  return { added, skipped: needSet.size };
};
