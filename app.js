function calc() {
  const txt = document.getElementById("data").value.trim();
  if (!txt) return;

  let sum = 0;
  txt.split("\n").forEach(line => {
    const parts = line.split(",");
    const km = Number(parts[3]);
    if (!isNaN(km)) sum += km;
  });

  document.getElementById("result").textContent =
    "Общий налёт: " + sum + " км";
}
