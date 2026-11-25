'use strict';
// ============================================================
//  Отрисовка бланка путевого листа (HTML для печати и Excel).
//
//  Бланк = список страниц (лицевая, оборотная). Страница:
//    { landscape, unit (мм на единицу ширины), widths: [...],
//      rows: [{ h: высота в pt | null, cells: [...] }] }
//  Ячейка: { g: колонка, s: колонок, rs: строк, pt: размер шрифта,
//            f: флаги, t: текст, p: имя поля, tpl: 1 — текст с [полями] }
//  Флаги: b i c r top bot wrap, линии bt bb bl br (bt2… — жирные).
// ============================================================

const PAGE_MM = { landscape: [277, 190], portrait: [190, 277] };
const PT_MM = 0.3528;

function fillText(cell, values) {
  if (cell.p) return values[cell.p] ?? '';
  if (cell.tpl) return String(cell.t).replace(/\[([^\]]+)\]/g, (_, k) => values[k] ?? '');
  return cell.t ?? '';
}

// Раскладка страницы: масштаб k (вписать в лист A4), высоты строк и размеры шрифтов.
// Если бланк выше листа, сначала ужимаются пустые промежутки между строками
// (не ниже высоты шрифта), и только потом уменьшается весь бланк.
function layoutPage(page, values) {
  const [pw, ph] = PAGE_MM[page.landscape ? 'landscape' : 'portrait'];
  const wmm = page.widths.reduce((a, b) => a + b, 0) * page.unit;
  const minH = page.rows.map((row) => {
    const pts = row.cells.filter((c) => !c.rs && (c.t || c.p)).map((c) => c.pt || 8);
    return pts.length ? Math.max(...pts) * 1.18 : 4;
  });
  let heights = page.rows.map((row, i) => row.h || Math.max(minH[i], 8 * 1.3 + 1));
  const kw = Math.min(1, pw / wmm);
  const limit = ph / kw / PT_MM; // доступная высота в pt при таком масштабе
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  if (sum(heights) > limit) {
    // ужимаем «воздух»: каждая строка теряет одинаковую долю своего запаса над minH
    const spare = sum(heights.map((h, i) => Math.max(0, h - minH[i])));
    const need = sum(heights) - limit;
    const q = spare > 0 ? Math.min(1, need / spare) : 0;
    heights = heights.map((h, i) => h - Math.max(0, h - minH[i]) * q);
  }
  const k = Math.min(kw, ph / (sum(heights) * PT_MM)) * 0.98;

  // подбор шрифта для длинных подставленных значений, чтобы влезли в своё поле
  const colMm = page.widths.map((w) => w * page.unit);
  const fonts = page.rows.map((row, r) => row.cells.map((c) => {
    let pt = c.pt || 8;
    if (!(c.p || c.tpl)) return pt;
    const text = String(fillText(c, values));
    if (!text) return pt;
    const fl = String(c.f || '');
    const multi = fl.includes('wrap') || (c.s || 1) > 1 || (c.rs || 1) > 1;
    if (!multi) return pt;
    const wPt = colMm.slice(c.g, c.g + (c.s || 1)).reduce((a, b) => a + b, 0) / PT_MM - 3;
    const hPt = heights.slice(r, r + (c.rs || 1)).reduce((a, b) => a + b, 0);
    const fits = (size) => {
      const lines = fl.includes('wrap') || (c.rs || 1) > 1 ? Math.max(1, Math.floor(hPt / (size * 1.15))) : 1;
      return text.length * size * 0.52 <= wPt * lines;
    };
    while (pt > 5 && !fits(pt)) pt -= 0.5;
    return pt;
  }));
  return { wmm, k, heights, fonts };
}

// ---------- HTML ----------
function formToHtml(pages, values) {
  const escH = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  return pages.map((page) => {
    const { wmm, k, heights, fonts } = layoutPage(page, values);
    const cols = page.widths.map((w) => `<col style="width:${(w * page.unit).toFixed(2)}mm">`).join('');
    const body = page.rows.map((row, r) => {
      const tds = row.cells.map((c, ci) => {
        const fl = new Set(String(c.f || '').split(' '));
        const st = [];
        for (const [k2, side] of [['bt', 'top'], ['bb', 'bottom'], ['bl', 'left'], ['br', 'right']]) {
          if (fl.has(k2)) st.push(`border-${side}:0.6pt solid #000`);
          if (fl.has(k2 + '2')) st.push(`border-${side}:1.4pt solid #000`);
        }
        const text = escH(fillText(c, values)).replace(/\n/g, '<br>');
        const span = (c.s > 1 ? ` colspan="${c.s}"` : '') + (c.rs > 1 ? ` rowspan="${c.rs}"` : '');
        const inner = [`font-size:${fonts[r][ci]}pt`];
        if (fl.has('b')) inner.push('font-weight:bold');
        if (fl.has('i')) inner.push('font-style:italic');
        const ha = fl.has('c') ? 'c' : fl.has('r') ? 'r' : 'l';
        const va = fl.has('top') ? 't' : fl.has('bot') ? 'b' : 'm';
        if (fl.has('wrap') || ((c.s > 1 || c.rs > 1) && (c.p || c.tpl))) {
          st.push(`vertical-align:${{ t: 'top', b: 'bottom', m: 'middle' }[va]}`);
          inner.push(`text-align:${{ l: 'left', c: 'center', r: 'right' }[ha]}`);
          const maxH = heights.slice(r, r + (c.rs || 1)).reduce((a, b) => a + b, 0);
          inner.push(`max-height:${maxH.toFixed(2)}pt`);
          return `<td${span} style="${st.join(';')}"><div class="w" style="${inner.join(';')}">${text}</div></td>`;
        }
        return `<td${span} style="${st.join(';')}"><div class="n h${ha} v${va}" style="${inner.join(';')}">${text}</div></td>`;
      }).join('');
      return `<tr style="height:${heights[r].toFixed(2)}pt">${tds}</tr>`;
    }).join('');
    return `<div class="form-page ${page.landscape ? 'landscape' : 'portrait'}">` +
      `<div class="form-fit" style="zoom:${k.toFixed(4)};width:${wmm.toFixed(2)}mm">` +
      `<table class="form"><colgroup>${cols}</colgroup>${body}</table></div></div>`;
  }).join('');
}

// ---------- Excel ----------
function formToWorkbook(pages, values, sheetNames) {
  const wb = new ExcelJS.Workbook();
  const thin = { style: 'thin', color: { argb: 'FF000000' } };
  const thick = { style: 'medium', color: { argb: 'FF000000' } };
  pages.forEach((page, pi) => {
    const { heights, fonts } = layoutPage(page, values);
    const ws = wb.addWorksheet(sheetNames[pi] || `Стр. ${pi + 1}`, { views: [{ showGridLines: false }] });
    // ширина колонки Excel в «символах»: ~ 1,9 мм на символ (Arial 10)
    ws.columns = page.widths.map((w) => ({ width: Math.max(0.3, (w * page.unit) / 1.9) }));
    heights.forEach((h, r) => { ws.getRow(r + 1).height = h; });

    page.rows.forEach((row, r) => {
      row.cells.forEach((c, ci) => {
        const fl = new Set(String(c.f || '').split(' '));
        const R = r + 1, C = c.g + 1, rs = c.rs || 1, s = c.s || 1;
        const font = { name: 'Arial', size: fonts[r][ci], bold: fl.has('b'), italic: fl.has('i') };
        const alignment = {
          horizontal: fl.has('c') ? 'center' : fl.has('r') ? 'right' : 'left',
          vertical: fl.has('top') ? 'top' : fl.has('bot') ? 'bottom' : 'middle',
          wrapText: fl.has('wrap') || rs > 1 || s > 1,
        };
        // сначала объединяем (ExcelJS при объединении копирует оформление первой ячейки), потом оформляем
        const text = fillText(c, values);
        if (text !== '') ws.getCell(R, C).value = String(text);
        if (s > 1 || rs > 1) ws.mergeCells(R, C, R + rs - 1, C + s - 1);
        const side = (k) => (fl.has(k + '2') ? thick : fl.has(k) ? thin : null);
        const bt = side('bt'), bb = side('bb'), bl = side('bl'), br = side('br');
        for (let rr = R; rr < R + rs; rr++) {
          for (let cc = C; cc < C + s; cc++) {
            const cell = ws.getCell(rr, cc);
            if (rr !== R || cc !== C) cell.style = {};
            cell.font = font;
            cell.alignment = alignment;
            const b = {};
            if (bt && rr === R) b.top = bt;
            if (bb && rr === R + rs - 1) b.bottom = bb;
            if (bl && cc === C) b.left = bl;
            if (br && cc === C + s - 1) b.right = br;
            if (Object.keys(b).length) cell.border = { ...(cell.border || {}), ...b };
          }
        }
      });
    });

    ws.pageSetup = {
      paperSize: 9, orientation: page.landscape ? 'landscape' : 'portrait',
      fitToPage: true, fitToWidth: 1, fitToHeight: 1,
      horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0, footer: 0 },
    };
  });
  return wb;
}
