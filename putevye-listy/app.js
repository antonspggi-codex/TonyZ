'use strict';

// ============================================================
//  Хранилище: номер следующего путевого листа и журнал выдачи
// ============================================================
const STORE_KEY = 'putevye-listy.v1';

function loadStore() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && Number.isInteger(s.next) && Array.isArray(s.issued)) return s;
  } catch (e) { /* пусто или недоступно */ }
  return { next: 1, issued: [] };
}
function saveStore() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); }
  catch (e) { showMsg('Не удалось сохранить журнал в браузере: ' + e.message, 'warn'); }
}
let store = loadStore();

// ============================================================
//  Вспомогательное
// ============================================================
const $ = (id) => document.getElementById(id);
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля',
  'августа', 'сентября', 'октября', 'ноября', 'декабря'];

function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtDate(iso) { const [y, m, d] = iso.split('-'); return `${d}.${m}.${y}`; }
function fmtDateLong(iso) { const [y, m, d] = iso.split('-'); return `«${d}» ${MONTHS[+m - 1]} ${y} г.`; }
function shortFio(fio) {
  const p = (fio || '').trim().split(/\s+/);
  return p.length < 2 ? (fio || '') : p[0] + ' ' + p.slice(1).map((x) => x[0] + '.').join('');
}
function joinNonEmpty(parts, sep) { return parts.filter(Boolean).join(sep); }
function carLabel(c) { return `${c.model} — ${c.number} (${c.type}, форма № ${c.type === 'грузовой' ? '4-П' : '3'})`; }
function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}
function showMsg(text, kind = '') { const m = $('msg'); m.textContent = text; m.className = 'msg ' + kind; }

function fileName(rec) {
  return `Путевой лист № ${rec.n} от ${fmtDate(rec.date)} ${rec.car.number}.xlsx`.replace(/[\\/:*?"<>|]/g, '');
}

function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// Значения полей бланка для конкретного путевого листа
function formValues(rec) {
  const { car, driver, org, date } = rec;
  const [y, m, d] = date.split('-');
  const dd = fmtDate(date);
  return {
    num: String(rec.n), date: dd, day: d, monthName: MONTHS[+m - 1], year: y,
    validFrom: dd, validTo: dd, validity: `Срок действия: с ${dd} по ${dd}`,
    orgName: org.name,
    orgFull: joinNonEmpty([org.name, org.address, org.phone && 'тел. ' + org.phone,
      org.inn && 'ИНН ' + org.inn, org.ogrn && 'ОГРН ' + org.ogrn], ', '),
    okpo: org.okpo || '',
    carModel: car.model, carNumber: car.number, carGarage: car.garage || '',
    carType: car.type === 'грузовой' ? 'грузовой автомобиль' : 'легковой автомобиль',
    trailerModel: car.trailerModel || '', trailerNumber: car.trailerNumber || '', trailerGarage: car.trailerGarage || '',
    driverFio: driver.fio, driverShort: shortFio(driver.fio), driverTab: driver.tab,
    driverLicense: driver.license || '', driverClass: driver.cat || '',
    fuel: car.fuel || '',
    transportKind: org.transportKind || '',
    messageKind: car.messageKind || org.messageKind || '',
    messageKindFull: (car.messageKind || org.messageKind) ? 'Вид сообщения: ' + (car.messageKind || org.messageKind) : '',
    transportKindFull: org.transportKind ? 'Вид перевозки: ' + org.transportKind : '',
    dispatcher: org.dispatcher || '', mechanic: org.mechanic || '', medic: org.medic || '',
    depDay: d, depMonth: m, preTime: `${dd}  __ ч __ мин`,
  };
}

function formFor(rec) { return FORMS[rec.car.type === 'грузовой' ? 'грузовой' : 'легковой']; }

async function downloadExcel(rec) {
  if (typeof ExcelJS === 'undefined') {
    showMsg('Не загрузилась библиотека Excel (файл exceljs.min.js должен лежать рядом с index.html).', 'warn');
    return;
  }
  const form = formFor(rec);
  const wb = formToWorkbook(form.pages, formValues(rec), form.sheets);
  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName(rec));
}

// ============================================================
//  Интерфейс
// ============================================================
let current = null; // путевой лист, открытый в предпросмотре

function fillSelects() {
  $('car').innerHTML = CARS.map((c) => `<option value="${esc(c.id)}">${esc(carLabel(c))}</option>`).join('');
  $('driver').innerHTML = DRIVERS.map((d) => `<option value="${esc(d.tab)}">${esc(d.fio)}</option>`).join('');
  $('date').value = isoToday();
  onCarChange();
}
function onCarChange() {
  const car = CARS.find((c) => String(c.id) === $('car').value);
  if (car && car.driver && DRIVERS.some((d) => d.tab === car.driver)) $('driver').value = car.driver;
}
function refreshNumbers() {
  $('nextNum').textContent = store.next;
  $('nextInput').value = store.next;
}

function renderJournal() {
  const list = store.issued.slice().reverse();
  $('journalEmpty').classList.toggle('hidden', list.length > 0);
  $('journal').innerHTML = list.map((rec, i) => `
    <tr>
      <td><b>${esc(rec.n)}</b></td>
      <td>${esc(fmtDate(rec.date))}</td>
      <td>${esc(rec.car.model)}, ${esc(rec.car.number)}</td>
      <td>${esc(shortFio(rec.driver.fio))}</td>
      <td class="muted">${esc(new Date(rec.issuedAt).toLocaleString('ru-RU'))}</td>
      <td><button class="small" data-open="${list.length - 1 - i}">Открыть</button></td>
    </tr>`).join('');
}

function openPreview(rec) {
  current = rec;
  const html = formToHtml(formFor(rec).pages, formValues(rec));
  $('sheet').innerHTML = html;
  $('printArea').innerHTML = html;
  $('previewTitle').textContent = `Путевой лист № ${rec.n} от ${fmtDate(rec.date)} — ${formFor(rec).title}`;
  $('preview').classList.remove('hidden');
  $('preview').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function issue() {
  const car = CARS.find((c) => String(c.id) === $('car').value);
  const driver = DRIVERS.find((d) => d.tab === $('driver').value);
  const date = $('date').value;
  if (!car || !driver || !date) { showMsg('Выберите машину, водителя и дату.', 'warn'); return; }

  const dup = store.issued.find((x) => x.date === date && x.car.id === car.id);
  if (dup && !confirm(`На ${car.number} за ${fmtDate(date)} уже выдан путевой лист № ${dup.n}. Выдать ещё один?`)) return;

  const rec = {
    n: store.next, date, car: { ...car }, driver: { ...driver }, org: { ...ORG },
    issuedAt: new Date().toISOString(),
  };
  store.issued.push(rec);
  store.next += 1;
  saveStore();
  refreshNumbers();
  renderJournal();
  openPreview(rec);
  showMsg(`Выдан путевой лист № ${rec.n}: ${car.number}, ${shortFio(driver.fio)}, ${fmtDate(date)}.`, 'ok');
  await downloadExcel(rec);
}

async function exportJournal() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Журнал');
  ws.columns = [
    { header: '№ ПЛ', width: 8 }, { header: 'Дата', width: 12 }, { header: 'Тип', width: 11 },
    { header: 'Машина', width: 22 }, { header: 'Гос. номер', width: 14 }, { header: 'Водитель', width: 32 },
    { header: 'Таб. №', width: 9 }, { header: 'Выдан', width: 20 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const r of store.issued) {
    ws.addRow([r.n, fmtDate(r.date), r.car.type, r.car.model, r.car.number, r.driver.fio, r.driver.tab,
      new Date(r.issuedAt).toLocaleString('ru-RU')]);
  }
  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf]), `Журнал путевых листов ${fmtDate(isoToday())}.xlsx`);
}

function init() {
  if (typeof CARS === 'undefined' || typeof DRIVERS === 'undefined' || typeof ORG === 'undefined') {
    showMsg('Ошибка в файле data.js — проверьте кавычки и запятые.', 'warn');
    return;
  }
  fillSelects();
  refreshNumbers();
  renderJournal();

  $('car').addEventListener('change', onCarChange);
  $('issue').addEventListener('click', issue);
  $('print').addEventListener('click', () => window.print());
  $('excel').addEventListener('click', () => current && downloadExcel(current));
  $('closePreview').addEventListener('click', () => $('preview').classList.add('hidden'));
  $('journal').addEventListener('click', (e) => {
    const i = e.target.dataset.open;
    if (i !== undefined) openPreview(store.issued[+i]);
  });

  $('saveNext').addEventListener('click', () => {
    const v = parseInt($('nextInput').value, 10);
    if (!(v >= 1)) { showMsg('Номер должен быть целым числом от 1.', 'warn'); return; }
    store.next = v; saveStore(); refreshNumbers();
    showMsg(`Следующий путевой лист получит № ${v}.`, 'ok');
  });
  $('exportJournal').addEventListener('click', exportJournal);
  $('backup').addEventListener('click', () => {
    downloadBlob(new Blob([JSON.stringify(store, null, 1)], { type: 'application/json' }),
      `Путевые листы — резервная копия ${fmtDate(isoToday())}.json`);
  });
  $('restore').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const s = JSON.parse(await file.text());
      if (!Number.isInteger(s.next) || !Array.isArray(s.issued)) throw new Error('неверный формат');
      if (!confirm(`Восстановить журнал (${s.issued.length} записей, следующий № ${s.next})? Текущий журнал будет заменён.`)) return;
      store = s; saveStore(); refreshNumbers(); renderJournal();
      showMsg('Журнал восстановлен из резервной копии.', 'ok');
    } catch (err) {
      showMsg('Не удалось прочитать файл копии: ' + err.message, 'warn');
    }
  });
}

init();
