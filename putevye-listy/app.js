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
function carLabel(c) { return `${c.model} — ${c.number} (${c.type})`; }
function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}
function showMsg(text, kind = '') { const m = $('msg'); m.textContent = text; m.className = 'msg ' + kind; }

// ============================================================
//  Бланк путевого листа.
//  Описывается один раз как сетка из 12 колонок, а потом
//  рисуется и в HTML (для печати), и в Excel.
//  Флаги ячейки: b — жирный, c — по центру, r — вправо,
//  line — поле с подчёркиванием, box — рамка, hdr — шапка таблицы,
//  sm — мелкий шрифт, cap — подпись под полем, title, sec — заголовки.
// ============================================================
function buildForm(w) {
  const { n, date, car, driver, org } = w;
  const truck = car.type === 'грузовой';
  const pages = [[]];
  let rows = pages[0];

  const R = (...cells) => rows.push({ cells });
  const gap = (h = 6) => rows.push({ cells: [], h });
  const T = (t, f = '', h) => rows.push({ cells: [{ t, s: 12, f }], h });
  const L = (t, s, f = '') => ({ t, s, f });
  const V = (t, s, f = '') => ({ t: t ?? '', s, f: 'line ' + f });
  const B = (t, s, f = '') => ({ t: t ?? '', s, f: 'box ' + f });
  const H = (t, s) => ({ t, s, f: 'box hdr c b sm' });
  const C = (t, s) => ({ t, s, f: 'cap' });
  const newPage = () => { rows = []; pages.push(rows); };
  const sign = (role, fio, when) => {
    R(L(role, 3, 'sm'), V('', 3), V(fio, 3, 'c'), V(when, 3, 'c sm'));
    R(L('', 3), C('подпись', 3), C('фамилия, инициалы', 3), C('дата, время', 3));
  };
  const d = fmtDate(date);
  const pre = `${d}  __ ч __ мин`;
  const blankTime = '«__» ______  __ ч __ мин';

  // --- шапка ---
  R(L('Собственник (владелец) ТС:', 3, 'sm'), V(org.name, 9, 'b'));
  R(L('Адрес, телефон:', 3, 'sm'), V(joinNonEmpty([org.address, org.phone && 'тел. ' + org.phone], ', '), 9));
  R(L('ИНН / ОГРН:', 3, 'sm'), V(joinNonEmpty([org.inn, org.ogrn], ' / '), 9));
  gap(8);
  T(`ПУТЕВОЙ ЛИСТ ${truck ? 'ГРУЗОВОГО' : 'ЛЕГКОВОГО'} АВТОМОБИЛЯ № ${n}`, 'title c b', 22);
  T(fmtDateLong(date), 'c');
  T(`Срок действия: с ${d} по ${d}`, 'c sm');
  gap(6);
  R(L('Вид перевозки:', 3, 'sm'), V(org.transportKind, 9));
  R(L('Вид сообщения:', 3, 'sm'), V(car.messageKind || org.messageKind, 9));

  // --- машина и водитель ---
  T('Транспортное средство', 'sec b', 18);
  R(L('Марка, модель:', 3, 'sm'), V(car.model, 4), L('Гос. рег. знак:', 2, 'sm r'), V(car.number, 3, 'b'));
  R(L('Тип ТС:', 3, 'sm'), V(car.type, 4), L('Гаражный №:', 2, 'sm r'), V(car.garage, 3));
  if (truck) R(L('Прицеп (марка, гос. знак):', 3, 'sm'), V(car.trailer || '—', 9));

  T('Водитель', 'sec b', 18);
  R(L('Фамилия, имя, отчество:', 3, 'sm'), V(driver.fio, 4, 'b'), L('Табельный №:', 2, 'sm r'), V(driver.tab, 3));
  R(L('Водительское удостоверение №:', 3, 'sm'), V(driver.license, 4), L('Категории:', 2, 'sm r'), V(driver.cat, 3));
  if (!truck) {
    R(L('В распоряжение (заказчик, адрес):', 4, 'sm'), V('', 8));
    R(V('', 12));
  }

  // --- работа водителя и ТС ---
  T('Работа водителя и транспортного средства', 'sec b', 18);
  R(H('Операция', 3), H('Дата', 2), H('Время, ч:мин', 2), H('Показания одометра, км', 2), H('Подпись водителя', 3));
  rows.push({ h: 20, cells: [B('Выезд с парковки', 3, 'sm'), B(d, 2, 'c'), B('', 2), B('', 2), B('', 3)] });
  rows.push({ h: 20, cells: [B('Возвращение на парковку', 3, 'sm'), B('', 2), B('', 2), B('', 2), B('', 3)] });

  // --- горючее ---
  T('Движение горючего', 'sec b', 18);
  R(H('Марка горючего', 2), H('Выдано, л', 2), H('Остаток при выезде, л', 2),
    H('Остаток при возвращении, л', 2), H('Расход по норме, л', 2), H('Расход фактический, л', 2));
  rows.push({ h: 20, cells: [B(car.fuel, 2, 'c'), B('', 2), B('', 2), B('', 2), B('', 2), B('', 2)] });
  if (car.norm) T(`Норма расхода: ${car.norm}`, 'sm');

  // --- предрейсовые отметки ---
  T('Предрейсовые отметки', 'sec b', 18);
  T('Предрейсовый медицинский осмотр пройден, к исполнению трудовых обязанностей допущен', 'sm');
  sign('Медицинский работник', org.medic, pre);
  T('Предрейсовый контроль технического состояния ТС пройден, выпуск на линию разрешён', 'sm');
  sign('Контролёр техн. состояния', org.mechanic, pre);
  T('Путевой лист выдал', 'sm');
  sign('Диспетчер', org.dispatcher, pre);
  T('Транспортное средство в технически исправном состоянии принял', 'sm');
  sign('Водитель', shortFio(driver.fio), pre);

  // --- задание водителю (для грузового — на второй странице) ---
  if (truck) {
    newPage();
    T(`Путевой лист № ${n} от ${d} — ${car.model}, ${car.number}`, 'sm');
    T('ЗАДАНИЕ ВОДИТЕЛЮ', 'title c b', 22);
    rows.push({ h: 32, cells: [H('В чьё распоряжение (заказчик)', 3), H('Адрес пункта погрузки', 2),
      H('Адрес пункта разгрузки', 2), H('Наименование груза', 2), H('Кол-во ездок', 1), H('Расстоя-ние, км', 1), H('Перевезти, т', 1)] });
    for (let i = 0; i < 8; i++) {
      rows.push({ h: 22, cells: [B('', 3), B('', 2), B('', 2), B('', 2), B('', 1), B('', 1), B('', 1)] });
    }
    T('Результаты работы', 'sec b', 18);
    R(L('Пройдено, км:', 3, 'sm'), V('', 3), L('Время в наряде, ч:', 3, 'sm r'), V('', 3));
    R(L('Ездок с грузом:', 3, 'sm'), V('', 3), L('Перевезено, т:', 3, 'sm r'), V('', 3));
  } else {
    T('Результаты работы', 'sec b', 18);
    R(L('Пройдено, км:', 3, 'sm'), V('', 3), L('Время в наряде, ч:', 3, 'sm r'), V('', 3));
  }

  // --- послерейсовые отметки ---
  T('Послерейсовые отметки', 'sec b', 18);
  T('Послерейсовый медицинский осмотр проведён', 'sm');
  sign('Медицинский работник', org.medic, blankTime);
  T('Послерейсовый контроль технического состояния ТС проведён', 'sm');
  sign('Контролёр техн. состояния', org.mechanic, blankTime);
  T('Транспортное средство сдал', 'sm');
  sign('Водитель', shortFio(driver.fio), blankTime);

  return pages;
}

// ---------- отрисовка бланка в HTML ----------
function formToHtml(pages) {
  return pages.map((rows) => {
    const body = rows.map((row) => {
      const h = row.h ? ` style="height:${row.h}pt"` : '';
      if (!row.cells.length) return `<tr><td colspan="12"${h}></td></tr>`;
      let used = 0;
      const tds = row.cells.map((c) => {
        used += c.s;
        return `<td colspan="${c.s}" class="${c.f}"${h}>${esc(c.t)}</td>`;
      });
      if (used < 12) tds.push(`<td colspan="${12 - used}"></td>`);
      return `<tr>${tds.join('')}</tr>`;
    }).join('');
    return `<div class="form-page"><table class="form"><colgroup>${'<col>'.repeat(12)}</colgroup>${body}</table></div>`;
  }).join('');
}

// ---------- запись бланка в Excel ----------
function formToSheet(ws, pages) {
  const COLW = 8.4;
  ws.columns = Array.from({ length: 12 }, () => ({ width: COLW }));
  const thin = { style: 'thin', color: { argb: 'FF000000' } };
  let r = 1;

  pages.forEach((rows, pi) => {
    if (pi > 0) ws.getRow(r - 1).addPageBreak();
    for (const row of rows) {
      const xr = ws.getRow(r);
      let height = row.h || 15;
      let col = 1;
      for (const c of row.cells) {
        const f = ' ' + c.f + ' ';
        const has = (k) => f.includes(' ' + k + ' ');
        let size = 9;
        if (has('sm')) size = 8;
        if (has('cap')) size = 6;
        if (has('sec')) size = 10;
        if (has('title')) size = 13;
        if (has('cap') && !row.h) height = 9;

        const first = ws.getCell(r, col);
        first.value = c.t || null;
        for (let k = col; k < col + c.s; k++) {
          const cell = ws.getCell(r, k);
          cell.font = { name: 'Arial', size, bold: has('b') };
          cell.alignment = {
            horizontal: has('c') || has('cap') ? 'center' : has('r') ? 'right' : 'left',
            vertical: has('cap') ? 'top' : 'middle',
            wrapText: true,
          };
          if (has('box')) cell.border = { top: thin, left: thin, bottom: thin, right: thin };
          else if (has('line')) cell.border = { bottom: thin };
          if (has('hdr')) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
        }
        if (c.s > 1) ws.mergeCells(r, col, r, col + c.s - 1);

        // если текст длинный — увеличиваем высоту строки, чтобы влез при переносе
        if (c.t) {
          const perLine = Math.max(1, Math.floor(c.s * COLW * 1.15 * (9 / size)));
          const lines = Math.ceil(String(c.t).length / perLine);
          height = Math.max(height, lines * size * 1.35 + 3);
        }
        col += c.s;
      }
      xr.height = height;
      r++;
    }
  });

  ws.pageSetup = {
    paperSize: 9, orientation: 'portrait',
    fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0, footer: 0 },
  };
}

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

async function downloadExcel(rec) {
  if (typeof ExcelJS === 'undefined') {
    showMsg('Не загрузилась библиотека Excel (файл exceljs.min.js должен лежать рядом с index.html).', 'warn');
    return;
  }
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`ПЛ ${rec.n}`);
  formToSheet(ws, buildForm(rec));
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
  const html = formToHtml(buildForm(rec));
  $('sheet').innerHTML = html;
  $('printArea').innerHTML = html;
  $('previewTitle').textContent = `Путевой лист № ${rec.n} от ${fmtDate(rec.date)}`;
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
