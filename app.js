const LS_KEY = "tony3_flights_v1";
let flights = [];
let map, layerRoutes, layerAirports;

document.getElementById("btnLoad").addEventListener("click", load);
document.getElementById("btnClear").addEventListener("click", clearAll);

// Tabs
document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
    if (btn.dataset.tab === "map") setTimeout(() => map && map.invalidateSize(), 150);
  });
});

// Filters
["q","year","airline","airport"].forEach(id => {
  const el = document.getElementById(id);
  el && el.addEventListener("input", renderFlights);
  el && el.addEventListener("change", renderFlights);
});

boot();

function boot(){
  const saved = localStorage.getItem(LS_KEY);
  if (saved){
    try{
      flights = JSON.parse(saved);
      renderAll();
    }catch{}
  }
  initMap();
}

function clearAll(){
  if (!confirm("Удалить сохранённые данные?")) return;
  localStorage.removeItem(LS_KEY);
  flights = [];
  renderAll();
}

function load() {
  const file = document.getElementById("file").files[0];
  if (!file) return alert("Выбери CSV файл");

  const reader = new FileReader();
  reader.onload = e => {
    const parsed = parseCSV(e.target.result);
    if (!parsed.length) return alert("Не удалось распарсить CSV. Проверь файл.");

    flights = parsed.map(enrichFlight);
    localStorage.setItem(LS_KEY, JSON.stringify(flights));
    renderAll();
  };
  reader.readAsText(file);
}

/** ===== CSV parser (quotes + commas inside quotes) ===== */
function parseCSV(text) {
  const lines = text.replace(/\r/g, "").split("\n").filter(Boolean);
  if (lines.length < 2) return [];

  const header = parseCSVLine(lines[0]).map(h => h.trim());
  const idx = (name) => header.findIndex(h => h === name);

  const iDate = idx("Date");
  const iFrom = idx("From");
  const iTo = idx("To");
  const iDur = idx("Duration");
  const iAir = idx("Airline");

  if (iDate < 0 || iFrom < 0 || iTo < 0 || iDur < 0) return [];

  const arr = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (!row || row.length < header.length) continue;

    const date = (row[iDate] || "").trim();
    const from = (row[iFrom] || "").trim();
    const to = (row[iTo] || "").trim();
    const duration = (row[iDur] || "").trim();
    const airline = iAir >= 0 ? (row[iAir] || "").trim() : "";

    if (!date || !from || !to) continue;

    arr.push({ date, from, to, airline, duration });
  }
  return arr;
}

function parseCSVLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      out.push(cur); cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** ===== Enrich (extract IATA + time + km) ===== */
function enrichFlight(f){
  const fromCode = extractIATA(f.from);
  const toCode = extractIATA(f.to);
  const durMin = durationToMinutes(f.duration);

  const km = calcKm(fromCode, toCode);
  const year = (f.date || "").slice(0,4);
  const month = (f.date || "").slice(0,7);

  return { ...f, fromCode, toCode, durMin, km, year, month };
}

function extractIATA(place){
  // "... (MJZ/UERR)" -> MJZ
  const m = (place || "").match(/\(([A-Z0-9]{3})\//i);
  return m && m[1] ? m[1].toUpperCase() : "";
}

function durationToMinutes(s){
  const p = (s || "").split(":").map(x => Number(x));
  if (p.length !== 3 || p.some(n => Number.isNaN(n))) return 0;
  return p[0]*60 + p[1] + Math.round(p[2]/60);
}

function minutesToHM(min){
  const h = Math.floor(min/60);
  const m = Math.round(min%60);
  return `${h}ч ${String(m).padStart(2,"0")}м`;
}

function calcKm(a, b){
  if (!a || !b) return 0;
  const A = (window.AIRPORTS || {})[a];
  const B = (window.AIRPORTS || {})[b];
  if (!A || !B) return 0;
  return Math.round(haversine(A.lat, A.lon, B.lat, B.lon));
}

function haversine(lat1, lon1, lat2, lon2){
  const R = 6371;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2-lat1);
  const dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}

/** ===== Render all ===== */
function renderAll(){
  renderDashboard();
  buildFilters();
  renderFlights();
  renderMap();
}

function renderDashboard(){
  const n = flights.length;
  const totalMin = sum(flights, x => x.durMin || 0);
  const totalKm = sum(flights, x => x.km || 0);

  document.getElementById("kpiFlights").textContent = n ? String(n) : "—";
  document.getElementById("kpiTime").textContent = n ? minutesToHM(totalMin) : "—";
  document.getElementById("kpiKm").textContent = n ? `${formatInt(totalKm)} км` : "—";

  const mirny = countCity("MJZ");
  const ustkut = countCity("UKX");
  const vlad = countCity("VVO");
  document.getElementById("kpiCities").textContent = n ? `MJZ: ${mirny} • UKX: ${ustkut} • VVO: ${vlad}` : "—";

  // Top lists
  const topRoutes = topN(groupCount(flights, f => `${f.fromCode || shortName(f.from)} → ${f.toCode || shortName(f.to)}`), 10);
  const topAirports = topN(groupCount(flatAirports(flights), x => x), 10);
  const topAirlines = topN(groupCount(flights, f => f.airline || "—"), 10);

  renderOl("topRoutes", topRoutes);
  renderOl("topAirports", topAirports);
  renderOl("topAirlines", topAirlines);

  // Chart years by KM (fallback to minutes if km=0)
  const byYearKm = groupSum(flights, f => f.year, f => f.km || 0);
  const kmSum = Object.values(byYearKm).reduce((a,b)=>a+b,0);

  const byYear = kmSum > 0
    ? byYearKm
    : groupSum(flights, f => f.year, f => f.durMin || 0); // minutes if no km

  drawBarChart("chartYears", byYear, kmSum > 0 ? "км" : "мин");
}

function countCity(code){
  return flights.filter(f => f.fromCode === code || f.toCode === code).length;
}

function flatAirports(fs){
  const arr = [];
  fs.forEach(f => { if (f.fromCode) arr.push(f.fromCode); if (f.toCode) arr.push(f.toCode); });
  return arr;
}

function buildFilters(){
  // Year
  const years = uniq(flights.map(f => f.year).filter(Boolean)).sort();
  fillSelect("year", ["Все годы", ...years]);

  // Airline
  const airlines = uniq(flights.map(f => f.airline || "—")).sort();
  fillSelect("airline", ["Все авиакомпании", ...airlines]);

  // Airport
  const airports = uniq(flatAirports(flights)).sort();
  fillSelect("airport", ["Все аэропорты", ...airports]);
}

function fillSelect(id, items){
  const el = document.getElementById(id);
  if (!el) return;
  const cur = el.value;
  el.innerHTML = "";
  items.forEach((t, i) => {
    const opt = document.createElement("option");
    opt.value = i === 0 ? "" : t;
    opt.textContent = t;
    el.appendChild(opt);
  });
  // try restore if still exists
  [...el.options].some(o => o.value === cur) && (el.value = cur);
}

function renderFlights(){
  const q = (document.getElementById("q").value || "").trim().toLowerCase();
  const year = document.getElementById("year").value;
  const airline = document.getElementById("airline").value;
  const airport = document.getElementById("airport").value;

  let list = flights.slice();

  if (year) list = list.filter(f => f.year === year);
  if (airline) list = list.filter(f => (f.airline || "—") === airline);
  if (airport) list = list.filter(f => f.fromCode === airport || f.toCode === airport);

  if (q){
    list = list.filter(f => {
      const s = `${f.date} ${f.from} ${f.to} ${f.fromCode} ${f.toCode} ${f.airline} ${f.duration}`.toLowerCase();
      return s.includes(q);
    });
  }

  // sort desc by date
  list.sort((a,b) => (b.date || "").localeCompare(a.date || ""));

  const tbody = document.getElementById("rows");
  tbody.innerHTML = "";

  list.forEach(f => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(f.date)}</td>
      <td title="${escapeHtml(f.from)}">${escapeHtml(f.fromCode || shortName(f.from))}</td>
      <td title="${escapeHtml(f.to)}">${escapeHtml(f.toCode || shortName(f.to))}</td>
      <td>${escapeHtml(f.airline || "—")}</td>
      <td>${escapeHtml(f.duration || "")}</td>
      <td>${f.km ? formatInt(f.km) : "—"}</td>
    `;
    tbody.appendChild(tr);
  });
}

function shortName(s){
  return (s || "").split("/")[0].trim().slice(0,20);
}

function escapeHtml(s){
  return String(s || "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

/** ===== Map ===== */
function initMap(){
  map = L.map("map", { zoomControl: true }).setView([55.75, 37.62], 4);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap"
  }).addTo(map);

  layerRoutes = L.layerGroup().addTo(map);
  layerAirports = L.layerGroup().addTo(map);
}

function renderMap(){
  if (!map) return;
  layerRoutes.clearLayers();
  layerAirports.clearLayers();

  if (!flights.length) return;

  const airportHits = {};

  flights.forEach(f => {
    const A = AIRPORTS[f.fromCode];
    const B = AIRPORTS[f.toCode];
    if (!A || !B) return;

    const line = L.polyline([[A.lat, A.lon],[B.lat, B.lon]], { weight: 2, opacity: 0.35 });
    line.addTo(layerRoutes);

    airportHits[f.fromCode] = (airportHits[f.fromCode] || 0) + 1;
    airportHits[f.toCode] = (airportHits[f.toCode] || 0) + 1;
  });

  Object.entries(airportHits).forEach(([code, cnt]) => {
    const A = AIRPORTS[code];
    if (!A) return;
    const marker = L.circleMarker([A.lat, A.lon], { radius: 6, opacity: 0.9, fillOpacity: 0.6 });
    marker.bindPopup(`<b>${code}</b><br>${escapeHtml(A.name || "")}<br>Визитов: ${cnt}`);
    marker.addTo(layerAirports);
  });

  // Fit bounds
  const bounds = [];
  Object.keys(airportHits).forEach(code => {
    const A = AIRPORTS[code];
    if (A) bounds.push([A.lat, A.lon]);
  });
  if (bounds.length) map.fitBounds(bounds, { padding: [20,20] });
}

/** ===== Simple chart (canvas) ===== */
function drawBarChart(canvasId, obj, unit){
  const c = document.getElementById(canvasId);
  const ctx = c.getContext("2d");
  const entries = Object.entries(obj)
    .filter(([k,v]) => k && k !== "Date" && /^\d{4}$/.test(k))
    .sort((a,b) => a[0].localeCompare(b[0]));

  ctx.clearRect(0,0,c.width,c.height);

  if (!entries.length){
    ctx.fillText("Нет данных для графика", 10, 20);
    return;
  }

  const W = c.width = c.clientWidth * devicePixelRatio;
  const H = c.height = c.clientHeight * devicePixelRatio;
  ctx.scale(devicePixelRatio, devicePixelRatio);

  const w = c.clientWidth;
  const h = c.clientHeight;

  const max = Math.max(...entries.map(x => x[1])) || 1;
  const pad = 24;
  const barGap = 6;
  const barW = Math.max(8, Math.floor((w - pad*2 - barGap*(entries.length-1)) / entries.length));

  // axes baseline
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.moveTo(pad, h - pad);
  ctx.lineTo(w - pad, h - pad);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.font = "12px system-ui, Arial";
  entries.forEach(([label, val], i) => {
    const x = pad + i*(barW + barGap);
    const bh = Math.round((h - pad*2) * (val / max));
    const y = (h - pad) - bh;

    ctx.globalAlpha = 0.85;
    ctx.fillRect(x, y, barW, bh);
    ctx.globalAlpha = 1;

    // year label
    if (entries.length <= 14 || i % 2 === 0){
      ctx.globalAlpha = 0.75;
      ctx.fillText(label, x, h - 6);
      ctx.globalAlpha = 1;
    }
  });

  // max label
  ctx.globalAlpha = 0.7;
  ctx.fillText(`max: ${formatInt(max)} ${unit}`, pad, 14);
  ctx.globalAlpha = 1;
}

/** ===== Helpers ===== */
function sum(arr, fn){ return arr.reduce((a,x)=>a+(fn(x)||0),0); }
function uniq(arr){ return [...new Set(arr)]; }
function formatInt(n){ return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " "); }

function groupCount(arr, keyFn){
  const m = {};
  arr.forEach(x => {
    const k = keyFn(x) || "—";
    m[k] = (m[k] || 0) + 1;
  });
  return m;
}

function groupSum(arr, keyFn, valFn){
  const m = {};
  arr.forEach(x => {
    const k = keyFn(x) || "—";
    m[k] = (m[k] || 0) + (valFn(x) || 0);
  });
  return m;
}

function topN(obj, n){
  return Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0,n);
}

function renderOl(id, items){
  const el = document.getElementById(id);
  el.innerHTML = "";
  items.forEach(([k,v]) => {
    const li = document.createElement("li");
    li.textContent = `${k} — ${v}`;
    el.appendChild(li);
  });
}
