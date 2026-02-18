let flights = [];

function load() {
  const file = document.getElementById("file").files[0];
  if (!file) return alert("Выбери CSV файл");

  const reader = new FileReader();
  reader.onload = e => {
    flights = parseCSV(e.target.result);
    if (!flights.length) {
      alert("Не удалось распарсить CSV. Проверь файл.");
      return;
    }
    showStats();
  };
  reader.readAsText(file);
}

// --- CSV parser that supports quotes, commas inside quotes, and CRLF ---
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

  // Must have at least these
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

    // duration like HH:MM:SS
    const durMin = durationToMinutes(duration);

    // skip broken rows
    if (!date || !from || !to) continue;

    arr.push({ date, from, to, airline, duration, durMin });
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
      // handle escaped quote ""
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function durationToMinutes(s) {
  // expects HH:MM:SS
  const p = (s || "").split(":").map(x => Number(x));
  if (p.length !== 3 || p.some(n => Number.isNaN(n))) return 0;
  return p[0] * 60 + p[1] + Math.round(p[2] / 60);
}

function minutesToHM(min) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}ч ${String(m).padStart(2, "0")}м`;
}

function hasCodeOrName(str, code, name) {
  const s = (str || "").toUpperCase();
  return s.includes(code.toUpperCase()) || s.includes(name.toUpperCase());
}

function showStats() {
  let totalMin = 0;
  let mirny = 0, ustkut = 0, vlad = 0;
  const byYear = {};
  const byAirline = {};
  const byRoute = {};

  flights.forEach(f => {
    totalMin += f.durMin || 0;

    // city/code checks (по твоим задачам)
    if (hasCodeOrName(f.from, "MJZ", "MIRNY") || hasCodeOrName(f.to, "MJZ", "MIRNY")) mirny++;
    if (hasCodeOrName(f.from, "UKX", "UST-KUT") || hasCodeOrName(f.to, "UKX", "UST-KUT")) ustkut++;
    if (hasCodeOrName(f.from, "VVO", "VLADIVOSTOK") || hasCodeOrName(f.to, "VVO", "VLADIVOSTOK")) vlad++;

    const y = (f.date || "").slice(0, 4);
    if (y && /^\d{4}$/.test(y)) byYear[y] = (byYear[y] || 0) + (f.durMin || 0);

    const air = f.airline || "—";
    byAirline[air] = (byAirline[air] || 0) + 1;

    const route = `${shortPlace(f.from)} → ${shortPlace(f.to)}`;
    byRoute[route] = (byRoute[route] || 0) + 1;
  });

  const topAir = topN(byAirline, 8);
  const topRoutes = topN(byRoute, 10);

  let text =
`Рейсов: ${flights.length}
Общий налёт (по времени): ${minutesToHM(totalMin)}

Мирный (MJZ): ${mirny}
Усть-Кут (UKX): ${ustkut}
Владивосток (VVO): ${vlad}

По годам (налёт по времени):
`;

  Object.keys(byYear).sort().forEach(y => {
    text += `${y}: ${minutesToHM(byYear[y])}\n`;
  });

  text += `\nТоп авиакомпаний:\n`;
  topAir.forEach(([k, v]) => { text += `- ${k}: ${v}\n`; });

  text += `\nТоп маршрутов:\n`;
  topRoutes.forEach(([k, v]) => { text += `- ${k}: ${v}\n`; });

  document.getElementById("out").textContent = text;
}

function topN(obj, n) {
  return Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);
}

function shortPlace(s) {
  // вытащим код IATA из скобок, если есть: "... (MJZ/UERR)" -> MJZ
  const m = (s || "").match(/\(([A-Z0-9]{3})\//i);
  if (m && m[1]) return m[1].toUpperCase();
  // иначе укоротим
  return (s || "").split("/")[0].trim().slice(0, 18);
}
