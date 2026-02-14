let flights = [];

function load() {
  const file = document.getElementById("file").files[0];
  if (!file) return alert("Выбери CSV файл");

  const reader = new FileReader();
  reader.onload = e => {
    flights = parseCSV(e.target.result);
    showStats();
  };
  reader.readAsText(file);
}

function parseCSV(text) {
  const lines = text.split("\n").slice(1);
  let arr = [];

  lines.forEach(l => {
    const p = l.split(",");
    if (p.length >= 6) {
      arr.push({
        date: p[0],
        from: p[1],
        to: p[2],
        airline: p[3],
        km: Number(p[5])
      });
    }
  });

  return arr;
}

function showStats() {
  let total = 0;
  let mirny = 0;
  let ustkut = 0;
  let vlad = 0;
  let byYear = {};

  flights.forEach(f => {
    total += f.km || 0;

    if (f.from.includes("MJZ") || f.to.includes("MJZ")) mirny++;
    if (f.from.includes("UKX") || f.to.includes("UKX")) ustkut++;
    if (f.from.includes("VVO") || f.to.includes("VVO")) vlad++;

    const y = f.date.slice(0,4);
    byYear[y] = (byYear[y] || 0) + (f.km || 0);
  });

  let text =
`Рейсов: ${flights.length}
Общий налёт: ${total} км

Мирный: ${mirny}
Усть-Кут: ${ustkut}
Владивосток: ${vlad}

По годам:
`;

  for (let y in byYear)
    text += y + ": " + byYear[y] + " км\n";

  document.getElementById("out").textContent = text;
}
