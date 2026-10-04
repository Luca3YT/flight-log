/**
 * 搭乗記録アプリ ⇄ Googleスプレッドシート 同期
 *
 * 1. TOKEN を自分だけの合言葉に変える（アプリの設定にも同じものを入れる）
 * 2. デプロイ → 新しいデプロイ → 種類「ウェブアプリ」
 *    実行ユーザー「自分」、アクセスできるユーザー「全員」
 * 3. 表示された /exec で終わるURLをアプリの設定に貼る
 */
const TOKEN = 'ここを自分だけの合言葉に変える';
const SHEET_NAME = '搭乗記録';

// アプリの項目と、それを書き込むシートの見出し。見出しがない項目は右端に自動で追加されます
const FIELDS = [
  ['date', ['日付', '搭乗日']],
  ['from', ['出発']],
  ['to', ['到着']],
  ['route', ['路線']],
  ['type', ['機材', '型式']],
  ['reg', ['機体記号', '識別']],
  ['note', ['備考']],
  ['airline', ['航空会社']],
  ['seat', ['座席']],
  ['window', ['窓']],
  ['flightNo', ['便名']],
  ['id', ['ID']]
];
const SERIAL_HEADERS = ['#', 'No', 'No.', '番号'];
const ARRAY_RE = /ARRAYFORMULA|BYROW|MAP\(|SEQUENCE\(/i;

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.token !== TOKEN) return out_({ ok: false, error: '合言葉が違います' });
  try {
    const ctx = open_();
    if (p.action === 'ping') return out_({ ok: true, sheet: SHEET_NAME, rows: Math.max(0, ctx.lastRow - 1) });
    if (p.action === 'list') return out_({ ok: true, rows: list_(ctx) });
    return out_({ ok: false, error: '不明な操作です' });
  } catch (err) {
    return out_({ ok: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: '送信データを読めませんでした' }); }
  if (body.token !== TOKEN) return out_({ ok: false, error: '合言葉が違います' });
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const ctx = open_();
    const results = (body.ops || []).map(function (op) {
      if (op.op === 'upsert' && op.row) return upsert_(ctx, op.row);
      if (op.op === 'delete' && op.id) return remove_(ctx, op.id);
      return 'skip';
    });
    SpreadsheetApp.flush();
    return out_({ ok: true, results: results });
  } catch (err) {
    return out_({ ok: false, error: String(err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

/* ---------- sheet context ---------- */
function open_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.getRange(1, 1, 1, 8).setValues([['#', '日付', '出発', '到着', '路線', '機材', '機体記号', '備考']]).setFontWeight('bold');
  }
  const width0 = Math.max(sh.getLastColumn(), 1);
  const headers = sh.getRange(1, 1, 1, width0).getValues()[0].map(function (h) { return String(h).trim(); });
  const col = {};
  FIELDS.forEach(function (f) {
    let i = headers.findIndex(function (h) { return f[1].indexOf(h) >= 0; });
    if (i < 0) {
      headers.push(f[1][0]);
      i = headers.length - 1;
      sh.getRange(1, i + 1).setValue(f[1][0]).setFontWeight('bold');
    }
    col[f[0]] = i + 1;
  });
  const serial = headers.findIndex(function (h) { return SERIAL_HEADERS.indexOf(h) >= 0; }) + 1;
  const width = headers.length;
  // 1〜2行目に配列数式がある列は、数式に任せて触らない
  const top = sh.getRange(1, 1, Math.min(2, Math.max(sh.getMaxRows(), 1)), width).getFormulas();
  const arrayCol = {};
  for (let c = 1; c <= width; c++) {
    arrayCol[c] = top.some(function (r) { return ARRAY_RE.test(r[c - 1] || ''); });
  }
  return {
    ss: ss, sh: sh, tz: ss.getSpreadsheetTimeZone(), col: col, serial: serial, width: width,
    arrayCol: arrayCol, lastRow: lastDataRow_(sh, col.date)
  };
}

function lastDataRow_(sh, c) {
  const n = sh.getLastRow();
  if (n < 2) return 1;
  const v = sh.getRange(2, c, n - 1, 1).getValues();
  for (let i = v.length - 1; i >= 0; i--) if (v[i][0] !== '' && v[i][0] !== null) return i + 2;
  return 1;
}

function data_(ctx) {
  if (ctx.lastRow < 2) return [];
  return ctx.sh.getRange(2, 1, ctx.lastRow - 1, ctx.width).getValues();
}

/* ---------- read ---------- */
function list_(ctx) {
  const c = ctx.col;
  return data_(ctx).map(function (r) {
    return {
      id: String(r[c.id - 1] || ''),
      date: dateKey_(r[c.date - 1], ctx.tz),
      from: up_(r[c.from - 1]), to: up_(r[c.to - 1]),
      type: String(r[c.type - 1] || ''), reg: up_(r[c.reg - 1]),
      note: String(r[c.note - 1] || ''), airline: String(r[c.airline - 1] || ''),
      seat: up_(r[c.seat - 1]), flightNo: String(r[c.flightNo - 1] || '')
    };
  }).filter(function (r) { return r.date && r.from && r.to; });
}

/* ---------- write ---------- */
function findRow_(ctx, row) {
  const c = ctx.col, vals = data_(ctx);
  for (let i = 0; i < vals.length; i++) {
    if (row.id && String(vals[i][c.id - 1]) === row.id) return i + 2;
  }
  // IDのない既存行（アプリ以前に手入力した行）は 日付・出発・到着・機体記号 で照合
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    if (v[c.id - 1]) continue;
    if (dateKey_(v[c.date - 1], ctx.tz) === row.date && up_(v[c.from - 1]) === row.from &&
        up_(v[c.to - 1]) === row.to && regKey_(v[c.reg - 1]) === regKey_(row.reg)) return i + 2;
  }
  return 0;
}

function upsert_(ctx, row) {
  const sh = ctx.sh, c = ctx.col;
  let r = findRow_(ctx, row);
  const isNew = !r;
  if (isNew) { r = ctx.lastRow + 1; ctx.lastRow = r; }

  const vals = {
    date: toDate_(row.date), from: row.from, to: row.to, route: row.route, type: row.type,
    reg: row.reg || '不明', note: row.note || '', airline: row.airline || '', seat: row.seat || '',
    window: row.window || '', flightNo: row.flightNo || '', id: row.id
  };
  const range = sh.getRange(r, 1, 1, ctx.width);
  const formulas = range.getFormulas()[0];
  const current = range.getValues()[0];
  const prevFormulas = r > 2 ? sh.getRange(r - 1, 1, 1, ctx.width).getFormulasR1C1()[0] : [];
  const next = current.slice();
  const copyFormula = [];

  for (let col = 1; col <= ctx.width; col++) {
    const key = Object.keys(c).filter(function (k) { return c[k] === col; })[0];
    const isSerial = col === ctx.serial;
    if (formulas[col - 1]) { next[col - 1] = formulas[col - 1]; continue; }       // 既存の数式は残す
    if (ctx.arrayCol[col]) { next[col - 1] = isNew ? '' : current[col - 1]; continue; } // 配列数式に任せる
    if ((key === 'route' || isSerial) && prevFormulas[col - 1]) { copyFormula.push(col); next[col - 1] = ''; continue; }
    if (key) next[col - 1] = vals[key];
    else if (isSerial && isNew) next[col - 1] = r - 1;
  }
  range.setValues([next]);
  copyFormula.forEach(function (col) { sh.getRange(r, col).setFormulaR1C1(prevFormulas[col - 1]); });
  sh.getRange(r, c.date).setNumberFormat('yyyy/mm/dd');
  return isNew ? 'added' : 'updated';
}

function remove_(ctx, id) {
  const c = ctx.col, vals = data_(ctx);
  for (let i = 0; i < vals.length; i++) {
    if (String(vals[i][c.id - 1]) === id) {
      ctx.sh.deleteRow(i + 2);
      ctx.lastRow--;
      return 'deleted';
    }
  }
  return 'missing';
}

/* ---------- utils ---------- */
function toDate_(s) {
  const p = String(s).split(/[\/\-]/).map(Number);
  return new Date(p[0], p[1] - 1, p[2], 12, 0, 0); // 正午にしておくとタイムゾーンで日付がずれない
}
function dateKey_(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy/MM/dd');
  const m = String(v || '').match(/(\d{4})\D(\d{1,2})\D(\d{1,2})/);
  return m ? m[1] + '/' + ('0' + m[2]).slice(-2) + '/' + ('0' + m[3]).slice(-2) : '';
}
function up_(v) { return String(v == null ? '' : v).trim().toUpperCase(); }
function regKey_(v) { const s = up_(v); return s === '不明' ? '' : s; }
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
