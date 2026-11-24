// app.js — Тони3 (как App in the Air) для GitHub Pages
// Требует: airports.js (window.AIRPORTS + window.ensureAirports), Leaflet (L)

const LS_KEY = "tony3_flights_v2";

let flights = [];
let map, layerRoutes, layerAirports, mapBounds = null;

// --- bind UI ---
const btnLoad = document.getElementById("btnLoad");
const btnClear = document.getElementById("btnClear");
const fileEl = document.getElementById("file");

btnLoad?.addEventListener("click", load);
fileEl?.addEventListener("change", () => {
  const n = fileEl.files?.[0]?.name;
  const lbl = document.getElementById("fileName");
  if (lbl) lbl.textContent = n || "Выбрать CSV";
});
btnClear?.addEventListener("click", clearAll);

// Tabs
document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`)?.classList.add("active");
    if (btn.dataset.tab === "map") setTimeout(() => {
      if (!map) return;
      map.invalidateSize();
      if (mapBounds) map.fitBounds(mapBounds, { padding: [30,30] });
    }, 150);
  });
});

// Filters
["q","year","airline","airport"].forEach(id => {
  const el = document.getElementById(id);
  el && el.addEventListener("input", renderFlights);
  el && el.addEventListener("change", renderFlights);
});

boot();

// --- boot ---
function boot(){
  initMap();

  const saved = localStorage.getItem(LS_KEY);
  if (saved){
    try{
      flights = JSON.parse(saved) || [];
      renderAll();
    } catch {
      flights = [];
      renderAll();
    }
  } else {
    renderAll();
  }
}

// --- actions ---
async function load() {
  const file = fileEl?.files?.[0];
  if (!file) return alert("Выбери CSV файл");

  const reader = new FileReader();
  reader.onload = async (e) => {
    const parsed = parseCSV(e.target.result);
    if (!parsed.length) return alert("Не удалось распарсить CSV. Проверь файл.");

    // enrich basic
    flights = parsed.map(enrichFlight);

    // collect IATA codes
    const codes = [];
    flights.forEach(f => { if (f.fromCode) codes.push(f.fromCode); if (f.toCode) codes.push(f.toCode); });

    // ensure airports coords (downloads big DB once, caches needed)
    if (window.ensureAirports) {
      const r = await window.ensureAirports(codes);
      console.log("ensureAirports:", r);
    }

    // re-enrich to recalc km after coords appeared
    flights = flights.map(enrichFlight);

    localStorage.setItem(LS_KEY, JSON.stringify(flights));
    renderAll();
  };
  reader.readAsText(file);
}

function clearAll(){
  if (!confirm("Удалить сохранённые данные?")) return;
  localStorage.removeItem(LS_KEY);
  flights = [];
  renderAll();
}

// --- CSV parsing (quotes + commas in quotes) ---
function parseCSV(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n").filter(Boolean);
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

// --- enrich flight ---
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
  const lat1 = Number(A.lat), lon1 = Number(A.lon), lat2 = Number(B.lat), lon2 = Number(B.lon);
  if (![lat1,lon1,lat2,lon2].every(isFinite)) return 0;
  return Math.round(haversine(lat1, lon1, lat2, lon2));
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

// --- render all ---
function renderAll(){
  renderDashboard();
  buildFilters();
  renderFlights();
  renderMap();
}

// --- dashboard ---
function renderDashboard(){
  const n = flights.length;
  const totalMin = sum(flights, x => x.durMin || 0);
  const totalKm = sum(flights, x => x.km || 0);

  setText("kpiFlights", n ? String(n) : "—");
  setText("kpiTime", n ? minutesToHM(totalMin) : "—");
  setText("kpiKm", n ? `${formatInt(totalKm)} км` : "—");

  const mirny = countCity("MJZ");
  const ustkut = countCity("UKX");
  const vlad = countCity("VVO");
  setText("kpiCities", n ? `MJZ: ${mirny} • UKX: ${ustkut} • VVO: ${vlad}` : "—");

  // top lists
  const topRoutes = topN(groupCount(flights, f => `${f.fromCode || shortName(f.from)} → ${f.toCode || shortName(f.to)}`), 10);
  const topAirports = topN(groupCount(flatAirports(flights), x => x), 10);
  const topAirlines = topN(groupCount(flights, f => f.airline || "—"), 10);

  renderOl("topRoutes", topRoutes);
  renderOl("topAirports", topAirports);
  renderOl("topAirlines", topAirlines);

  // chart by years: km if any, else minutes
  const byYearKm = groupSum(flights, f => f.year, f => f.km || 0);
  const kmSum = Object.values(byYearKm).reduce((a,b)=>a+b,0);

  const byYear = kmSum > 0
    ? byYearKm
    : groupSum(flights, f => f.year, f => f.durMin || 0);

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

// --- filters ---
function buildFilters(){
  fillSelect("year", ["Все годы", ...uniq(flights.map(f => f.year).filter(Boolean)).sort()]);
  fillSelect("airline", ["Все авиакомпании", ...uniq(flights.map(f => f.airline || "—")).sort()]);
  fillSelect("airport", ["Все аэропорты", ...uniq(flatAirports(flights)).sort()]);
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
  if ([...el.options].some(o => o.value === cur)) el.value = cur;
}

// --- flights table ---
function renderFlights(){
  const q = (document.getElementById("q")?.value || "").trim().toLowerCase();
  const year = document.getElementById("year")?.value || "";
  const airline = document.getElementById("airline")?.value || "";
  const airport = document.getElementById("airport")?.value || "";

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

  list.sort((a,b) => (b.date || "").localeCompare(a.date || ""));

  const tbody = document.getElementById("rows");
  if (!tbody) return;
  tbody.innerHTML = "";

  list.forEach(f => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(f.date)}</td>
      <td title="${escapeHtml(f.from)}"><span class="code from">${escapeHtml(f.fromCode || shortName(f.from))}</span></td>
      <td class="arrow">→</td>
      <td title="${escapeHtml(f.to)}"><span class="code to">${escapeHtml(f.toCode || shortName(f.to))}</span></td>
      <td>${escapeHtml(f.airline || "—")}</td>
      <td>${escapeHtml(f.duration || "")}</td>
      <td class="km">${f.km ? formatInt(f.km) : "—"}</td>
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

// --- map ---
function initMap(){
  const mapEl = document.getElementById("map");
  if (!mapEl || typeof L === "undefined") return;

  map = L.map("map", { zoomControl: true }).setView([55.75, 37.62], 4);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 18,
    subdomains: "abcd",
    attribution: "&copy; OpenStreetMap &copy; CARTO"
  }).addTo(map);

  layerRoutes = L.layerGroup().addTo(map);
  layerAirports = L.layerGroup().addTo(map);
}

function renderMap(){
  if (!map || !layerRoutes || !layerAirports) return;

  layerRoutes.clearLayers();
  layerAirports.clearLayers();

  mapBounds = null;
  if (!flights.length) return;

  const airportHits = {};
  const routeHits = {};

  flights.forEach(f => {
    const A = (window.AIRPORTS || {})[f.fromCode];
    const B = (window.AIRPORTS || {})[f.toCode];
    if (!A || !B) return;
    const key = [f.fromCode, f.toCode].sort().join("-");
    routeHits[key] = (routeHits[key] || 0) + 1;
    airportHits[f.fromCode] = (airportHits[f.fromCode] || 0) + 1;
    airportHits[f.toCode] = (airportHits[f.toCode] || 0) + 1;
  });

  const maxRoute = Math.max(1, ...Object.values(routeHits));
  const ROUTE_COLORS = ["#38bdf8", "#a78bfa", "#f472b6", "#fbbf24", "#34d399"];

  Object.entries(routeHits)
    .sort((a, b) => a[1] - b[1])
    .forEach(([key, cnt], i) => {
      const [a, b] = key.split("-");
      const A = window.AIRPORTS[a], B = window.AIRPORTS[b];
      const t = cnt / maxRoute;
      const color = ROUTE_COLORS[i % ROUTE_COLORS.length];
      const pts = greatCircle(A.lat, A.lon, B.lat, B.lon, 48);
      // свечение
      L.polyline(pts, { color, weight: 6 + 6 * t, opacity: 0.12, interactive: false }).addTo(layerRoutes);
      L.polyline(pts, { color, weight: 1.5 + 2.5 * t, opacity: 0.85 })
        .bindTooltip(`${a} ↔ ${b}: ${cnt}`, { sticky: true })
        .addTo(layerRoutes);
    });

  const maxHits = Math.max(1, ...Object.values(airportHits));
  Object.entries(airportHits).forEach(([code, cnt]) => {
    const A = (window.AIRPORTS || {})[code];
    if (!A) return;
    const r = 5 + 7 * Math.sqrt(cnt / maxHits);
    const marker = L.circleMarker([A.lat, A.lon], {
      radius: r, color: "#fff", weight: 1.5, fillColor: "#f472b6", fillOpacity: 0.9
    });
    marker.bindPopup(`<b>${escapeHtml(code)}</b><br>${escapeHtml(A.name || "")}<br>Визитов: ${cnt}`);
    marker.bindTooltip(code, { permanent: cnt >= maxHits * 0.25, direction: "top", className: "apLabel", offset: [0, -r] });
    marker.addTo(layerAirports);
  });

  const bounds = [];
  Object.keys(airportHits).forEach(code => {
    const A = (window.AIRPORTS || {})[code];
    if (A) bounds.push([A.lat, A.lon]);
  });
  if (bounds.length){
    mapBounds = bounds;
    map.fitBounds(bounds, { padding: [30,30] });
  }
}

// точки дуги большого круга (маршрут выглядит как реальный перелёт)
function greatCircle(lat1, lon1, lat2, lon2, n){
  const toRad = d => d * Math.PI / 180, toDeg = r => r * 180 / Math.PI;
  const φ1 = toRad(lat1), λ1 = toRad(lon1), φ2 = toRad(lat2), λ2 = toRad(lon2);
  const d = 2 * Math.asin(Math.sqrt(Math.sin((φ2-φ1)/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin((λ2-λ1)/2)**2));
  if (!d) return [[lat1, lon1], [lat2, lon2]];
  const pts = [];
  let prevLon = null;
  for (let i = 0; i <= n; i++){
    const f = i / n;
    const A = Math.sin((1-f)*d) / Math.sin(d), B = Math.sin(f*d) / Math.sin(d);
    const x = A*Math.cos(φ1)*Math.cos(λ1) + B*Math.cos(φ2)*Math.cos(λ2);
    const y = A*Math.cos(φ1)*Math.sin(λ1) + B*Math.cos(φ2)*Math.sin(λ2);
    const z = A*Math.sin(φ1) + B*Math.sin(φ2);
    let lon = toDeg(Math.atan2(y, x));
    if (prevLon !== null){ while (lon - prevLon > 180) lon -= 360; while (lon - prevLon < -180) lon += 360; }
    prevLon = lon;
    pts.push([toDeg(Math.atan2(z, Math.sqrt(x*x + y*y))), lon]);
  }
  return pts;
}

// --- simple bar chart ---
function drawBarChart(canvasId, obj, unit){
  const c = document.getElementById(canvasId);
  if (!c) return;

  const ctx = c.getContext("2d");
  const entries = Object.entries(obj)
    .filter(([k,v]) => k && /^\d{4}$/.test(k))
    .sort((a,b) => a[0].localeCompare(b[0]));

  // fit to CSS size
  const dpr = devicePixelRatio || 1;
  const cssW = c.clientWidth || 600;
  const cssH = c.clientHeight || 220;
  c.width = Math.floor(cssW * dpr);
  c.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,cssW,cssH);

  const w = cssW, h = cssH;
  ctx.font = "600 12px Manrope, system-ui, Arial";
  ctx.textAlign = "center";

  if (!entries.length){
    ctx.fillStyle = "#9aa4d0";
    ctx.fillText("Загрузи CSV — здесь появится график", w/2, h/2);
    return;
  }

  const max = Math.max(...entries.map(x => x[1])) || 1;
  const padX = 12, top = 26, bottom = 26;
  const gap = Math.max(6, Math.min(18, w / entries.length * 0.25));
  const barW = Math.min(64, Math.max(8, (w - padX*2 - gap*(entries.length-1)) / entries.length));
  const totalW = entries.length * barW + gap * (entries.length - 1);
  const x0 = (w - totalW) / 2;
  const chartH = h - top - bottom;

  // grid lines
  ctx.strokeStyle = "rgba(255,255,255,.08)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++){
    const y = top + chartH * i / 3 + .5;
    ctx.beginPath(); ctx.moveTo(padX, y); ctx.lineTo(w - padX, y); ctx.stroke();
  }

  const PALETTE = [["#38bdf8","#6366f1"],["#a78bfa","#ec4899"],["#fbbf24","#ef4444"],["#34d399","#0891b2"],["#f472b6","#8b5cf6"]];

  entries.forEach(([label, val], i) => {
    const x = x0 + i*(barW + gap);
    const bh = Math.max(2, Math.round(chartH * (val / max)));
    const y = top + chartH - bh;
    const [c1, c2] = PALETTE[i % PALETTE.length];
    const g = ctx.createLinearGradient(0, y, 0, y + bh);
    g.addColorStop(0, c1); g.addColorStop(1, c2);

    ctx.fillStyle = g;
    ctx.shadowColor = c1; ctx.shadowBlur = 14;
    roundRect(ctx, x, y, barW, bh, Math.min(8, barW/2));
    ctx.fill();
    ctx.shadowBlur = 0;

    const cx = x + barW/2;
    if (entries.length <= 12){
      ctx.fillStyle = "#eef2ff";
      ctx.fillText(shortNum(val), cx, y - 7);
    }
    if (entries.length <= 14 || i % 2 === 0){
      ctx.fillStyle = "#9aa4d0";
      ctx.fillText(label, cx, h - 8);
    }
  });

  ctx.textAlign = "right";
  ctx.fillStyle = "#9aa4d0";
  ctx.fillText(unit, w - padX, 12);
}

function roundRect(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function shortNum(n){
  if (n >= 1e6) return (n/1e6).toFixed(1).replace(".0","") + "M";
  if (n >= 1e4) return Math.round(n/1e3) + "k";
  return formatInt(n);
}

// --- helpers ---
function setText(id, text){
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

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
  if (!el) return;
  el.innerHTML = "";
  if (!items.length){
    el.innerHTML = '<div class="empty">Пока пусто — загрузи CSV</div>';
    return;
  }
  const max = items[0][1] || 1;
  items.forEach(([k,v]) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <div>
        <div class="name">${escapeHtml(k)}</div>
        <div class="bar" style="width:${Math.max(4, Math.round(v / max * 100))}%"></div>
      </div>
      <span class="cnt">${v}</span>`;
    el.appendChild(li);
  });
}
