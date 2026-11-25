"""Собирает putevye-listy/forms.js из макетов унифицированных форм № 3 и № 4-П.
python3 -I make_forms.py <dir with f3b.xml f4p.xml> <out forms.js>
"""
import importlib.util, json, re, sys, os

here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('p', os.path.join(here, 'parse1c.py'))
P = importlib.util.module_from_spec(spec); spec.loader.exec_module(P)

src_dir, out = sys.argv[1], sys.argv[2]


def set_cell(doc, r, c, t=None, p=None):
    row = doc['rows'][r]
    old = row['cells'].get(c, {'f': 0})
    row['cells'][c] = {'f': old['f'], 't': t, 'p': p}


def bordered_after(doc, r, after, side='bottom'):
    """первая ячейка строки r правее колонки after с нижней границей (поле для записи)"""
    row = doc['rows'][r]
    for c in sorted(row['cells']):
        if c <= after: continue
        f = P.fmt(doc, row['cells'][c]['f'])
        if f.get(side + 'Border') not in (None, '0') or f.get('border') not in (None, '0'):
            return c
    raise SystemExit(f'no bordered cell in row {r} after {after}')


def finish(page, rename):
    """переименовать поля 1С в ключи программы; неизвестные поля — пустые"""
    for row in page['rows']:
        for c in row['cells']:
            if c.get('p'):
                c['p'] = rename.get(c['p'], '')
                if not c['p']:
                    del c['p']
            t = c.get('t')
            if t and re.search(r'\[[^\]]+\]', t):
                c['tpl'] = 1
                c['t'] = re.sub(r'\[([^\]]+)\]', lambda m: '[' + rename.get(m.group(1), m.group(1) if m.group(1) in KEYS else '') + ']', t)
            elif 'tpl' in c:
                del c['tpl']
            # многострочный текст без переноса — увеличим строку, чтобы не вылезал
            if t and '\n' in t and not c.get('rs'):
                need = (t.count('\n') + 1) * c['pt'] * 1.2 + 2
                if (row['h'] or 0) < need:
                    row['h'] = need
    return page


def concat(*parts):
    page = {'widths': parts[0]['widths'], 'rows': []}
    for part in parts:
        assert part['widths'] == page['widths']
        page['rows'] += json.loads(json.dumps(part['rows']))
    return page


def add_rows(page, rows):
    """добавить строки, заданные долями ширины: rows = [(h, [(доля, dict ячейки), ...]), ...]"""
    W = page['widths']
    bounds = [0]
    for w in W: bounds.append(bounds[-1] + w)
    total = bounds[-1]
    for h, cells in rows:
        left = W[0]
        out, acc, g = [], 0.0, 1
        out.append({'g': 0, 's': 1, 'f': '', 'pt': 7})
        for frac, cell in cells:
            acc += frac
            target = left + (total - left) * acc
            end = min(range(len(bounds)), key=lambda i: abs(bounds[i] - target))
            end = max(end, g + 1)
            c = {'g': g, 's': end - g, 'f': cell.get('f', ''), 'pt': cell.get('pt', 7)}
            for k in ('t', 'p'):
                if k in cell: c[k] = cell[k]
            if '[' in c.get('t', ''): c['tpl'] = 1
            out.append(c)
            g = end
        page['rows'].append({'h': h, 'cells': out})


KEYS = {'num', 'date', 'day', 'monthName', 'year', 'validFrom', 'validTo', 'validity', 'orgFull', 'orgName', 'okpo',
        'carModel', 'carNumber', 'carGarage', 'carType', 'trailerModel', 'trailerNumber', 'trailerGarage',
        'driverFio', 'driverShort', 'driverTab', 'driverLicense', 'driverClass', 'fuel', 'transportKind',
        'messageKind', 'messageKindFull', 'transportKindFull', 'dispatcher', 'mechanic', 'medic', 'depDay', 'depMonth', 'preTime'}

# ------------------------------------------------------------------ форма № 3
d3 = P.load(os.path.join(src_dir, 'f3b.xml'))
set_cell(d3, 2, 30, p='day'); set_cell(d3, 2, 35, p='monthName'); set_cell(d3, 2, 47, p='year')
set_cell(d3, 3, 4, t='Срок действия: с [validFrom] по [validTo]')
set_cell(d3, 6, 18, t='[orgFull]')
set_cell(d3, 9, 68, p='carGarage')
set_cell(d3, 12, 19, t='[driverLicense]')
set_cell(d3, 12, 67, p='driverClass')
set_cell(d3, 16, 22, t='[transportKind]')
set_cell(d3, 21, 1, p='')                                    # в распоряжение (организация) — от руки
set_cell(d3, 21, 66, p='mechanic')   # механик, выпустивший на линию
set_cell(d3, 31, 30, p='dispatcher') # диспетчер-нарядчик (выезд)
set_cell(d3, 43, 66, p='mechanic')   # механик, принявший автомобиль
rename3 = {'Номер': 'num', 'КодПоОКПО': 'okpo', 'Марка': 'carModel', 'РегистрационныйЗнак': 'carNumber',
           'ФИО': 'driverFio', 'ТабельныйНомер': 'driverTab', 'ФИОСокращенное': 'driverShort', 'Топливо': 'fuel'}
for k in KEYS: rename3[k] = k

f3_front = finish(P.build(d3, 0, 44), rename3)
seg_head = P.build(d3, 45, 49)
seg_row = P.build(d3, 50, 50)
for c in seg_row['rows'][0]['cells']:
    c.pop('p', None)
seg_tail = P.build(d3, 51, 62)
f3_back = concat(seg_head, *([seg_row] * 10), seg_tail)
B = 'bt bb bl br'
add_rows(f3_back, [
    (14, [(1, {})]),
    (16, [(1, {'t': 'Отметки о медицинских осмотрах и контроле технического состояния транспортного средства '
                     '(Приказ Минтранса России от 28.09.2022 № 390)', 'f': 'b', 'pt': 8})]),
    (24, [(0.40, {'t': 'Отметка', 'f': B + ' c wrap', 'pt': 7}), (0.17, {'t': 'Дата, время (ч, мин)', 'f': B + ' c wrap', 'pt': 7}),
          (0.13, {'t': 'Должность', 'f': B + ' c wrap', 'pt': 7}), (0.12, {'t': 'Подпись', 'f': B + ' c wrap', 'pt': 7}),
          (0.18, {'t': 'Фамилия, инициалы', 'f': B + ' c wrap', 'pt': 7})]),
    (26, [(0.40, {'t': 'Предрейсовый медицинский осмотр проведён, к исполнению трудовых обязанностей допущен', 'f': B + ' wrap', 'pt': 7}),
          (0.17, {'t': '[preTime]', 'f': B + ' c', 'pt': 7}), (0.13, {'t': 'медработник', 'f': B + ' c', 'pt': 7}),
          (0.12, {'f': B}), (0.18, {'p': 'medic', 'f': B + ' c', 'pt': 7})]),
    (26, [(0.40, {'t': 'Предрейсовый контроль технического состояния ТС проведён, выпуск на линию разрешён', 'f': B + ' wrap', 'pt': 7}),
          (0.17, {'t': '[preTime]', 'f': B + ' c', 'pt': 7}), (0.13, {'t': 'контролёр ТС', 'f': B + ' c', 'pt': 7}),
          (0.12, {'f': B}), (0.18, {'p': 'mechanic', 'f': B + ' c', 'pt': 7})]),
    (26, [(0.40, {'t': 'Послерейсовый медицинский осмотр проведён', 'f': B + ' wrap', 'pt': 7}),
          (0.17, {'t': '«__» ______ __ ч __ мин', 'f': B + ' c', 'pt': 7}), (0.13, {'t': 'медработник', 'f': B + ' c', 'pt': 7}),
          (0.12, {'f': B}), (0.18, {'p': 'medic', 'f': B + ' c', 'pt': 7})]),
    (26, [(0.40, {'t': 'Послерейсовый контроль технического состояния ТС проведён', 'f': B + ' wrap', 'pt': 7}),
          (0.17, {'t': '«__» ______ __ ч __ мин', 'f': B + ' c', 'pt': 7}), (0.13, {'t': 'контролёр ТС', 'f': B + ' c', 'pt': 7}),
          (0.12, {'f': B}), (0.18, {'p': 'mechanic', 'f': B + ' c', 'pt': 7})]),
    (16, [(1, {'t': 'Тип транспортного средства: [carType].   Вид сообщения: [messageKind].', 'f': 'bot', 'pt': 7})]),
])
f3_back = finish(f3_back, rename3)

# ------------------------------------------------------------------ форма № 4-П
d4 = P.load(os.path.join(src_dir, 'f4p.xml'))
set_cell(d4, 0, 18, t='Типовая межотраслевая форма № 4-П\nУтверждена постановлением Госкомстата России\nот 28.11.97 № 78')
set_cell(d4, 1, 11, t='[num] от [date]')
set_cell(d4, 33, 4, t='_______ л.')
set_cell(d4, 43, 1, t='К путевому листу № [num] от [date]')
set_cell(d4, 43, 14, t='К путевому листу № [num] от [date]')
set_cell(d4, 105, 11, t='к путевому листу № [num] от [date]')
set_cell(d4, 105, 24, t='к путевому листу № [num] от [date]')
rename4 = {'ТекстДействителенДо': 'validity', 'ОрганизацияКр': 'orgFull', 'КодПоОКПО': 'okpo', 'ТипТС': 'carType',
           'МодельТС': 'carModel', 'ТранспортноеСредствоГосНомер': 'carNumber', 'ТранспортноеСредствоГарНомер': 'carGarage',
           'Водители': 'driverFio', 'ВодительКод': 'driverTab', 'НомерУдостоверенияВодителя': 'driverLicense',
           'КлассВодителя': 'driverClass', 'ВидСообщения': 'messageKindFull', 'ВидПеревозки': 'transportKindFull',
           'ДатаВыезда_ДД': 'depDay', 'ДатаВыезда_ММММ': 'depMonth', 'ПрицепМодель1': 'trailerModel',
           'ПрицепГосНомер1': 'trailerNumber', 'ПрицепГарНомер1': 'trailerGarage', 'ГСМ1': 'fuel',
           'ВыпустилМеханик': 'mechanic', 'ВыдалДиспетчер': 'dispatcher', 'ВодительПринял': 'driverShort',
           'ВодительСдал': 'driverShort', 'ПринялМеханик': 'mechanic', 'ОсмотрелВрач': 'medic', 'Организация': 'orgName'}
for k in KEYS: rename4[k] = k
f4_front = finish(P.build(d4, 0, 53), rename4)
f4_back = finish(P.build(d4, 55, 106), rename4)

UNIT = {'f3': 0.535, 'f4': 0.31}
forms = {
    'легковой': {'title': 'Типовая межотраслевая форма № 3 (ОКУД 0345001)', 'sheets': ['Лицевая', 'Оборотная'],
                 'pages': [dict(f3_front, unit=UNIT['f3'], landscape=True), dict(f3_back, unit=UNIT['f3'], landscape=True)]},
    'грузовой': {'title': 'Типовая межотраслевая форма № 4-П (ОКУД 0345005)', 'sheets': ['Лицевая', 'Оборотная'],
                 'pages': [dict(f4_front, unit=UNIT['f4'], landscape=True), dict(f4_back, unit=UNIT['f4'], landscape=True)]},
}
with open(out, 'w', encoding='utf-8') as fh:
    fh.write('// Бланки унифицированных форм путевых листов (Постановление Госкомстата России от 28.11.1997 № 78):\n')
    fh.write('//   легковой — форма № 3, грузовой — форма № 4-П. Файл сгенерирован автоматически, вручную не править.\n')
    fh.write('const FORMS = ')
    json.dump(forms, fh, ensure_ascii=False, separators=(',', ':'))
    fh.write(';\n')
print('ok', os.path.getsize(out))
