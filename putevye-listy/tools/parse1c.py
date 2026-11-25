"""Конвертер табличного документа 1С (Template.xml) в модель страниц для render.js.
usage: python3 -I parse1c.py file.xml beginRow endRow [columnsID|-] > out.json
"""
import sys, json, re
import xml.etree.ElementTree as ET

NS = {'d': 'http://v8.1c.ru/8.2/data/spreadsheet', 'v8': 'http://v8.1c.ru/8.1/data/core',
      'v8ui': 'http://v8.1c.ru/8.1/data/ui'}
D = '{http://v8.1c.ru/8.2/data/spreadsheet}'


def txt(el, tag):
    x = el.find(D + tag)
    return None if x is None else x.text


def load(path):
    root = ET.parse(path).getroot()
    lines = []
    for ln in root.findall(D + 'line'):
        st = ln.find('{http://v8.1c.ru/8.1/data/ui}style')
        lines.append({'w': int(ln.get('width', 1)), 'none': st is not None and st.text == 'None'})
    fonts = [{'h': float(f.get('height', 8)), 'b': f.get('bold') == 'true', 'i': f.get('italic') == 'true'}
             for f in root.findall(D + 'font')]
    formats = []
    for f in root.findall(D + 'format'):
        formats.append({ch.tag.replace(D, ''): ch.text for ch in f})
    colsets = {}
    for cs in root.findall(D + 'columns'):
        cid = txt(cs, 'id') or '-'
        size = int(txt(cs, 'size'))
        fi = {}
        for it in cs.findall(D + 'columnsItem'):
            fi[int(txt(it, 'index'))] = int(it.find(D + 'column').find(D + 'formatIndex').text)
        colsets[cid] = (size, fi)
    rows = {}
    for ri in root.findall(D + 'rowsItem'):
        idx = int(txt(ri, 'index'))
        row = ri.find(D + 'row')
        cid = txt(row, 'columnsID') or '-'
        rf = txt(row, 'formatIndex')
        cells = {}
        col = -1
        for c in row.findall(D + 'c'):
            i = txt(c, 'i')
            col = int(i) if i is not None else col + 1
            inner = c.find(D + 'c')
            if inner is None:
                continue
            t = None
            tl = inner.find(D + 'tl')
            if tl is not None:
                cont = tl.find('.//{http://v8.1c.ru/8.1/data/core}content')
                t = cont.text if cont is not None else None
            cells[col] = {'f': int(txt(inner, 'f') or 0), 't': t, 'p': txt(inner, 'parameter')}
        rows[idx] = {'cid': cid, 'rf': int(rf) if rf else None, 'cells': cells}
    merges = []
    for m in root.findall(D + 'merge'):
        merges.append({'r': int(txt(m, 'r')), 'c': int(txt(m, 'c')), 'w': int(txt(m, 'w') or 0),
                       'h': int(txt(m, 'h') or 0), 'cid': txt(m, 'columnsID') or '-'})
    dfi = int(txt(root, 'defaultFormatIndex') or 0)
    return dict(lines=lines, fonts=fonts, formats=formats, colsets=colsets, rows=rows, merges=merges, dfi=dfi)


def fmt(doc, i):
    return doc['formats'][i - 1] if i and 0 < i <= len(doc['formats']) else {}


def colwidths(doc, cid):
    size, fi = doc['colsets'][cid]
    dw = int(fmt(doc, doc['dfi']).get('width') or 72)
    return [int(fmt(doc, fi[c]).get('width') or dw) if c in fi else dw for c in range(size)]


def build(doc, r0, r1, cid='-', maxw=None):
    rowcid = {r: doc['rows'].get(r, {'cid': cid})['cid'] for r in range(r0, r1 + 1)}
    used = sorted(set(rowcid.values()))
    bounds = {}
    allb = set([0])
    for u in used:
        w = colwidths(doc, u)
        b = [0]
        for x in w: b.append(b[-1] + x)
        bounds[u] = b
        allb.update(b)
    allb = sorted(allb)
    if maxw:
        allb = [x for x in allb if x <= maxw]
    pos = {x: i for i, x in enumerate(allb)}
    widths = [allb[i + 1] - allb[i] for i in range(len(allb) - 1)]
    def span(u, c, s):
        b = bounds[u]
        a, e = b[min(c, len(b) - 1)], b[min(c + s, len(b) - 1)]
        if maxw: a, e = min(a, maxw), min(e, maxw)
        return pos[a], pos[e] - pos[a]
    mg = {}
    for m in doc['merges']:
        if r0 <= m['r'] <= r1:
            mg[(m['r'], m['c'], m['cid'])] = m
    def has_border(fm, side):
        v = fm.get(side + 'Border') or fm.get('border')
        if v is None: return 0
        ln = doc['lines'][int(v)] if int(v) < len(doc['lines']) else {'none': True}
        return 0 if ln['none'] else ln['w']
    out = []
    occupied = {}
    for r in range(r0, r1 + 1):
        u = rowcid[r]
        row = doc['rows'].get(r, {'cid': u, 'rf': None, 'cells': {}})
        h = fmt(doc, row['rf']).get('height') if row['rf'] else None
        if h is not None and float(h) == 0: h = None
        size = len(bounds[u]) - 1
        cells = []
        c = 0
        while c < size:
            ce = row['cells'].get(c, {'f': 0, 't': None, 'p': None})
            m = mg.get((r, c, u))
            s = (m['w'] + 1) if m else 1
            rs = (m['h'] + 1) if m else 1
            # «центрировать по выделенным колонкам»: текст растягивается на соседние пустые ячейки с тем же флагом
            f0 = fmt(doc, ce['f'])
            if not m and (ce['t'] or ce['p']) and f0.get('bySelectedColumns') == 'true':
                while c + s < size:
                    nx = row['cells'].get(c + s)
                    if not nx or nx['t'] or nx['p'] or (r, c + s, u) in mg: break
                    if fmt(doc, nx['f']).get('bySelectedColumns') != 'true': break
                    s += 1
            g0, gs = span(u, c, s)
            if gs == 0 or any(occupied.get((r, k)) for k in range(g0, g0 + gs)):
                c += s; continue
            for rr in range(r, r + rs):
                for k in range(g0, g0 + gs): occupied[(rr, k)] = True
            f = dict(fmt(doc, ce['f']))
            colf = fmt(doc, doc['colsets'][u][1].get(c)) if c in doc['colsets'][u][1] else {}
            rowf = fmt(doc, row['rf']) if row['rf'] else {}
            for key in ('font', 'horizontalAlignment', 'verticalAlignment', 'textPlacement'):
                if f.get(key) is None:
                    f[key] = rowf.get(key) if rowf.get(key) is not None else colf.get(key)
            last = row['cells'].get(c + s - 1) or ce
            fr = fmt(doc, last['f'])
            lr = doc['rows'].get(r + rs - 1, {'cells': {}})['cells'].get(c) or ce
            fb = fmt(doc, lr['f'])
            flags = []
            for k, v in (('bt', has_border(f, 'top')), ('bb', has_border(fb, 'bottom') or has_border(f, 'bottom')),
                         ('bl', has_border(f, 'left')), ('br', has_border(fr, 'right') or has_border(f, 'right'))):
                if v: flags.append(k + ('2' if v > 1 else ''))
            fi_ = f.get('font')
            font = doc['fonts'][int(fi_)] if fi_ is not None and int(fi_) < len(doc['fonts']) else {'h': 10.0, 'b': False, 'i': False}
            ha = f.get('horizontalAlignment'); va = f.get('verticalAlignment')
            if ha == 'Center': flags.append('c')
            if ha == 'Right': flags.append('r')
            if va == 'Top': flags.append('top')
            if va == 'Bottom': flags.append('bot')
            if font['b']: flags.append('b')
            if font['i']: flags.append('i')
            cell = {'g': g0, 's': gs, 'f': ' '.join(flags), 'pt': font['h']}
            if rs > 1: cell['rs'] = rs
            fill = f.get('fillType')
            if f.get('textPlacement') == 'Wrap': flags.append('wrap'); cell['f'] = ' '.join(flags)
            if ce['p'] and not ce['t']: cell['p'] = ce['p']
            elif ce['t']:
                cell['t'] = ce['t']
                if fill == 'Template': cell['tpl'] = 1
            cells.append(cell)
            c += s
        hh = float(h) / 2 if h else None   # высота в 1С хранится в половинах пункта
        if hh is not None:
            fonts = [x['pt'] for x in cells if not x.get('rs') and (x.get('t') or x.get('p'))]
            if fonts: hh = max(hh, max(fonts) * 1.3)
        out.append({'h': hh, 'cells': cells})
    return {'widths': widths, 'rows': out}


if __name__ == '__main__':
    doc = load(sys.argv[1])
    if sys.argv[2] == 'areas':
        root = ET.parse(sys.argv[1]).getroot()
        for ni in root.findall(D + 'namedItem'):
            a = ni.find(D + 'area')
            if a is not None:
                print(txt(ni, 'name'), txt(a, 'type'), txt(a, 'beginRow'), txt(a, 'endRow'), txt(a, 'beginColumn'), txt(a, 'endColumn'), txt(a, 'columnsID'))
        print('rows', min(doc['rows']), max(doc['rows']), 'colsets', {k: v[0] for k, v in doc['colsets'].items()})
        sys.exit()
    cid = sys.argv[4] if len(sys.argv) > 4 else '-'
    json.dump(build(doc, int(sys.argv[2]), int(sys.argv[3]), cid, int(sys.argv[5]) if len(sys.argv)>5 else None), sys.stdout, ensure_ascii=False)
