// gas/Code.gs（スプレッドシート側の同期スクリプト）を、スプレッドシートの模型の上で動かして確かめる
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// セルを {v: 値, f: 数式} で持つだけの簡易シート
function makeSheet(rows) {
  const g = rows.map((r) => r.map((c) => (typeof c === "string" && c[0] === "=" ? { v: "", f: c } : { v: c, f: "" })));
  const cell = (r, c) => { while (g.length < r) g.push([]); const row = g[r - 1]; while (row.length < c) row.push({ v: "", f: "" }); return row[c - 1]; };
  return {
    g,
    getLastRow() { for (let i = g.length; i > 0; i--) if (g[i - 1].some((x) => x.v !== "" || x.f)) return i; return 0; },
    getLastColumn() { return Math.max(0, ...g.map((r) => { for (let i = r.length; i > 0; i--) if (r[i - 1].v !== "" || r[i - 1].f) return i; return 0; })); },
    getMaxRows() { return Math.max(g.length, 1000); },
    deleteRow(r) { g.splice(r - 1, 1); },
    getRange(r, c, nr = 1, nc = 1) {
      const map = (fn) => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => fn(cell(r + i, c + j))));
      return {
        getValues: () => map((x) => x.v),
        getFormulas: () => map((x) => x.f),
        getFormulasR1C1: () => map((x) => (x.f ? "R1C1:" + x.f : "")),
        setValues(vals) { vals.forEach((row, i) => row.forEach((v, j) => { const x = cell(r + i, c + j); if (typeof v === "string" && v[0] === "=") { x.f = v; x.v = "(calc)"; } else { x.v = v; x.f = ""; } })); },
        setValue(v) { const x = cell(r, c); x.v = v; x.f = ""; return { setFontWeight() {} }; },
        setFormulaR1C1(f) { const x = cell(r, c); x.f = f.replace("R1C1:", "") + "@row" + r; x.v = "(calc)"; },
        setNumberFormat() {}, setFontWeight() {}
      };
    }
  };
}

// Code.gs は vm の中で動くので、日付もその中で作らないと「日付」と認識されない（本物の Apps Script では日付として届く）
function load(makeRows) {
  const code = readFileSync(new URL("../gas/Code.gs", import.meta.url), "utf8").replace("const TOKEN = 'ここを自分だけの合言葉に変える';", "const TOKEN = 't';");
  let sheet;
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => sheet, insertSheet: () => sheet, getSpreadsheetTimeZone: () => "Asia/Tokyo" }), flush() {} },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { createTextOutput: (s) => ({ setMimeType: () => s }), MimeType: { JSON: 1 } },
    Utilities: { formatDate: (d) => `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}` }
  };
  vm.createContext(ctx);
  vm.runInContext(code + "\n;globalThis.doGet = doGet; globalThis.doPost = doPost;", ctx);
  const date = (y, m, d) => vm.runInContext(`new Date(${y}, ${m - 1}, ${d})`, ctx);
  sheet = makeSheet(makeRows(date));
  return {
    sheet,
    get: (p) => JSON.parse(ctx.doGet({ parameter: p })),
    post: (b) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }))
  };
}

const row = (o) => ({ route: `${o.from} → ${o.to}`, airline: "日本航空", seat: "", window: "", flightNo: "", note: "", ...o });

test("手入力の既存行には重複せずに ID が付き、新しい便は数式ごと追記される", () => {
  // 実際の flight_log_gs と同じ見出しと数式の形
  const gas = load((date) => [
    ["#", "日付", "出発", "到着", "路線", "機材", "機体記号", "備考"],
    ['=IF(B2="","",ROW(B2)-1)', date(2026, 5, 26), "HND", "KMQ", '=IF(B2="","",C2&" → "&D2)', "B737-800", "JA328J", ""],
    ['=IF(B3="","",ROW(B3)-1)', date(2024, 7, 21), "HND", "CTS", '=IF(B3="","",C3&" → "&D3)', "A350-900", "不明", ""]
  ]);
  const sheet = gas.sheet;
  expect(gas.get({ token: "t", action: "ping" })).toMatchObject({ ok: true, rows: 2 });

  const res = gas.post({ token: "t", ops: [
    { op: "upsert", row: row({ id: "A1", date: "2026/05/26", from: "HND", to: "KMQ", type: "B737-800", reg: "JA328J" }) },
    { op: "upsert", row: row({ id: "A2", date: "2024/07/21", from: "HND", to: "CTS", type: "A350-900", reg: "" }) },
    { op: "upsert", row: row({ id: "N1", date: "2026/10/20", from: "KMQ", to: "HND", type: "B737-800", reg: "JA333J", seat: "12K", window: "真横", flightNo: "JL185", note: "富士山" }) }
  ] });
  expect(res).toMatchObject({ ok: true, results: ["updated", "updated", "added"] });

  const head = sheet.g[0].map((x) => x.v);
  expect(head.slice(0, 8)).toEqual(["#", "日付", "出発", "到着", "路線", "機材", "機体記号", "備考"]);
  for (const h of ["航空会社", "座席", "窓", "便名", "ID"]) expect(head).toContain(h);
  const idCol = head.indexOf("ID");
  expect(sheet.g.slice(1).map((r) => r[idCol].v)).toEqual(["A1", "A2", "N1"]);
  // 新しい行の # と 路線 は上の行の数式を引き継ぐ
  expect(sheet.g[3][0].f).toContain("ROW(B3)-1");
  expect(sheet.g[3][4].f).toContain("C3&");
  expect(Object.prototype.toString.call(sheet.g[3][1].v)).toBe("[object Date]");
  expect(sheet.g[3][1].v.getHours()).toBe(12);   // 正午で書くので日付がずれない
  expect(sheet.g.length).toBe(4);                  // 既存の2行は重複していない
});

test("ID で更新・削除でき、一覧を返し、合言葉が違えば断る", () => {
  const gas = load(() => [["#", "日付", "出発", "到着", "路線", "機材", "機体記号", "備考"]]);
  gas.post({ token: "t", ops: [
    { op: "upsert", row: row({ id: "X", date: "2026/10/20", from: "KMQ", to: "HND", type: "B737-800", reg: "JA333J" }) },
    { op: "upsert", row: row({ id: "Y", date: "2026/10/21", from: "HND", to: "KMQ", type: "B737-800", reg: "JA323J" }) }
  ] });
  expect(gas.post({ token: "t", ops: [{ op: "upsert", row: row({ id: "X", date: "2026/10/20", from: "KMQ", to: "HND", type: "B737-800", reg: "JA333J", seat: "20A" }) }] }).results).toEqual(["updated"]);
  expect(gas.post({ token: "t", ops: [{ op: "delete", id: "Y" }] }).results).toEqual(["deleted"]);
  const list = gas.get({ token: "t", action: "list" }).rows;
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({ id: "X", date: "2026/10/20", seat: "20A" });
  expect(gas.get({ token: "x", action: "list" })).toMatchObject({ ok: false, error: "合言葉が違います" });
  expect(gas.post({ token: "x", ops: [] })).toMatchObject({ ok: false });
});
