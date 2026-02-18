// airports.js — минимальный справочник IATA -> координаты
// Можно дополнять: AIRPORTS["AAA"] = { name:"...", lat:0, lon:0 }

window.AIRPORTS = {
  SVO: { name: "Moscow Sheremetyevo", lat: 55.9726, lon: 37.4146 },
  DME: { name: "Moscow Domodedovo", lat: 55.4088, lon: 37.9063 },
  VKO: { name: "Moscow Vnukovo", lat: 55.5915, lon: 37.2615 },

  LED: { name: "St Petersburg Pulkovo", lat: 59.8003, lon: 30.2625 },

  MJZ: { name: "Mirny", lat: 62.5347, lon: 114.0390 },
  UKX: { name: "Ust-Kut", lat: 56.8577, lon: 105.7300 },

  VVO: { name: "Vladivostok", lat: 43.3989, lon: 132.1489 },
  OVB: { name: "Novosibirsk Tolmachevo", lat: 55.0126, lon: 82.6507 },

  IKT: { name: "Irkutsk", lat: 52.2680, lon: 104.3889 },
  KUF: { name: "Samara Kurumoch", lat: 53.5049, lon: 50.1643 },
  KRR: { name: "Krasnodar", lat: 45.0347, lon: 39.1705 },
  AER: { name: "Sochi", lat: 43.4499, lon: 39.9566 },

  HKT: { name: "Phuket", lat: 8.1132, lon: 98.3169 },
  DXB: { name: "Dubai", lat: 25.2532, lon: 55.3657 },
};
