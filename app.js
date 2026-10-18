/* 搭乗記録 — app */
(function () {
  "use strict";

  var D = window.SKYDATA;
  var KEY = "skylog.v1";
  var VERSION = "1.4.0";
  var ORDER = ["unknown", "green", "yellow", "red", "black"];
  var RLABEL = { green: "真横", yellow: "ほぼ真横", red: "見にくい", black: "窓なし", unknown: "未判定" };
  var STEPS = [
    { key: "date", title: "搭乗日", hint: "" },
    { key: "airline", title: "航空会社", hint: "国内線" },
    { key: "route", title: "区間", hint: "名前・よみ・コードで検索" },
    { key: "reg", title: "機体記号", hint: "機材を自動で判定します" },
    { key: "aircraft", title: "機材", hint: "" },
    { key: "seat", title: "座席", hint: "タップで選択" },
    { key: "note", title: "備考", hint: "どちらも空欄でかまいません" },
    { key: "confirm", title: "確認", hint: "" }
  ];
  var FAM_NAME = {
    JAL: "JALグループ", ANA: "ANAグループ", SKY: "スカイマーク", ADO: "AIRDO", SNJ: "ソラシドエア",
    SFJ: "スターフライヤー", APJ: "Peach", JJP: "ジェットスター・ジャパン", SJO: "スプリング・ジャパン",
    FDA: "フジドリームエアラインズ", IBX: "アイベックスエアラインズ", ORC: "オリエンタルエアブリッジ",
    AHX: "天草エアライン", TOK: "トキエア"
  };
  var PLANE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path transform="rotate(90 12 12)" d="M21 15.5v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0v5l-8 5v2l8-2.5v5.5l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2z"/></svg>';
  var ICON_SEARCH = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>';
  var ICON_SWAP = '<svg viewBox="0 0 24 24"><path d="M7 4v16M7 4L4 7M7 4l3 3M17 20V4M17 20l-3-3M17 20l3-3"/></svg>';

  /* ---------- indexes ---------- */
  var AP = {}, AL = {}, CFG = {};
  D.AIRPORTS.forEach(function (a) {
    AP[a.iata] = a;
    a._i = a.iata.toLowerCase(); a._c = a.icao.toLowerCase();
    a._n = norm(a.name);
    a._w = a.kana.split(" ").concat(a.roman.split(" ")).map(norm);
  });
  D.AIRLINES.forEach(function (a) { AL[a.code] = a; });
  D.CONFIGS.forEach(function (c) { CFG[c.id] = c; });

  /* ---------- small helpers ---------- */
  function $(s, el) { return (el || document).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function norm(s) {
    return String(s || "").normalize("NFKC").toLowerCase()
      .replace(/[\u30a1-\u30f6]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); })
      .replace(/[\s・\-ー]/g, "");
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  function todayISO(off) {
    var t = new Date(); t.setDate(t.getDate() - (off || 0));
    return t.getFullYear() + "-" + pad(t.getMonth() + 1) + "-" + pad(t.getDate());
  }
  function parts(iso) {
    var p = String(iso || "").split("-").map(Number);
    var dt = new Date(p[0], p[1] - 1, p[2]);
    return { y: p[0], m: p[1], d: p[2], w: "日月火水木金土".charAt(dt.getDay()), t: dt.getTime() };
  }
  function dots(iso) { return iso ? iso.replace(/-/g, ".") : ""; }
  function normDate(v) {
    var m = String(v || "").match(/(\d{4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})/);
    return m ? m[1] + "-" + pad(+m[2]) + "-" + pad(+m[3]) : "";
  }
  function km(a, b) {
    var A = AP[a], B = AP[b];
    if (!A || !B) return 0;
    var R = 6371, r = Math.PI / 180;
    var dLat = (B.lat - A.lat) * r, dLon = (B.lon - A.lon) * r;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(A.lat * r) * Math.cos(B.lat * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function fmtNum(n) { return Math.round(n).toLocaleString("ja-JP"); }
  function apName(c) { return AP[c] ? AP[c].name : c || ""; }
  function alColor(code) { return AL[code] ? AL[code].color : "var(--brass)"; }

  var toastTimer;
  function toast(msg) {
    var t = $("#toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2400);
  }

  /* ---------- motion ---------- */
  var REDUCE = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  function bezier(x1, y1, x2, y2) {
    function A(a, b) { return 1 - 3 * b + 3 * a; }
    function B(a, b) { return 3 * b - 6 * a; }
    function C(a) { return 3 * a; }
    function at(t, a, b) { return ((A(a, b) * t + B(a, b)) * t + C(a)) * t; }
    function slope(t, a, b) { return 3 * A(a, b) * t * t + 2 * B(a, b) * t + C(a); }
    return function (x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      var t = x;
      for (var i = 0; i < 8; i++) {
        var sl = slope(t, x1, x2);
        if (Math.abs(sl) < 1e-6) break;
        t -= (at(t, x1, x2) - x) / sl;
      }
      return at(Math.max(0, Math.min(1, t)), y1, y2);
    };
  }
  var easeOut = bezier(0.08, 0.82, 0.12, 1);
  function retrigger(el, cls) { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  function stagger(root, cap) {
    if (!root) return;
    Array.prototype.forEach.call(root.children, function (c, i) { c.style.setProperty("--i", Math.min(i, cap || 12)); });
  }
  function countUp(root) {
    $$("[data-count]", root).forEach(function (el, i) {
      var to = +el.dataset.count;
      if (REDUCE || !to) { el.textContent = fmtNum(to); return; }
      el.textContent = "0";
      var t0 = null, dur = 3200;
      setTimeout(function () {
        requestAnimationFrame(function tick(now) {
          if (t0 == null) t0 = now;
          var p = Math.min(1, (now - t0) / dur);
          el.textContent = fmtNum(to * easeOut(p));
          if (p < 1) requestAnimationFrame(tick);
        });
      }, 260 + i * 110);
    });
  }
  var FLAP = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789";
  function scramble(el, text, dur) {
    if (REDUCE || !el) return;
    dur = dur || 720;
    var t0 = performance.now(), last = 0, n = text.length;
    el.classList.add("flapping");
    requestAnimationFrame(function frame(now) {
      var p = (now - t0) / dur;
      if (p >= 1) { el.textContent = text; el.classList.remove("flapping"); return; }
      if (now - last > 60) {
        last = now;
        var out = "";
        for (var i = 0; i < n; i++) {
          var ch = text.charAt(i);
          out += (p > 0.2 + 0.75 * (i + 1) / n || !/[A-Z0-9]/.test(ch)) ? ch : FLAP.charAt(Math.floor(Math.random() * FLAP.length));
        }
        el.textContent = out;
      }
      requestAnimationFrame(frame);
    });
  }

  /* ---------- storage ---------- */
  var storageOk = true;
  function blank() {
    return { v: 1, flights: [], windows: {}, settings: { gasUrl: "", token: "" }, outbox: [], lastSync: 0, lastError: "", ui: {} };
  }
  function seedDb() {
    var db = blank(), now = Date.now();
    db.flights = D.SEED_FLIGHTS.map(seedFlight);
    db.windows = JSON.parse(JSON.stringify(D.SEED_WINDOWS));
    db.seedVersion = D.SEED_VERSION || 1;
    return db;
  }
  function seedFlight(r, i) {
    var now = Date.now();
    return {
      id: uid(), date: normDate(r[0]), airline: r[5] || "JL", from: r[1], to: r[2], type: r[3] || "", config: null,
      seat: "", reg: r[4] || "", flightNo: "", note: r[6] || "", window: "", createdAt: now + i, updatedAt: now + i
    };
  }
  // 内蔵データが新しくなったとき、端末の記録に足りない便だけを追加する（端末での編集は上書きしない）
  function mergeSeed(d) {
    if ((d.seedVersion || 1) >= (D.SEED_VERSION || 1)) return d;
    var key = function (f) { return f.date + "|" + f.from + "|" + f.to + "|" + (f.reg || ""); };
    var have = {};
    d.flights.forEach(function (f) { have[key(f)] = f; });
    D.SEED_FLIGHTS.forEach(function (r, i) {
      var f = seedFlight(r, i), cur = have[key(f)];
      if (!cur) { d.flights.push(f); have[key(f)] = f; return; }
      if (!cur.note && f.note) cur.note = f.note;
      if (f.airline !== "JL" && cur.airline === "JL" && !cur.updatedAtByUser) cur.airline = f.airline;
    });
    d.seedVersion = D.SEED_VERSION;
    d.merged = true;
    return d;
  }
  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { storageOk = false; }
    if (raw) {
      try {
        var d = JSON.parse(raw), b = blank();
        Object.keys(b).forEach(function (k) { if (d[k] == null) d[k] = b[k]; });
        mergeSeed(d);
        if (d.merged) { delete d.merged; persist(d); }
        return d;
      } catch (e) { /* fall through */ }
    }
    var s = seedDb();
    persist(s);
    return s;
  }
  function persist(d) {
    try { localStorage.setItem(KEY, JSON.stringify(d)); storageOk = true; }
    catch (e) { storageOk = false; }
  }
  var db = load();
  var badgesFresh = false;
  function save() {
    persist(db);
    if (!storageOk) toast("端末に保存できません。プライベートブラウズを解除してください");
  }

  /* ---------- queries ---------- */
  function sorted() {
    return db.flights.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }
  function countBy(list, fn) {
    var m = {};
    list.forEach(function (x) { var k = fn(x); if (k) m[k] = (m[k] || 0) + 1; });
    return Object.keys(m).map(function (k) { return [k, m[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
  }
  function apFreq() {
    var m = {};
    db.flights.forEach(function (f) { m[f.from] = (m[f.from] || 0) + 1; m[f.to] = (m[f.to] || 0) + 1; });
    return m;
  }
  function regTimes(reg, exceptId) {
    if (!reg) return 0;
    return db.flights.filter(function (f) { return f.reg === reg && f.id !== exceptId; }).length;
  }
  function regOrdinal(f) {
    if (!f.reg) return 0;
    var same = sorted().reverse().filter(function (x) { return x.reg === f.reg; });
    return same.findIndex(function (x) { return x.id === f.id; }) + 1;
  }

  function typeKey(t) {
    var k = String(t || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/ER$/, "");
    var m = k.match(/^B?(7\d7)(\d)[0-9A-Z]{2}$/);   // B737-81D → B737800
    return m ? "B" + m[1] + m[2] + "00" : k;
  }
  // 機体記号から機材を推定。前回の記録が最優先、なければ記号のパターンから
  function detectAircraft(reg, airline, exceptId) {
    if (!reg || reg.length < 5) return null;
    var fam = AL[airline] ? AL[airline].fam : "";
    var hist = sorted().filter(function (f) { return f.reg === reg && f.id !== exceptId; });
    var hc = hist.filter(function (f) { return f.config && getConfig(f.config); })[0];
    if (hc) return { type: hc.type, config: hc.config, src: "history" };
    var ht = hist.filter(function (f) { return f.type && f.type !== "不明"; })[0];
    var type = ht ? ht.type : null, src = ht ? "history" : "rule";
    if (!type) {
      for (var i = 0; i < D.REG_RULES.length; i++) {
        if (new RegExp(D.REG_RULES[i][0]).test(reg)) { type = D.REG_RULES[i][1]; break; }
      }
    }
    if (!type) return null;
    var k = typeKey(type);
    var cfg = D.CONFIGS.filter(function (c) { return c.fam === fam && typeKey(c.type) === k; })[0] ||
      D.CONFIGS.filter(function (c) { return typeKey(c.type) === k; })[0];
    return { type: ht ? ht.type : (cfg ? cfg.type : type), config: cfg ? cfg.id : null, src: src };
  }

  /* ---------- seat configs ---------- */
  function getConfig(id) {
    if (!id) return null;
    if (id.indexOf("GEN:") === 0) {
      var p = id.split(":"), lay = D.GENERIC[p[1]], rows = Math.max(1, Math.min(80, +p[2] || 30));
      if (!lay) return null;
      return { id: id, fam: "", type: "", label: "汎用 " + p[1] + "、" + rows + "列", src: "generic",
        cabins: [{ cls: "座席", from: 1, to: rows, layout: lay }], rows: {}, exits: [], noRecline: [], noWindow: [], wing: [] };
    }
    return CFG[id] || null;
  }
  function rowLayout(cfg, row) {
    if (cfg.rows && cfg.rows[row]) return cfg.rows[row];
    for (var i = 0; i < cfg.cabins.length; i++) {
      var c = cfg.cabins[i];
      if (row >= c.from && row <= c.to) return c.layout;
    }
    return null;
  }
  function cabinIndex(cfg, row) {
    for (var i = 0; i < cfg.cabins.length; i++) if (row >= cfg.cabins[i].from && row <= cfg.cabins[i].to) return i;
    return -1;
  }
  function winLetters(lay) {
    var g = lay.split("|"), L = g[0].charAt(0), R = g[g.length - 1].slice(-1);
    return { L: L !== "-" ? L : null, R: R !== "-" ? R : null };
  }
  function parseSeat(s) {
    var m = String(s || "").toUpperCase().match(/^(\d{1,2})([A-Z])$/);
    return m ? { row: +m[1], letter: m[2] } : null;
  }
  function seatInfo(cfg, seat) {
    var p = parseSeat(seat);
    if (!cfg || !p) return null;
    var lay = rowLayout(cfg, p.row);
    if (!lay || lay.replace(/\|/g, "").indexOf(p.letter) < 0) return null;
    var w = winLetters(lay), groups = lay.split("|"), aisle = false;
    groups.forEach(function (g, gi) {
      var real = g.replace(/-/g, "");
      if (gi > 0 && real.charAt(0) === p.letter) aisle = true;
      if (gi < groups.length - 1 && real.slice(-1) === p.letter) aisle = true;
    });
    var isWin = p.letter === w.L || p.letter === w.R;
    var ci = cabinIndex(cfg, p.row);
    return {
      window: isWin, aisle: !isWin && aisle,
      cabin: ci >= 0 ? cfg.cabins[ci].cls : "",
      exit: (cfg.exits || []).indexOf(p.row) >= 0,
      noRecline: (cfg.noRecline || []).indexOf(p.row) >= 0,
      side: p.letter === w.L ? "左" : p.letter === w.R ? "右" : ""
    };
  }
  function ratingOf(cid, seat) {
    var m = db.windows[cid];
    if (m && m[seat]) return m[seat];
    var c = getConfig(cid);
    if (c && (c.noWindow || []).indexOf(seat) >= 0) return "black";
    return "unknown";
  }
  function setRating(cid, seat, r) {
    var c = getConfig(cid);
    var official = c && (c.noWindow || []).indexOf(seat) >= 0;
    if (!db.windows[cid]) db.windows[cid] = {};
    if (r === "unknown" && !official) delete db.windows[cid][seat];
    else db.windows[cid][seat] = r;
    save();
  }

  function cabinHTML(cfg, o) {
    var maxSlots = 0, maxAisles = 0;
    var layouts = cfg.cabins.map(function (c) { return c.layout; });
    Object.keys(cfg.rows || {}).forEach(function (k) { layouts.push(cfg.rows[k]); });
    layouts.forEach(function (l) {
      maxSlots = Math.max(maxSlots, l.replace(/\|/g, "").length);
      maxAisles = Math.max(maxAisles, l.split("|").length - 1);
    });
    var vw = Math.min(window.innerWidth || 390, 520);
    var avail = vw - 32 - 26 - 28 - maxAisles * 20;
    var s = Math.max(19, Math.min(32, Math.floor(avail / maxSlots) - 3));
    var h = '<div class="fuselage" style="--s:' + s + 'px"><div class="nose">機首</div>';
    cfg.cabins.forEach(function (cab, ci) {
      h += '<div class="cdiv">' + esc(cab.cls) + "</div>";
      for (var row = cab.from; row <= cab.to; row++) h += rowHTML(cfg, row, ci, o);
    });
    return h + "</div>";
  }
  function rowHTML(cfg, row, ci, o) {
    var lay = rowLayout(cfg, row);
    if (!lay) return "";
    var groups = lay.split("|"), w = winLetters(lay);
    var cls = "crow";
    if ((cfg.exits || []).indexOf(row) >= 0) cls += " exit";
    if (cfg.wing && cfg.wing.length && row >= cfg.wing[0] && row <= cfg.wing[1]) cls += " wing";
    var prem = ci < cfg.cabins.length - 1;
    var h = '<div class="' + cls + '" data-row="' + row + '">' + mark(w.L);
    groups.forEach(function (g, gi) {
      if (gi > 0) h += '<span class="aisle">' + row + "</span>";
      for (var i = 0; i < g.length; i++) {
        var ch = g.charAt(i);
        if (ch === "-") { h += '<span class="seat gap"></span>'; continue; }
        var id = row + ch, isWin = ch === w.L || ch === w.R, c = "seat";
        if (prem) c += " prem";
        if (o.mode === "rate") c += isWin ? " rate " + ratingOf(cfg.id, id) : " dim";
        if (o.selected === id) c += " sel";
        h += '<button type="button" class="' + c + '" data-seat="' + id + '" aria-label="' + id + '">' +
          (o.selected === id ? id : ch) + "</button>";
      }
    });
    return h + mark(w.R) + "</div>";
    function mark(letter) {
      if (!letter) return '<span class="win none"></span>';
      return '<span class="win ' + ratingOf(cfg.id, row + letter) + '"></span>';
    }
  }

  /* ---------- boarding pass ---------- */
  function ticketHTML(f, o) {
    o = o || {};
    var al = AL[f.airline];
    function slot(key, inner) {
      return '<div class="slot' + (o.now === key ? " now" : "") + '"' +
        (o.live ? ' data-act="jump" data-key="' + key + '"' : "") + ">" + inner + "</div>";
    }
    function val(v, cls, f) {
      return '<div class="t-v' + (v ? "" : " t-empty") + (cls ? " " + cls : "") + '"' + (f ? ' data-f="' + f + '"' : "") + ">" + (v ? esc(v) : "—") + "</div>";
    }
    var flightNo = f.flightNo ? (f.airline || "") + f.flightNo : "";
    var airline = slot("airline", '<div class="t-airline">' +
      (al ? '<b data-f="airline">' + esc(al.name) + "</b><span>" + esc(al.code) + "</span>" : '<span class="t-empty">航空会社</span>') + "</div>");
    var route = slot("route",
      '<div class="t-route"><span data-f="from" class="t-code' + (f.from ? "" : " t-empty") + '">' + esc(f.from || "———") + "</span>" +
      '<span class="t-path">' + PLANE + "</span>" +
      '<span data-f="to" class="t-code' + (f.to ? "" : " t-empty") + '">' + esc(f.to || "———") + "</span></div>" +
      '<div class="t-names"><span>' + esc(apName(f.from) || "出発") + "</span><span>" + esc(apName(f.to) || "到着") + "</span></div>");
    var grid = '<div class="t-grid">' +
      slot("date", '<div class="t-k">搭乗日</div>' + val(dots(f.date), "serif num", "date")) +
      slot("aircraft", '<div class="t-k">機材</div>' + val(f.type, "", "type")) +
      slot("note", '<div class="t-k">便名</div>' + val(flightNo, "", "flightNo")) + "</div>";
    var stub = '<div class="stub">' +
      slot("seat", '<div class="t-k">座席</div>' + (f.seat ? '<div class="t-seat" data-f="seat">' + esc(f.seat) + "</div>" : '<div class="t-seat t-empty">—</div>')) +
      slot("reg", '<div class="t-k">機体記号</div>' + val(f.reg, "num", "reg")) +
      '<div class="stamp">記録<small>' + esc(dots(todayISO())) + "</small></div></div>";
    return '<div class="ticket' + (o.live ? " live" : "") + '" style="--al:' + alColor(f.airline) + '">' +
      '<div class="main">' + airline + route + grid + "</div>" + stub + "</div>";
  }

  /* ---------- views ---------- */
  var view = "home";
  var app = $("#app");

  function go(v, opts) {
    opts = opts || {};
    view = v;
    $$(".tab").forEach(function (t) { t.classList.toggle("on", t.dataset.tab === v); });
    $("#fab").classList.toggle("hide", v !== "home");
    render({ enter: opts.enter, fresh: !opts.enter });
    window.scrollTo(0, 0);
  }
  // fresh: tab just opened (staggered rise). enter: first arrival after the launch animation.
  function render(opts) {
    opts = opts || {};
    var h = view === "stats" ? statsHTML() : view === "windows" ? windowsHTML() : view === "settings" ? settingsHTML() : homeHTML();
    var cls = opts.enter ? " enter" : opts.fresh ? " fresh" : "";
    app.innerHTML = '<div class="view' + cls + '">' + h + "</div>";
    if (cls) {
      stagger(app.firstChild, opts.enter ? 14 : 10);
      if (opts.enter || view === "stats") countUp(app);
    }
  }

  function syncState() {
    if (!db.settings.gasUrl) return { cls: "", text: "シート未接続" };
    if (syncing) return { cls: "wait", text: "送信中" };
    if (db.lastError) return { cls: "err", text: "同期エラー" };
    if (db.outbox.length) return { cls: "wait", text: "送信待ち " + db.outbox.length + "件" };
    return { cls: "ok", text: "シートと同期済み" };
  }
  function pillHTML() {
    var s = syncState();
    return '<button type="button" class="pill ' + s.cls + '" data-act="to-settings"><i></i>' + esc(s.text) + "</button>";
  }
  function refreshPills() {
    $$(".pill[data-act='to-settings']").forEach(function (p) { p.outerHTML = pillHTML(); });
  }

  function homeHTML() {
    var list = sorted();
    var h = '<header class="top"><div><h1>搭乗記録</h1></div>' + pillHTML() + "</header>";
    if (!list.length) {
      return h + '<div class="empty"><b>まだ記録がありません</b>下のボタンから最初の搭乗を記録できます。</div>';
    }
    var last = list[0];
    var ago = Math.round((parts(todayISO()).t - parts(last.date).t) / 86400000);
    var agoText = ago === 0 ? "今日" : ago > 0 ? ago + "日前" : Math.abs(ago) + "日後";
    var dist = list.reduce(function (s, f) { return s + km(f.from, f.to); }, 0);
    h += '<section class="hero"><p class="hero-cap">最新の搭乗、' + agoText + '</p>' +
      '<button type="button" style="width:100%;display:block" data-act="detail" data-id="' + last.id + '">' + ticketHTML(last) + "</button></section>";
    h += '<p class="tally">通算<b class="num" data-count="' + list.length + '">' + list.length + '</b>便、総飛行距離 約<b class="num" data-count="' + Math.round(dist) + '">' + fmtNum(dist) + "</b>km</p>";
    var byYear = {};
    list.forEach(function (f) { var y = f.date.slice(0, 4); (byYear[y] = byYear[y] || []).push(f); });
    Object.keys(byYear).sort().reverse().forEach(function (y) {
      h += '<div class="year"><h2 class="num">' + y + "</h2><span>" + byYear[y].length + "便</span></div>";
      byYear[y].forEach(function (f) {
        var p = parts(f.date);
        h += '<button type="button" class="fl" data-act="detail" data-id="' + f.id + '" style="--al:' + alColor(f.airline) + '">' +
          '<div class="fl-date"><i></i><b class="num">' + p.d + "</b><span>" + p.m + "月 " + p.w + "</span></div>" +
          '<div class="fl-route"><div class="codes">' + esc(f.from) + "<em>" + PLANE.replace("<svg", '<svg style="width:13px;height:13px;fill:currentColor"') + "</em>" + esc(f.to) + "</div>" +
          "<small>" + esc(apName(f.from)) + " から " + esc(apName(f.to)) + (f.seat ? "、" + esc(f.seat) : "") + "</small></div>" +
          '<div class="fl-meta"><span>' + esc(f.type || "") + "</span><em>" + esc(f.reg || "") + "</em></div></button>";
      });
    });
    return h;
  }

  /* ---------- stats ---------- */
  var statsOpen = {};
  function rankHTML(key, rows, fmt) {
    if (!rows.length) return '<p class="note">まだデータがありません。</p>';
    var max = rows[0][1], show = statsOpen[key] ? rows : rows.slice(0, 8);
    var h = '<ul class="rank">' + show.map(function (r, i) {
      return '<li style="--i:' + Math.min(i, 10) + '"><div class="nm">' + fmt(r[0]) + '</div><div class="ct num">' + r[1] + '</div><div class="bar"><i style="width:' +
        Math.max(4, r[1] / max * 100) + '%"></i></div></li>';
    }).join("") + "</ul>";
    if (rows.length > 8) h += '<button type="button" class="btn quiet more" data-act="stats-more" data-key="' + key + '">' +
      (statsOpen[key] ? "上位だけ表示" : "すべて表示（" + rows.length + "件）") + "</button>";
    return h;
  }
  function statsHTML() {
    var list = db.flights;
    var h = '<header class="top"><div><h1>統計</h1></div></header>';
    if (!list.length) return h + '<div class="empty"><b>まだ記録がありません</b></div>';
    var dist = list.reduce(function (s, f) { return s + km(f.from, f.to); }, 0);
    var regs = countBy(list, function (f) { return f.reg; });
    var aps = {};
    list.forEach(function (f) { aps[f.from] = 1; aps[f.to] = 1; });
    h += '<div class="kpis">' +
      '<div class="kpi"><b class="num"><em data-count="' + list.length + '">' + list.length + "</em><small>便</small></b><span>通算搭乗</span></div>" +
      '<div class="kpi"><b class="num"><em data-count="' + Math.round(dist) + '">' + fmtNum(dist) + "</em><small>km</small></b><span>総飛行距離（大圏距離）</span></div>" +
      '<div class="kpi"><b class="num"><em data-count="' + regs.length + '">' + regs.length + "</em><small>機</small></b><span>乗った機体</span></div>" +
      '<div class="kpi"><b class="num"><em data-count="' + Object.keys(aps).length + '">' + Object.keys(aps).length + "</em><small>空港</small></b><span>利用した空港</span></div></div>";
    h += '<button type="button" class="btn line recap-open" data-act="recap">振り返りカードを作る</button>';
    var nRoutes = routeData(list).keys.length;
    h += '<div class="card map-card"><div class="map-head"><h3>路線マップ</h3><div class="seg small" id="mapSeg">' +
      [["fit", "飛んだ範囲"], ["all", "日本全体"]].map(function (m) {
        return '<button type="button" class="' + (mapMode === m[0] ? "on" : "") + '" data-act="map-mode" data-m="' + m[0] + '">' + m[1] + "</button>";
      }).join("") + '</div></div><div class="map-wrap" id="mapWrap">' + routeMapSVG(list, mapMode) + "</div>" +
      '<div class="map-legend"><span>' + nRoutes + " 路線</span><span>線の太さは搭乗回数</span></div></div>";
    h += badgesCardHTML();
    h += '<div class="card"><h3>機体記号</h3>' + rankHTML("reg", regs, function (k) {
      var t = (list.filter(function (f) { return f.reg === k; })[0] || {}).type;
      return esc(k) + (t ? "<small>" + esc(t) + "</small>" : "");
    }) + "</div>";
    h += '<div class="card"><h3>路線</h3>' + rankHTML("route", countBy(list, function (f) { return f.from + ">" + f.to; }), function (k) {
      var p = k.split(">");
      return esc(p[0]) + " から " + esc(p[1]) + "<small>" + esc(apName(p[0])) + "、" + esc(apName(p[1])) + "</small>";
    }) + "</div>";
    h += '<div class="card"><h3>機材</h3>' + rankHTML("type", countBy(list, function (f) { return f.type; }), esc) + "</div>";
    h += '<div class="card"><h3>航空会社</h3>' + rankHTML("airline", countBy(list, function (f) { return f.airline; }), function (k) {
      return esc(AL[k] ? AL[k].name : k);
    }) + "</div>";
    h += '<div class="card"><h3>空港</h3>' + rankHTML("ap", Object.keys(apFreq()).map(function (k) { return [k, apFreq()[k]]; })
      .sort(function (a, b) { return b[1] - a[1]; }), function (k) { return esc(k) + "<small>" + esc(apName(k)) + "</small>"; }) + "</div>";
    var years = countBy(list, function (f) { return f.date.slice(0, 4); }).sort(function (a, b) { return a[0] < b[0] ? -1 : 1; });
    var ymax = Math.max.apply(null, years.map(function (y) { return y[1]; }));
    h += '<div class="card"><h3>年別</h3><div class="years">' + years.map(function (y, i) {
      return '<div style="--i:' + i + '"><b class="num">' + y[1] + '</b><i style="height:' + Math.max(6, y[1] / ymax * 70) + 'px"></i><span class="num">' + y[0] + "</span></div>";
    }).join("") + "</div></div>";
    return h;
  }

  /* ---------- route map ---------- */
  var MAPC = Math.cos(36 * Math.PI / 180), mapMode = "fit";
  function pxy(c) { var a = AP[c]; return a ? [(a.lon - 138) * MAPC * 10, -(a.lat - 36) * 10] : null; }
  function routeData(list) {
    var routes = {}, aps = {};
    list.forEach(function (f) {
      if (!AP[f.from] || !AP[f.to]) return;
      var k = f.from < f.to ? f.from + "-" + f.to : f.to + "-" + f.from;
      routes[k] = (routes[k] || 0) + 1;
      aps[f.from] = (aps[f.from] || 0) + 1; aps[f.to] = (aps[f.to] || 0) + 1;
    });
    var keys = Object.keys(routes).sort(function (a, b) { return routes[b] - routes[a]; });
    return { routes: routes, aps: aps, keys: keys };
  }
  // viewBox that fits the visited airports (or all of Japan) at the given height/width ratio
  function mapBox(rd, mode, A, minW) {
    minW = minW || 64;
    var minx = -112, maxx = 64, miny = -96, maxy = 118;
    var codes = Object.keys(rd.aps);
    if (mode !== "all" && codes.length) {
      minx = miny = Infinity; maxx = maxy = -Infinity;
      codes.forEach(function (c) { var p = pxy(c); minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]); });
      var px = Math.max(10, (maxx - minx) * 0.22), py = Math.max(10, (maxy - miny) * 0.22);
      minx -= px; maxx += px; miny -= py; maxy += py;
    }
    var w = maxx - minx, h = maxy - miny, cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
    if (w < minW) w = minW;
    if (h < minW * A) h = minW * A;
    if (h / w < A) h = w * A; else w = h / A;
    return { x: cx - w / 2, y: cy - h / 2, w: w, h: h };
  }
  function arcOf(a, b) {
    var p = pxy(a), q = pxy(b);
    var dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1;
    var nx = -dy / len, ny = dx / len;
    if (ny > 0) { nx = -nx; ny = -ny; }
    var bend = len * 0.2;
    return { p: p, q: q, c: [(p[0] + q[0]) / 2 + nx * bend, (p[1] + q[1]) / 2 + ny * bend], len: len };
  }
  function routeMapSVG(list, mode) {
    var rd = routeData(list), A = 1.05, b = mapBox(rd, mode, A), u = b.w / 340;
    var f2 = function (n) { return n.toFixed(2); };
    var h = '<svg class="map" viewBox="' + [b.x, b.y, b.w, b.h].map(f2).join(" ") + '" role="img" aria-label="路線マップ">';
    h += '<path class="land" d="' + D.JAPAN_PATH + '" stroke-width="' + f2(u * 0.8) + '"/>';
    D.AIRPORTS.forEach(function (a) {
      if (rd.aps[a.iata]) return;
      var p = pxy(a.iata);
      h += '<circle class="ap0" cx="' + f2(p[0]) + '" cy="' + f2(p[1]) + '" r="' + f2(u * 1.5) + '"/>';
    });
    var maxC = rd.routes[rd.keys[0]] || 1;
    rd.keys.forEach(function (k, i) {
      var ab = k.split("-"), r = arcOf(ab[0], ab[1]);
      var d = "M" + f2(r.p[0]) + " " + f2(r.p[1]) + " Q" + f2(r.c[0]) + " " + f2(r.c[1]) + " " + f2(r.q[0]) + " " + f2(r.q[1]);
      var sw = u * (1.1 + 2.6 * Math.sqrt(rd.routes[k] / maxC)), delay = 0.35 + i * 0.16;
      h += '<path class="rt-glow" pathLength="1" d="' + d + '" stroke-width="' + f2(sw * 4.5) + '" style="--d:' + delay.toFixed(2) + 's"/>';
      h += '<path class="rt" pathLength="1" d="' + d + '" stroke-width="' + f2(sw) + '" style="--d:' + delay.toFixed(2) + 's"/>';
      if (i < 6 && !REDUCE) {
        var dur = (3.4 + r.len / 45).toFixed(2), begin = (delay + 2.6 + i * 1.1).toFixed(2);
        h += '<circle class="comet" r="' + f2(u * 2.1) + '" opacity="0">' +
          '<animateMotion dur="' + dur + 's" begin="' + begin + 's" repeatCount="indefinite" path="' + d + '" calcMode="spline" keyPoints="0;1;1" keyTimes="0;0.72;1" keySplines=".5 0 .2 1;0 0 1 1"/>' +
          '<animate attributeName="opacity" dur="' + dur + 's" begin="' + begin + 's" repeatCount="indefinite" values="0;1;1;0;0" keyTimes="0;0.1;0.62;0.74;1"/></circle>';
      }
    });
    var apk = Object.keys(rd.aps).sort(function (a, b2) { return rd.aps[b2] - rd.aps[a]; }), maxA = rd.aps[apk[0]] || 1;
    apk.forEach(function (c, i) {
      var p = pxy(c), r = u * (2 + 2.2 * Math.sqrt(rd.aps[c] / maxA)), right = p[0] > b.x + b.w * 0.8;
      h += '<circle class="halo" cx="' + f2(p[0]) + '" cy="' + f2(p[1]) + '" r="' + f2(r * 2.2) + '" style="animation-delay:' + (i * 0.45).toFixed(2) + 's"/>';
      h += '<circle class="ap1" cx="' + f2(p[0]) + '" cy="' + f2(p[1]) + '" r="' + f2(r) + '"/>';
      if (i < 16) h += '<text class="lbl" x="' + f2(p[0] + (right ? -1 : 1) * (r + u * 3)) + '" y="' + f2(p[1] + u * 3.6) + '" text-anchor="' + (right ? "end" : "start") +
        '" font-size="' + f2(u * 10.5) + '" stroke-width="' + f2(u * 3.2) + '">' + c + "</text>";
    });
    return h + "</svg>";
  }

  /* ---------- achievements ---------- */
  var HOKKAIDO = ["CTS", "OKD", "HKD", "AKJ", "KUH", "OBO", "MMB", "SHB", "WKJ", "MBE", "RIS", "OIR"];
  var OKINAWA = ["OKA", "UEO", "MMY", "SHI", "ISG", "OGN", "KTD", "MMD", "TRA"];
  var BADGES = [
    { id: "f1", mark: "初", name: "はじめての記録", desc: "最初の1便を記録した", v: "n", goal: 1 },
    { id: "f10", mark: "10", name: "10便", desc: "通算10便に搭乗", v: "n", goal: 10 },
    { id: "f25", mark: "25", name: "25便", desc: "通算25便に搭乗", v: "n", goal: 25 },
    { id: "f50", mark: "50", name: "50便", desc: "通算50便に搭乗", v: "n", goal: 50 },
    { id: "f100", mark: "100", name: "100便", desc: "通算100便に搭乗", v: "n", goal: 100 },
    { id: "d10k", mark: "1万", name: "1万キロ", desc: "総飛行距離 10,000km", v: "km", goal: 10000 },
    { id: "dhalf", mark: "半周", name: "地球半周", desc: "総飛行距離 20,038km", v: "km", goal: 20038 },
    { id: "dfull", mark: "一周", name: "地球一周", desc: "総飛行距離 40,075km", v: "km", goal: 40075 },
    { id: "ap5", mark: "5港", name: "5空港", desc: "5つの空港を利用", v: "nAp", goal: 5 },
    { id: "ap10", mark: "10港", name: "10空港", desc: "10の空港を利用", v: "nAp", goal: 10 },
    { id: "ap20", mark: "20港", name: "20空港", desc: "20の空港を利用", v: "nAp", goal: 20 },
    { id: "ns", mark: "南北", name: "北と南", desc: "北海道と沖縄の両方へ飛んだ", v: "ns", goal: 2 },
    { id: "r10", mark: "10機", name: "10機", desc: "10機の機体に搭乗", v: "nReg", goal: 10 },
    { id: "r30", mark: "30機", name: "30機", desc: "30機の機体に搭乗", v: "nReg", goal: 30 },
    { id: "r50", mark: "50機", name: "50機", desc: "50機の機体に搭乗", v: "nReg", goal: 50 },
    { id: "same3", mark: "再会", name: "3度目の再会", desc: "同じ機体に3回搭乗", v: "same", goal: 3 },
    { id: "same5", mark: "常連", name: "顔なじみ", desc: "同じ機体に5回搭乗", v: "same", goal: 5 },
    { id: "t3", mark: "3型", name: "3機種", desc: "3つの機種に搭乗", v: "nType", goal: 3 },
    { id: "t5", mark: "5型", name: "5機種", desc: "5つの機種に搭乗", v: "nType", goal: 5 },
    { id: "al3", mark: "3社", name: "3社", desc: "3つの航空会社に搭乗", v: "nAl", goal: 3 },
    { id: "y20", mark: "年20", name: "1年で20便", desc: "同じ年に20便", v: "year", goal: 20 },
    { id: "day2", mark: "乗継", name: "乗り継ぎ", desc: "同じ日に2便", v: "day", goal: 2 },
    { id: "long", mark: "長", name: "長距離", desc: "1,500km以上の区間を飛んだ", v: "long", goal: 1500 },
    { id: "win", mark: "窓", name: "窓の目利き", desc: "窓の見え方を10席判定", v: "rated", goal: 10 }
  ];
  var BADGE = {};
  BADGES.forEach(function (b) { BADGE[b.id] = b; });
  function flightStats(list) {
    var s = { n: list.length, km: 0, long: 0, aps: {}, regs: {}, types: {}, als: {}, years: {}, days: {}, north: 0, south: 0 };
    list.forEach(function (f) {
      var k = km(f.from, f.to);
      s.km += k; s.long = Math.max(s.long, k);
      s.aps[f.from] = 1; s.aps[f.to] = 1;
      if (f.reg) s.regs[f.reg] = (s.regs[f.reg] || 0) + 1;
      if (f.type && f.type !== "不明") s.types[typeKey(f.type)] = 1;
      if (f.airline) s.als[f.airline] = 1;
      var y = f.date.slice(0, 4);
      s.years[y] = (s.years[y] || 0) + 1;
      s.days[f.date] = (s.days[f.date] || 0) + 1;
      if (HOKKAIDO.indexOf(f.from) >= 0 || HOKKAIDO.indexOf(f.to) >= 0) s.north = 1;
      if (OKINAWA.indexOf(f.from) >= 0 || OKINAWA.indexOf(f.to) >= 0) s.south = 1;
    });
    var vals = function (o) { return Object.keys(o).map(function (k) { return o[k]; }); };
    s.nAp = Object.keys(s.aps).length; s.nReg = Object.keys(s.regs).length; s.nType = Object.keys(s.types).length;
    s.nAl = Object.keys(s.als).length; s.ns = s.north + s.south;
    s.same = Math.max.apply(null, [0].concat(vals(s.regs)));
    s.year = Math.max.apply(null, [0].concat(vals(s.years)));
    s.day = Math.max.apply(null, [0].concat(vals(s.days)));
    s.rated = 0;
    Object.keys(db.windows).forEach(function (c) { Object.keys(db.windows[c]).forEach(function (k) { if (db.windows[c][k] !== "unknown") s.rated++; }); });
    return s;
  }
  function earnedNow() {
    var st = flightStats(db.flights);
    return BADGES.filter(function (b) { return st[b.v] >= b.goal; }).map(function (b) { return b.id; });
  }
  function initBadges() {
    if (db.badges) return;
    db.badges = {};
    earnedNow().forEach(function (id) { db.badges[id] = ""; });
    badgesFresh = true;
    save();
  }
  function checkBadges() {
    var got = earnedNow().filter(function (id) { return !(id in db.badges); });
    if (!got.length) return;
    got.forEach(function (id) { db.badges[id] = todayISO(); });
    save();
    showAwards(got);
  }
  function medalSVG(b, on, prog) {
    var m = b.mark, fs = m.length >= 3 ? 23 : m.length === 2 ? 27 : 34;
    var face = on
      ? '<circle cx="50" cy="50" r="47" fill="url(#mdRim)"/><circle cx="50" cy="50" r="40.5" fill="url(#mdFace)"/>' +
        '<circle cx="50" cy="50" r="35.5" fill="none" style="stroke:var(--md-r2)" stroke-opacity=".6" stroke-width="1.3" stroke-dasharray=".1 4.4" stroke-linecap="round"/>'
      : '<circle cx="50" cy="50" r="47" fill="url(#mdOff)"/><circle cx="50" cy="50" r="40.5" style="fill:var(--md-of)"/>' +
        (prog > 0 ? '<circle cx="50" cy="50" r="47" fill="none" style="stroke:var(--brass)" stroke-opacity=".85" stroke-width="3" pathLength="100" stroke-dasharray="' +
          (Math.min(1, prog) * 100).toFixed(1) + ' 100" transform="rotate(-90 50 50)" stroke-linecap="round"/>' : "");
    return '<svg viewBox="0 0 100 100" aria-hidden="true">' + face +
      '<text x="50" y="' + (50 + fs * 0.36).toFixed(1) + '" text-anchor="middle" font-family="Shippori Mincho B1, Hiragino Mincho ProN, Noto Serif CJK JP, serif" font-weight="600" font-size="' + fs +
      '" style="fill:var(' + (on ? "--md-mk" : "--md-mko") + ')">' + esc(m) + "</text></svg>";
  }
  function badgesCardHTML() {
    var st = flightStats(db.flights), got = 0;
    var items = BADGES.map(function (b, i) {
      var on = b.id in db.badges || st[b.v] >= b.goal;
      if (on) got++;
      return '<button type="button" class="badge' + (on ? " on" : "") + '" data-act="badge" data-id="' + b.id + '" style="--i:' + i + '">' +
        medalSVG(b, on, st[b.v] / b.goal) + "<span>" + esc(b.name) + "</span></button>";
    }).join("");
    return '<div class="card"><div class="map-head"><h3>実績</h3><span class="badge-count num">' + got + " / " + BADGES.length + '</span></div><div class="badges">' + items + "</div></div>";
  }
  function openBadge(id) {
    var b = BADGE[id], st = flightStats(db.flights), on = id in db.badges || st[b.v] >= b.goal, cur = st[b.v];
    var unit = { n: "便", km: "km", nAp: "空港", ns: "", nReg: "機", same: "回", nType: "機種", nAl: "社", year: "便", day: "便", long: "km", rated: "席" }[b.v];
    var progText = b.v === "ns" ? (st.north ? "北海道は達成" : "北海道はまだ") + "、" + (st.south ? "沖縄は達成" : "沖縄はまだ")
      : fmtNum(Math.min(cur, b.goal)) + " / " + fmtNum(b.goal) + " " + unit;
    var when = db.badges[id] ? dots(db.badges[id]) + " に解除" : on ? "達成済み" : "";
    openSheet('<div class="medal-detail">' + medalSVG(b, on, cur / b.goal) + "<h3>" + esc(b.name) + "</h3><p>" + esc(b.desc) + "</p>" +
      (on ? '<p class="num" style="color:var(--accent-text)">' + esc(when) + "</p>"
        : '<div class="prog"><i style="width:' + Math.min(100, cur / b.goal * 100).toFixed(1) + '%"></i></div><p class="num">' + esc(progText) + "</p>") +
      '</div><div class="btns one" style="margin-top:16px"><button type="button" class="btn line" data-act="sheet-close">閉じる</button></div>');
  }
  var awardQ = [];
  function showAwards(ids) {
    awardQ = awardQ.concat(ids);
    if (!$("#award").classList.contains("open")) nextAward();
  }
  function nextAward() {
    var el = $("#award"), id = awardQ.shift();
    if (!id) { el.classList.remove("open"); el.setAttribute("aria-hidden", "true"); return; }
    var b = BADGE[id];
    el.innerHTML = '<div class="award-in"><div class="medal-big"><div class="rays"></div>' + medalSVG(b, true) + '<div class="shine"></div></div>' +
      '<div class="award-text"><small>実績を解除</small><h2>' + esc(b.name) + "</h2><p>" + esc(b.desc) + "</p>" +
      '<button type="button" class="btn gold" data-act="award-next">' + (awardQ.length ? "次の実績へ" : "閉じる") + "</button></div></div>";
    el.classList.remove("open"); void el.offsetWidth; el.classList.add("open");
    el.setAttribute("aria-hidden", "false");
  }

  /* ---------- recap card ---------- */
  var RECAP = { kind: "year", key: "", canvas: null, token: 0 };
  var KINDS = [["year", "年間"], ["half", "半年"], ["month", "月間"]];
  function periodKey(kind, date) {
    var y = date.slice(0, 4), m = date.slice(5, 7);
    return kind === "year" ? y : kind === "half" ? y + "-" + (m <= "06" ? "H1" : "H2") : y + "-" + m;
  }
  function recapPeriods(kind) {
    var set = {};
    db.flights.forEach(function (f) { set[periodKey(kind, f.date)] = 1; });
    return Object.keys(set).sort().reverse();
  }
  function periodLabel(kind, key) {
    var y = key.slice(0, 4);
    if (kind === "year") return { big: y + "年", sub: "年間の記録" };
    if (kind === "half") return { big: y + "年", sub: key.slice(5) === "H1" ? "上半期の記録" : "下半期の記録" };
    return { big: y + "年" + (+key.slice(5)) + "月", sub: "月間の記録" };
  }
  function periodChip(kind, key) {
    var y = key.slice(0, 4);
    if (kind === "year") return y + "年";
    if (kind === "half") return y + "年 " + (key.slice(5) === "H1" ? "上半期" : "下半期");
    return y + "年" + (+key.slice(5)) + "月";
  }
  function recapSheetHTML() {
    return '<h3 class="sheet-h">振り返りカード</h3><div class="seg" id="recapKinds">' + KINDS.map(function (k) {
      return '<button type="button" class="' + (RECAP.kind === k[0] ? "on" : "") + '" data-act="recap-kind" data-k="' + k[0] + '">' + k[1] + "</button>";
    }).join("") + '</div><div class="periods" id="recapPeriods">' + recapPeriodsHTML() + "</div>" +
      '<div class="recap-frame"><img id="recapImg" alt="振り返りカード"><div class="wait">カードを作っています</div></div>' +
      '<div class="btns one" style="margin-top:14px"><button type="button" class="btn gold" data-act="recap-share">画像を保存・共有</button></div>' +
      '<p class="note" style="color:var(--muted);margin:10px 2px 0;text-align:center;font-size:12.5px">画像を長押ししても保存できます。</p>';
  }
  function recapPeriodsHTML() {
    return recapPeriods(RECAP.kind).map(function (k) {
      return '<button type="button" class="chip' + (RECAP.key === k ? " on" : "") + '" data-act="recap-key" data-k="' + k + '">' + periodChip(RECAP.kind, k) + "</button>";
    }).join("");
  }
  function openRecap() {
    if (!db.flights.length) { toast("記録がまだありません"); return; }
    RECAP.kind = "year"; RECAP.key = recapPeriods("year")[0];
    openSheet(recapSheetHTML());
    renderRecap();
  }
  function renderRecap() {
    var img = $("#recapImg"), token = ++RECAP.token;
    if (!img) return;
    img.classList.remove("ready");
    drawRecap(RECAP.kind, RECAP.key).then(function (cv) {
      if (token !== RECAP.token) return;
      RECAP.canvas = cv;
      img.onload = function () { img.classList.add("ready"); };
      img.src = cv.toDataURL("image/png");
    });
  }
  function spaced(c, text, x, y, gap, align) {
    var w = 0, i, chars = Array.from(text);
    chars.forEach(function (ch) { w += c.measureText(ch).width; });
    w += gap * (chars.length - 1);
    var sx = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    var oldAlign = c.textAlign; c.textAlign = "left";
    for (i = 0; i < chars.length; i++) { c.fillText(chars[i], sx, y); sx += c.measureText(chars[i]).width + gap; }
    c.textAlign = oldAlign;
    return w;
  }
  function roundRect(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function drawRecap(kind, key) {
    var list = db.flights.filter(function (f) { return periodKey(kind, f.date) === key; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var SERIF = '"Shippori Mincho B1", "Hiragino Mincho ProN", "Noto Serif CJK JP", serif';
    var SANS = '"Zen Kaku Gothic New", "Hiragino Sans", "Noto Sans CJK JP", sans-serif';
    var fontsReady = document.fonts && document.fonts.load
      ? Promise.all([document.fonts.load('600 80px "Shippori Mincho B1"'), document.fonts.load('700 30px "Zen Kaku Gothic New"'), document.fonts.load('400 30px "Zen Kaku Gothic New"')]).catch(function () {})
      : Promise.resolve();
    return fontsReady.then(function () {
      var C = themeColors();
      var W = 1080, H = 1350, cv = document.createElement("canvas");
      cv.width = W; cv.height = H;
      var c = cv.getContext("2d");
      var g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, C("rc-1")); g.addColorStop(0.5, C("rc-2")); g.addColorStop(1, C("rc-3"));
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      var rg = c.createRadialGradient(W / 2, 520, 0, W / 2, 520, 620);
      rg.addColorStop(0, C("accent-rgb", 0.10)); rg.addColorStop(1, C("accent-rgb", 0));
      c.fillStyle = rg; c.fillRect(0, 0, W, H);
      // header
      c.textBaseline = "alphabetic";
      c.fillStyle = C("brass"); c.font = "600 30px " + SERIF;
      spaced(c, "搭乗記録", 72, 104, 10, "left");
      var first = list[0], last = list[list.length - 1];
      c.fillStyle = C("muted"); c.font = "400 26px " + SANS; c.textAlign = "right";
      if (first) c.fillText(dots(first.date) + "  —  " + dots(last.date), W - 72, 104);
      c.textAlign = "left";
      var lab = periodLabel(kind, key);
      c.fillStyle = C("text"); c.font = "600 92px " + SERIF;
      var bw = spaced(c, lab.big, 68, 232, 4, "left");
      c.fillStyle = C("accent-text"); c.font = "600 38px " + SERIF;
      spaced(c, lab.sub, 68 + bw + 24, 228, 6, "left");
      // map
      var mx = 60, my = 280, mw = 960, mh = 560, rd = routeData(list), box = mapBox(rd, "fit", mh / mw, 120), sc = mw / box.w;
      c.save(); roundRect(c, mx, my, mw, mh, 26); c.clip();
      c.fillStyle = C("rc-panel"); c.fillRect(mx, my, mw, mh);
      c.translate(mx, my); c.scale(sc, sc); c.translate(-box.x, -box.y);
      var land = new Path2D(D.JAPAN_PATH);
      c.fillStyle = C("rc-land"); c.fill(land);
      c.strokeStyle = C("accent-rgb", 0.42); c.lineWidth = 1.6 / sc; c.lineJoin = "round"; c.stroke(land);
      var maxC = rd.routes[rd.keys[0]] || 1;
      rd.keys.slice().reverse().forEach(function (k) {
        var ab = k.split("-"), r = arcOf(ab[0], ab[1]), wgt = Math.sqrt(rd.routes[k] / maxC);
        c.beginPath(); c.moveTo(r.p[0], r.p[1]); c.quadraticCurveTo(r.c[0], r.c[1], r.q[0], r.q[1]);
        c.lineCap = "round";
        c.strokeStyle = C("accent-rgb", 0.18); c.lineWidth = (14 + 22 * wgt) / sc; c.stroke();
        c.strokeStyle = C("rc-route"); c.lineWidth = (3 + 6 * wgt) / sc; c.stroke();
      });
      var apk = Object.keys(rd.aps).sort(function (a, b) { return rd.aps[b] - rd.aps[a]; }), maxA = rd.aps[apk[0]] || 1;
      apk.forEach(function (code) {
        var p = pxy(code), r = (7 + 7 * Math.sqrt(rd.aps[code] / maxA)) / sc;
        c.fillStyle = C("accent-rgb", 0.22); c.beginPath(); c.arc(p[0], p[1], r * 2.2, 0, Math.PI * 2); c.fill();
        c.fillStyle = C("rc-ap"); c.beginPath(); c.arc(p[0], p[1], r, 0, Math.PI * 2); c.fill();
      });
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.font = "700 28px " + SANS; c.lineJoin = "round";
      apk.slice(0, 12).forEach(function (code) {
        var p = pxy(code), x = mx + (p[0] - box.x) * sc, y = my + (p[1] - box.y) * sc, right = x > mx + mw * 0.8;
        var r = 7 + 7 * Math.sqrt(rd.aps[code] / maxA);
        c.textAlign = right ? "right" : "left";
        var tx = x + (right ? -1 : 1) * (r + 12);
        c.strokeStyle = C("map-2"); c.lineWidth = 8; c.strokeText(code, tx, y + 10);
        c.fillStyle = C("text"); c.fillText(code, tx, y + 10);
      });
      c.textAlign = "left";
      c.restore();
      c.strokeStyle = C("accent-rgb", 0.25); c.lineWidth = 2; roundRect(c, mx, my, mw, mh, 26); c.stroke();
      // boarding-pass panel
      var st = flightStats(list), px = 60, py = 880, pw = 960, ph = 360, stubW = 300, sx = px + pw - stubW;
      var paper = c.createLinearGradient(0, py, 0, py + ph);
      paper.addColorStop(0, C("paper-top")); paper.addColorStop(0.6, C("pearl")); paper.addColorStop(1, C("paper-bot"));
      c.save();
      c.shadowColor = C("ticket-shadow"); c.shadowBlur = 40; c.shadowOffsetY = 18;
      roundRect(c, px, py, pw, ph, 28); c.fillStyle = paper; c.fill();
      c.restore();
      c.save(); roundRect(c, px, py, pw, ph, 28); c.clip();
      c.fillStyle = C("brass"); c.fillRect(px, py, pw, 10);
      c.restore();
      // notches + perforation
      c.save(); c.globalCompositeOperation = "destination-out";
      c.beginPath(); c.arc(sx, py, 18, 0, Math.PI * 2); c.arc(sx, py + ph, 18, 0, Math.PI * 2); c.fill();
      c.restore();
      c.save(); c.globalCompositeOperation = "destination-over"; c.fillStyle = g; c.fillRect(0, 0, W, H); c.restore();
      c.strokeStyle = "rgba(24,33,47,0.25)"; c.lineWidth = 2.5; c.setLineDash([10, 9]);
      c.beginPath(); c.moveTo(sx, py + 26); c.lineTo(sx, py + ph - 26); c.stroke(); c.setLineDash([]);
      // shrink a serif value until it (plus its unit) fits the given width
      var fit = function (text, size, maxW, unitW) {
        c.font = "600 " + size + "px " + SERIF;
        while (size > 20 && c.measureText(text).width + (unitW || 0) > maxW) { size -= 2; c.font = "600 " + size + "px " + SERIF; }
        return size;
      };
      var cell = function (label, value, unit, x, y, size, maxW) {
        c.fillStyle = C("ink-soft"); c.font = "400 25px " + SANS; c.fillText(label, x, y);
        c.font = "400 28px " + SANS;
        var uw = unit ? c.measureText(unit).width + 12 : 0;
        var base = size;
        size = fit(value, size, maxW, uw);
        c.fillStyle = C("ink");
        var by = y + base * 0.98;
        c.fillText(value, x, by);
        if (unit) { var vw = c.measureText(value).width; c.fillStyle = C("ink-soft"); c.font = "400 28px " + SANS; c.fillText(unit, x + vw + 10, by); }
      };
      cell("搭乗", String(st.n), "便", px + 52, py + 74, 112, 220);
      cell("飛行距離", fmtNum(st.km), "km", px + 300, py + 74, 112, sx - 40 - (px + 300));
      var row2 = py + 252;
      cell("空港", String(st.nAp), "", px + 52, row2, 58, 130);
      cell("機体", String(st.nReg), "機", px + 200, row2, 58, 160);
      cell("路線", String(rd.keys.length), "", px + 380, row2, 58, 120);
      var topReg = Object.keys(st.regs).sort(function (a, b) { return st.regs[b] - st.regs[a]; })[0];
      var lx = sx + 40;
      c.fillStyle = C("ink-soft"); c.font = "400 25px " + SANS; c.fillText("よく乗った機体", lx, py + 74);
      c.fillStyle = C("ink"); fit(topReg || "—", 52, stubW - 64); c.fillText(topReg || "—", lx, py + 138);
      if (topReg) { c.fillStyle = C("paper-accent"); c.font = "700 25px " + SANS; c.fillText(st.regs[topReg] + "回", lx, py + 176); }
      var longest = list.slice().sort(function (a, b) { return km(b.from, b.to) - km(a.from, a.to); })[0];
      c.fillStyle = C("ink-soft"); c.font = "400 25px " + SANS; c.fillText("最長区間", lx, row2);
      if (longest) {
        var lt = longest.from + " – " + longest.to;
        c.fillStyle = C("ink"); fit(lt, 40, stubW - 64); c.fillText(lt, lx, row2 + 50);
        c.fillStyle = C("paper-accent"); c.font = "700 25px " + SANS; c.fillText(fmtNum(km(longest.from, longest.to)) + " km", lx, row2 + 88);
      }
      // footer: most flown route
      var tr = rd.keys[0];
      if (tr) {
        var ab = tr.split("-");
        c.fillStyle = C("muted"); c.font = "400 26px " + SANS; c.textAlign = "center";
        c.fillText("いちばん飛んだ路線  " + apName(ab[0]) + " ⇄ " + apName(ab[1]) + "  " + rd.routes[tr] + "便", W / 2, 1300);
        c.textAlign = "left";
      }
      return cv;
    });
  }
  function shareRecap() {
    var cv = RECAP.canvas;
    if (!cv) return;
    var name = "搭乗記録-" + periodChip(RECAP.kind, RECAP.key).replace(/\s/g, "") + ".png";
    cv.toBlob(function (blob) {
      var file = null;
      try { file = new File([blob], name, { type: "image/png" }); } catch (e) { file = null; }
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file] }).catch(function () {});
        return;
      }
      try {
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
      } catch (e) { /* ignore */ }
      toast("保存できない場合は、画像を長押しして保存してください");
    }, "image/png");
  }

  /* ---------- window log ---------- */
  function lastConfigId() {
    var f = sorted().filter(function (x) { return x.config; })[0];
    return f ? f.config : "JL-738-V35";
  }
  function windowsHTML() {
    var cid = db.ui.windowsCfg || lastConfigId();
    var cfg = getConfig(cid) || CFG["JL-738-V35"];
    cid = cfg.id;
    var groups = {};
    D.CONFIGS.forEach(function (c) { (groups[c.fam] = groups[c.fam] || []).push(c); });
    var opts = Object.keys(groups).map(function (fam) {
      return '<optgroup label="' + esc(FAM_NAME[fam] || fam) + '">' + groups[fam].map(function (c) {
        return '<option value="' + c.id + '"' + (c.id === cid ? " selected" : "") + ">" + esc((FAM_NAME[c.fam] || "") + "　" + c.type + "　" + c.label) + "</option>";
      }).join("") + "</optgroup>";
    }).join("");
    var gens = Object.keys(db.windows).filter(function (k) { return k.indexOf("GEN:") === 0; });
    if (gens.length || cid.indexOf("GEN:") === 0) {
      if (gens.indexOf(cid) < 0 && cid.indexOf("GEN:") === 0) gens.push(cid);
      opts += '<optgroup label="汎用マップ">' + gens.map(function (k) {
        var g = getConfig(k);
        return '<option value="' + k + '"' + (k === cid ? " selected" : "") + ">" + esc(g ? g.label : k) + "</option>";
      }).join("") + "</optgroup>";
    }
    var m = db.windows[cid] || {};
    var pick = function (r) {
      return Object.keys(m).filter(function (s) { return m[s] === r; }).sort(function (a, b) { return parseInt(a, 10) - parseInt(b, 10) || (a < b ? -1 : 1); });
    };
    var g = pick("green"), y = pick("yellow");
    var winTotal = 0, rated = 0;
    cfg.cabins.forEach(function (c) {
      for (var r = c.from; r <= c.to; r++) {
        var lay = rowLayout(cfg, r);
        if (!lay) continue;
        var w = winLetters(lay);
        [w.L, w.R].forEach(function (L) { if (L) { winTotal++; if (ratingOf(cid, r + L) !== "unknown") rated++; } });
      }
    });
    var h = '<header class="top"><div><h1>窓位置</h1><p class="sub">窓側の席を、見え方ごとに色分けして記録します</p></div></header>';
    h += '<div class="card"><label class="field" style="margin:0"><span>機材と座席仕様</span><select class="input" id="wcfg">' + opts + "</select></label>" +
      (cfg.src === "approx" ? '<p class="note" style="margin:10px 0 0">この座席表は代表的な配置の目安です。</p>' : "") + "</div>";
    h += '<div class="card"><h3>次に狙う席</h3>' +
      (g.length || y.length
        ? '<div class="chips">' + g.map(function (s) { return '<span class="chip on">' + s + "</span>"; }).join("") +
          y.map(function (s) { return '<span class="chip">' + s + "<small>ほぼ</small></span>"; }).join("") + "</div>"
        : '<p class="note" style="margin:0">真横・ほぼ真横と判定した席がここに並びます。</p>') +
      '<p class="note" style="margin:12px 0 0">窓側 ' + winTotal + " 席のうち " + rated + " 席を判定済み</p></div>";
    h += '<div class="legend" style="margin:4px 4px 12px">' +
      '<span><i class="sq green"></i>真横</span><span><i class="sq yellow"></i>ほぼ真横</span>' +
      '<span><i class="sq red"></i>見にくい</span><span><i class="sq black"></i>窓なし</span>' +
      '<span><i class="sq"></i>未判定</span></div>';
    h += '<p class="note" style="color:var(--muted);font-size:12.5px;margin:0 4px 8px">窓側の席をタップするたびに 未判定、真横、ほぼ真横、見にくい、窓なし の順で切り替わります。</p>';
    h += '<div class="cabin-wrap" id="wcabin">' + cabinHTML(cfg, { mode: "rate" }) + "</div>";
    h += '<div class="card"><h3>コードで受け渡し</h3><p class="note">前の窓位置ログで書き出した <span class="num">v1|g=…</span> の1行や JSON を貼り付けると、選択中の機材に読み込みます。</p>' +
      '<textarea class="input" id="wio" spellcheck="false" placeholder="v1|g=10K|r=11A,11K"></textarea>' +
      '<div class="btns"><button type="button" class="btn line" data-act="w-export">書き出す</button>' +
      '<button type="button" class="btn gold" data-act="w-import">読み込む</button></div></div>';
    return h;
  }
  function windowsCode(cid) {
    var m = db.windows[cid] || {}, out = { g: [], y: [], r: [], b: [] };
    var key = { green: "g", yellow: "y", red: "r", black: "b" };
    Object.keys(m).forEach(function (s) { if (key[m[s]]) out[key[m[s]]].push(s); });
    return "v1" + ["g", "y", "r", "b"].filter(function (k) { return out[k].length; })
      .map(function (k) { return "|" + k + "=" + out[k].join(","); }).join("");
  }
  function parseWindows(text) {
    text = String(text || "").trim();
    var map = {};
    if (text.charAt(0) === "{") {
      var o = JSON.parse(text);
      if (o.state && typeof o.state === "object") o = o.state;
      Object.keys(o).forEach(function (s) {
        var v = String(o[s]).toLowerCase();
        if (/^\d{1,2}[A-Z]$/i.test(s) && ORDER.indexOf(v) >= 0) map[s.toUpperCase()] = v;
      });
      return map;
    }
    if (!/^v1\|/.test(text)) throw new Error("format");
    var key = { g: "green", y: "yellow", r: "red", b: "black", k: "black", x: "black", n: "black" };
    text.split("|").slice(1).forEach(function (seg) {
      var p = seg.split("="), r = key[p[0]];
      if (!r || !p[1]) return;
      p[1].split(",").forEach(function (s) { s = s.trim().toUpperCase(); if (/^\d{1,2}[A-Z]$/.test(s)) map[s] = r; });
    });
    return map;
  }

  /* ---------- settings ---------- */
  function settingsHTML() {
    var s = syncState(), st = db.settings;
    var detail = !st.gasUrl ? "シートのURLと合言葉を入れると、記録するたびに自動で追記されます。"
      : db.lastError ? "前回の送信に失敗しました: " + db.lastError
      : db.lastSync ? "最終同期 " + new Date(db.lastSync).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
      : "まだ送信していません。";
    var h = '<header class="top"><div><h1>設定</h1></div></header>';
    h += '<div class="card"><h3>スプレッドシート同期</h3>' +
      '<div class="status-line ' + s.cls + '"><i></i><span>' + esc(s.text) + "</span></div>" +
      '<p class="note">' + esc(detail) + "</p>" +
      '<label class="field"><span>Apps Script のウェブアプリURL</span><input class="input" id="gasUrl" type="url" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://script.google.com/macros/s/…/exec" value="' + esc(st.gasUrl) + '"></label>' +
      '<label class="field"><span>合言葉（Code.gs の TOKEN と同じもの）</span><input class="input" id="gasToken" autocomplete="off" autocapitalize="off" spellcheck="false" value="' + esc(st.token) + '"></label>' +
      '<div class="btns one"><button type="button" class="btn gold" data-act="gas-save">保存して接続を確認</button></div>' +
      '<div class="btns"><button type="button" class="btn line" data-act="gas-flush"' + (st.gasUrl ? "" : " disabled") + '>今すぐ送信</button>' +
      '<button type="button" class="btn line" data-act="gas-pull"' + (st.gasUrl ? "" : " disabled") + ">シートから受信</button></div>" +
      '<div class="btns one"><button type="button" class="btn quiet" data-act="gas-all"' + (st.gasUrl ? "" : " disabled") + ">全件をシートに送り直す</button></div></div>";
    h += '<div class="card"><h3>スプレッドシートから取り込む</h3>' +
      '<p class="note">シートで記録の範囲を選んでコピーし、ここに貼り付けてください。見出しの行（日付、出発、到着など）も一緒にコピーすると列を確実に読み取れます。CSVファイルも使えます。すでにある記録は重複しません。</p>' +
      '<textarea class="input" id="impText" spellcheck="false" autocomplete="off" placeholder="日付　出発　到着　路線　機材　機体記号　備考"></textarea>' +
      '<div class="btns"><button type="button" class="btn line" data-act="imp-file">CSVを選ぶ</button>' +
      '<button type="button" class="btn gold" data-act="imp-check">内容を確認</button></div></div>';
    h += '<div class="card"><h3>デザイン</h3><p class="note">画面と券の色合いを切り替えます。振り返りカードの画像も同じ色合いになります。</p>' +
      '<div class="themes">' + THEMES.map(themeTileHTML).join("") + "</div></div>";
    h += '<div class="card"><h3>表示</h3><div class="toggle"><div><b>起動アニメーション</b><small>アプリを開いたときに離陸の演出を流します。画面をタップすると飛ばせます。</small></div>' +
      '<button type="button" class="switch' + (db.ui.intro !== false ? " on" : "") + '" data-act="toggle-intro" aria-label="起動アニメーション" aria-pressed="' + (db.ui.intro !== false) + '"><i></i></button></div>' +
      '<div class="btns one"><button type="button" class="btn line" data-act="play-intro">いま再生する</button></div></div>';
    h += '<div class="card"><h3>バックアップ</h3><p class="note">記録と窓位置をまとめて1つのファイルに書き出します。機種変更のときもこれで移せます。</p>' +
      '<div class="btns"><button type="button" class="btn line" data-act="backup-out">書き出す</button>' +
      '<button type="button" class="btn line" data-act="backup-in">復元する</button></div>' +
      '<div class="btns one"><button type="button" class="btn quiet" data-act="csv-out">CSVで書き出す</button></div></div>';
    h += '<div class="card"><h3>データ</h3><p class="note">端末に ' + db.flights.length + " 便の記録があります。" +
      (storageOk ? "" : "いまは端末に保存できない状態です。") + "</p>" +
      '<div class="btns one"><button type="button" class="btn danger" data-act="wipe">記録をすべて消す</button></div></div>';
    h += '<p class="foot-note">搭乗記録 ' + VERSION + "</p>";
    return h;
  }

  /* ---------- design themes ---------- */
  // 色の中身は index.html の [data-theme] にある。meta は iPhone 以外のブラウザの上端の色
  var THEMES = [
    { id: "night", name: "夜の機内", desc: "紺と真鍮", meta: "#0C1626" },
    { id: "dawn", name: "朝の空", desc: "明るい空色", meta: "#3B7BB8" },
    { id: "dusk", name: "夕焼け", desc: "茜色と紫", meta: "#1C1127" },
    { id: "classic", name: "クラシック", desc: "昔の紙の航空券", meta: "#6E2530" }
  ];
  var THEME = {};
  THEMES.forEach(function (t) { THEME[t.id] = t; });
  function themeId() { return THEME[db.ui.theme] ? db.ui.theme : "night"; }
  function applyTheme(id) {
    document.documentElement.setAttribute("data-theme", id);
    var m = $('meta[name="theme-color"]');
    if (m) m.setAttribute("content", THEME[id].meta);
  }
  function themeTileHTML(t) {
    var on = themeId() === t.id;
    return '<button type="button" class="theme' + (on ? " on" : "") + '" data-theme="' + t.id + '" data-act="pick-theme" data-id="' + t.id + '" aria-pressed="' + on + '">' +
      '<div class="mini"><span>HND' + PLANE + "ITM</span><span>12K</span></div>" +
      "<b>" + esc(t.name) + "</b><small>" + esc(t.desc) + "</small>" +
      '<i class="ck"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></i></button>';
  }
  function pickTheme(id) {
    if (!THEME[id] || id === themeId()) return;
    db.ui.theme = id;
    save();
    var swap = function () {
      applyTheme(id);
      $$(".theme[data-act='pick-theme']").forEach(function (b) {
        var on = b.dataset.id === id;
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", String(on));
      });
    };
    if (!REDUCE && document.startViewTransition) document.startViewTransition(swap);
    else swap();
  }
  // recap card (canvas) reads the same colors as the screen
  function themeColors() {
    var cs = getComputedStyle(document.documentElement);
    return function (name, alpha) {
      var v = cs.getPropertyValue("--" + name).trim();
      return alpha == null ? v : "rgba(" + v + "," + alpha + ")";
    };
  }

  /* ---------- sync ---------- */
  var syncing = false;
  function enqueue(op, id) {
    db.outbox = db.outbox.filter(function (o) { return o.id !== id; });
    db.outbox.push({ op: op, id: id, at: Date.now() + Math.random() });
  }
  function rowOf(f) {
    var cfg = getConfig(f.config), info = seatInfo(cfg, f.seat);
    return {
      id: f.id, date: f.date.replace(/-/g, "/"), from: f.from, to: f.to, route: f.from + " → " + f.to,
      airline: AL[f.airline] ? AL[f.airline].name : f.airline || "", airlineCode: f.airline || "",
      type: f.type || "", reg: f.reg || "", seat: f.seat || "",
      window: info && info.window ? RLABEL[f.window || ratingOf(f.config, f.seat)] : "",
      flightNo: f.flightNo ? (f.airline || "") + f.flightNo : "", note: f.note || ""
    };
  }
  function gas(method, payload) {
    var url = db.settings.gasUrl;
    if (method === "GET") {
      var q = Object.keys(payload).map(function (k) { return k + "=" + encodeURIComponent(payload[k]); }).join("&");
      return fetch(url + (url.indexOf("?") < 0 ? "?" : "&") + q).then(readJSON);
    }
    return fetch(url, { method: "POST", body: JSON.stringify(payload) }).then(readJSON);
  }
  function readJSON(res) {
    return res.text().then(function (t) {
      var j;
      try { j = JSON.parse(t); } catch (e) { throw new Error("シートから想定外の応答（URLかデプロイ設定を確認）"); }
      if (!j.ok) throw new Error(j.error || "シート側でエラー");
      return j;
    });
  }
  function flush() {
    if (!db.settings.gasUrl || syncing || !db.outbox.length) return Promise.resolve();
    if (navigator.onLine === false) return Promise.resolve();
    syncing = true; refreshPills();
    var batch = db.outbox.slice(0, 40), ops = [];
    batch.forEach(function (o) {
      if (o.op === "delete") ops.push({ op: "delete", id: o.id });
      else {
        var f = db.flights.filter(function (x) { return x.id === o.id; })[0];
        if (f) ops.push({ op: "upsert", row: rowOf(f) });
      }
    });
    return gas("POST", { token: db.settings.token, ops: ops }).then(function () {
      var sent = batch.map(function (o) { return o.at; });
      db.outbox = db.outbox.filter(function (o) { return sent.indexOf(o.at) < 0; });
      db.lastSync = Date.now(); db.lastError = ""; save();
    }, function (e) {
      db.lastError = (e && e.message) || String(e); save();
    }).then(function () {
      syncing = false; refreshPills();
      if (view === "settings") render();
      if (!db.lastError && db.outbox.length) return flush();
    });
  }
  function pull() {
    toast("シートを読み込んでいます");
    return gas("GET", { action: "list", token: db.settings.token }).then(function (j) {
      var added = 0;
      (j.rows || []).forEach(function (r) {
        var date = normDate(r.date), from = String(r.from || "").toUpperCase().trim(), to = String(r.to || "").toUpperCase().trim();
        if (!date || !from || !to) return;
        var reg = String(r.reg || "").toUpperCase().trim();
        if (reg === "不明") reg = "";
        if (r.id && db.flights.some(function (f) { return f.id === r.id; })) return;
        var dup = db.flights.some(function (f) { return f.date === date && f.from === from && f.to === to && (f.reg || "") === reg; });
        if (dup) return;
        var code = r.airlineCode && AL[r.airlineCode] ? r.airlineCode : guessAirline(r.airline);
        var now = Date.now() + added;
        var f = {
          id: r.id || uid(), date: date, airline: code, from: from, to: to, type: String(r.type || ""), config: null,
          seat: String(r.seat || "").toUpperCase(), reg: reg, flightNo: String(r.flightNo || "").toUpperCase().replace(/^([A-Z]{2}|[A-Z]\d|\d[A-Z])(?=\d)/, ""),
          note: String(r.note || ""), window: "", createdAt: now, updatedAt: now
        };
        db.flights.push(f);
        if (!r.id) enqueue("upsert", f.id);
        added++;
      });
      save(); render();
      toast(added ? added + "便を取り込みました" : "新しい記録はありませんでした");
      flush();
    }, function (e) { toast(e.message); });
  }
  function guessAirline(name) {
    name = String(name || "").trim();
    if (!name) return "";
    if (AL[name.toUpperCase()]) return name.toUpperCase();
    for (var i = 0; i < D.AIRLINES.length; i++) {
      var a = D.AIRLINES[i];
      if (a.name === name || a.en.toLowerCase() === name.toLowerCase()) return a.code;
    }
    if (/^JAL|日本航空/.test(name)) return "JL";
    if (/^ANA|全日/.test(name)) return "NH";
    return "";
  }

  /* ---------- import from pasted sheet range / CSV ---------- */
  var IMP = null;
  var HEAD = {
    date: ["日付", "搭乗日", "年月日", "date"], from: ["出発", "出発地", "出発空港", "from"], to: ["到着", "到着地", "到着空港", "to"],
    route: ["路線", "区間", "route"], type: ["機材", "型式", "機種", "aircraft"], reg: ["機体記号", "機番", "レジ", "登録記号", "registration"],
    note: ["備考", "メモ", "note"], airline: ["航空会社", "会社", "airline"], seat: ["座席", "seat"], flightNo: ["便名", "flight"], id: ["id"]
  };
  function splitTable(text) {
    text = String(text || "").replace(/^\ufeff/, "").replace(/\r\n?/g, "\n");
    var first = text.split("\n")[0] || "", delim = first.indexOf("\t") >= 0 ? "\t" : ",";
    var rows = [], row = [], cell = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text.charAt(i);
      if (q) {
        if (c === '"') { if (text.charAt(i + 1) === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"' && cell === "") q = true;
      else if (c === delim) { row.push(cell); cell = ""; }
      else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += c;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows.map(function (r) { return r.map(function (x) { return x.trim(); }); })
      .filter(function (r) { return r.some(function (x) { return x; }); });
  }
  function headKey(cell) {
    var c = norm(cell);
    for (var k in HEAD) if (HEAD[k].some(function (h) { return norm(h) === c; })) return k;
    return null;
  }
  function resolveAp(v) {
    v = String(v || "").trim();
    if (!v) return "";
    var u = v.toUpperCase(), i, a;
    if (AP[u]) return u;
    for (i = 0; i < D.AIRPORTS.length; i++) if (D.AIRPORTS[i].icao === u) return D.AIRPORTS[i].iata;
    var n = norm(v.replace(/(国際)?空港$/, ""));
    for (i = 0; i < D.AIRPORTS.length; i++) {
      a = D.AIRPORTS[i];
      if (a._n === n || a._w.indexOf(n) >= 0) return a.iata;
    }
    if (/羽田|東京国際/.test(v)) return "HND";
    if (/成田/.test(v)) return "NRT";
    if (/伊丹|大阪国際/.test(v)) return "ITM";
    if (/千歳/.test(v)) return "CTS";
    if (/那覇|沖縄/.test(v)) return "OKA";
    if (/セントレア|中部/.test(v)) return "NGO";
    return /^[A-Z]{3}$/.test(u) ? u : "";
  }
  function parseImport(text) {
    var rows = splitTable(text), map = null, start = 0, r;
    for (r = 0; r < Math.min(rows.length, 5); r++) {
      var m = {}, hits = 0;
      rows[r].forEach(function (c, i) { var k = headKey(c); if (k && m[k] == null) { m[k] = i; hits++; } });
      if (hits >= 2) { map = m; start = r + 1; break; }
    }
    if (!map) {
      // 見出しなし: 日付の列を探し、元のシートと同じ並び（日付 出発 到着 [路線] 機材 機体記号 備考）とみなす
      var probe = rows[0] || [], di = probe.findIndex(function (c) { return !!normDate(c); });
      if (di < 0) return { items: [], bad: rows.length };
      var routeLike = /[→>\-]/.test(probe[di + 3] || "");
      map = { date: di, from: di + 1, to: di + 2 };
      var o = di + (routeLike ? 4 : 3);
      if (routeLike) map.route = di + 3;
      map.type = o; map.reg = o + 1; map.note = o + 2;
    }
    var items = [], bad = 0;
    rows.slice(start).forEach(function (row) {
      var g = function (k) { return map[k] != null ? (row[map[k]] || "") : ""; };
      var date = normDate(g("date")), from = resolveAp(g("from")), to = resolveAp(g("to"));
      if ((!from || !to) && g("route")) {
        var p = g("route").split(/\s*(?:→|->|⇒|＞|>|–|-|〜|~)\s*/);
        if (p.length >= 2) { from = from || resolveAp(p[0]); to = to || resolveAp(p[p.length - 1]); }
      }
      if (!date || !from || !to || from === to) { bad++; return; }
      var reg = g("reg").toUpperCase().replace(/\s/g, "");
      if (reg === "不明" || /^[-—–]$/.test(reg)) reg = "";
      items.push({
        id: g("id"), date: date, from: from, to: to, type: g("type"), reg: reg, note: g("note"),
        airline: g("airline") ? guessAirline(g("airline")) : "", seat: g("seat").toUpperCase(),
        flightNo: g("flightNo").toUpperCase().replace(/\s/g, "").replace(/^([A-Z]{2}|\d[A-Z]|[A-Z]\d)(?=\d)/, "")
      });
    });
    return { items: items, bad: bad };
  }
  function keyOf(f) { return f.date + "|" + f.from + "|" + f.to + "|" + (f.reg || ""); }
  function prepareImport(text) {
    var res = parseImport(text);
    if (!res.items.length) {
      toast(res.bad ? "日付と区間を読み取れませんでした。見出しの行も一緒に貼り付けてください" : "貼り付けた内容が空です");
      return;
    }
    var have = {}, ids = {}, seen = {}, fresh = [], all = [], dup = 0;
    db.flights.forEach(function (f) { have[keyOf(f)] = 1; ids[f.id] = 1; });
    res.items.forEach(function (it) {
      var k = keyOf(it);
      if (seen[k]) return;
      seen[k] = 1; all.push(it);
      if (have[k] || (it.id && ids[it.id])) dup++; else fresh.push(it);
    });
    IMP = { fresh: fresh, all: all, dup: dup, bad: res.bad, airline: "JL", mode: "add" };
    openImportSheet(true);
  }
  function openImportSheet(first) {
    var I = IMP, list = I.mode === "add" ? I.fresh : I.all, n = list.length;
    var needAl = list.some(function (x) { return !x.airline; });
    var h = '<h3 class="sheet-h">取り込む内容の確認</h3>' +
      '<div class="kpis three"><div class="kpi"><b class="num">' + I.fresh.length + "<small>便</small></b><span>新しい記録</span></div>" +
      '<div class="kpi"><b class="num">' + I.dup + "<small>便</small></b><span>すでにある記録</span></div>" +
      '<div class="kpi"><b class="num">' + I.bad + "<small>行</small></b><span>読めなかった行</span></div></div>" +
      '<div class="field"><span>取り込み方</span><div class="chips">' +
      '<button type="button" class="chip' + (I.mode === "add" ? " on" : "") + '" data-act="imp-mode" data-m="add">新しい記録だけ追加</button>' +
      '<button type="button" class="chip' + (I.mode === "replace" ? " on" : "") + '" data-act="imp-mode" data-m="replace">端末の記録と入れ替える</button></div></div>';
    if (needAl && n) {
      h += '<div class="field"><span>航空会社が空欄の行は</span><div class="chips">' + D.AIRLINES.filter(function (a) { return a.major; }).map(function (a) {
        return '<button type="button" class="chip' + (I.airline === a.code ? " on" : "") + '" data-act="imp-al" data-code="' + a.code + '">' + esc(a.name) + "</button>";
      }).join("") + "</div></div>";
    }
    if (n) {
      h += '<div class="imp-list">' + list.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 60).map(function (x) {
        return '<div class="imp-row"><span>' + dots(x.date) + "</span><b>" + esc(x.from) + " → " + esc(x.to) + "</b><em>" + esc(x.reg || "") + "</em></div>";
      }).join("") + "</div>" + (n > 60 ? '<p class="note" style="margin:8px 2px 0">ほか ' + (n - 60) + " 便</p>" : "");
    } else {
      h += '<p class="note" style="color:var(--muted)">新しく追加する記録はありません。シートの内容はすべて端末に入っています。</p>';
    }
    if (I.mode === "replace") h += '<p class="note" style="color:var(--muted);margin:12px 2px 0">端末の ' + db.flights.length + " 便は消え、貼り付けた " + n + " 便に入れ替わります。窓位置の記録はそのまま残ります。</p>";
    h += '<div class="btns" style="margin-top:16px"><button type="button" class="btn line" data-act="sheet-close">やめる</button>' +
      '<button type="button" class="btn gold" data-act="imp-run"' + (n ? "" : " disabled") + ">" + (I.mode === "add" ? n + "便を追加" : n + "便で入れ替え") + "</button></div>";
    if (first) openSheet(h);
    else { $("#sheetIn").innerHTML = '<div class="grab"></div>' + h; }
  }
  function runImport() {
    var I = IMP, now = Date.now(), list = I.mode === "add" ? I.fresh : I.all;
    var made = list.map(function (x, i) {
      return {
        id: x.id || uid(), date: x.date, airline: x.airline || I.airline, from: x.from, to: x.to, type: x.type || "",
        config: null, seat: x.seat || "", reg: x.reg || "", flightNo: x.flightNo || "", note: x.note || "", window: "",
        createdAt: now + i, updatedAt: now + i
      };
    });
    db.flights = I.mode === "add" ? db.flights.concat(made) : made;
    if (db.settings.gasUrl) made.forEach(function (f) { enqueue("upsert", f.id); });
    save();
    var msg = I.mode === "add" ? made.length + "便を追加しました" : made.length + "便で入れ替えました";
    IMP = null;
    closeSheet();
    setTimeout(function () { go("home"); toast(msg); flush(); setTimeout(checkBadges, 1800); }, 500);
  }
  function readTextFile(file, cb) {
    var rd = new FileReader();
    rd.onload = function () {
      var t = String(rd.result || "");
      if (t.indexOf("\ufffd") >= 0) {
        var r2 = new FileReader();
        r2.onload = function () { cb(String(r2.result || "")); };
        r2.readAsText(file, "shift_jis");
      } else cb(t);
    };
    rd.readAsText(file);
  }

  /* ---------- files ---------- */
  function shareFile(name, text, type) {
    var blob = new Blob([text], { type: type });
    var file;
    try { file = new File([blob], name, { type: type }); } catch (e) { file = null; }
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file] }).catch(function () {});
      return;
    }
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  function csv() {
    var head = ["日付", "出発", "到着", "路線", "航空会社", "機材", "機体記号", "座席", "便名", "備考"];
    var rows = sorted().reverse().map(function (f) {
      var r = rowOf(f);
      return [r.date, r.from, r.to, r.route, r.airline, r.type, r.reg || "不明", r.seat, r.flightNo, r.note];
    });
    return "\ufeff" + [head].concat(rows).map(function (r) {
      return r.map(function (v) { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(",");
    }).join("\r\n");
  }

  /* ---------- flow ---------- */
  var F = null;
  var flowEl = $("#flow");

  function openFlow(existing) {
    F = {
      step: 0, max: existing ? STEPS.length - 1 : 0, shown: null, busy: false, det: null, auto: false,
      manualType: !!(existing && existing.type),
      editing: !!existing, slot: "from", q: "", showGen: false,
      gen: { name: "", preset: "3-3", rows: 30 },
      d: existing ? JSON.parse(JSON.stringify(existing)) : {
        id: null, date: todayISO(), airline: "", from: "", to: "", type: "", config: null,
        seat: "", reg: "", flightNo: "", note: ""
      }
    };
    if (existing) {
      F.det = detectAircraft(F.d.reg, F.d.airline, F.d.id);
      // 座席仕様が未登録の過去記録は、機体記号から仕様だけ補う
      if (!F.d.config && F.det && F.det.config && typeKey(F.det.type) === typeKey(F.d.type)) F.d.config = F.det.config;
    }
    if (existing && !existing.from) F.slot = "from";
    else if (existing) F.slot = "to";
    $("#flowTicket").classList.remove("lift");
    $("#flowBody").classList.remove("dim");
    renderFlow("none");
    retrigger($("#flowBody"), "fwd");
    app.style.transformOrigin = "50% " + Math.round(window.scrollY + window.innerHeight * 0.45) + "px";
    flowEl.classList.add("open");
    flowEl.setAttribute("aria-hidden", "false");
    document.body.classList.add("flow-open");
    document.body.style.overflow = "hidden";
  }
  function closeFlow() {
    flowEl.classList.remove("open");
    flowEl.setAttribute("aria-hidden", "true");
    document.body.classList.remove("flow-open");
    document.body.style.overflow = "";
    $("#fab").classList.toggle("hide", view !== "home");
    F = null;
  }
  function stepValid(k) {
    var d = F.d;
    if (k === "date") return !!d.date;
    if (k === "airline") return !!d.airline;
    if (k === "route") return !!(d.from && d.to && d.from !== d.to);
    if (k === "aircraft") return !!d.type;
    return true;
  }
  function canNext() { return stepValid(STEPS[F.step].key); }
  function applyDetection() {
    var d = F.d, det = detectAircraft(d.reg, d.airline, d.id);
    F.det = det;
    if (F.manualType) return;
    if (det) {
      if (d.config !== det.config) d.seat = "";
      d.type = det.type; d.config = det.config; F.auto = true;
    } else if (F.auto) {
      d.type = ""; d.config = null; d.seat = ""; F.auto = false;
    }
  }
  var TFIELDS = ["airline", "from", "to", "date", "type", "flightNo", "seat", "reg"];
  var FLAPPY = { from: 1, to: 1, seat: 1, reg: 1, flightNo: 1 };
  // quiet: update without animating (while typing)
  function renderTicket(quiet) {
    var k = STEPS[F.step].key, box = $("#flowTicket"), d = F.d;
    box.innerHTML = ticketHTML(d, { live: true, now: k === "confirm" ? "" : k });
    var cur = {};
    TFIELDS.forEach(function (f) {
      cur[f] = f === "date" ? dots(d.date) : f === "flightNo" ? (d.flightNo ? (d.airline || "") + d.flightNo : "")
        : f === "airline" ? (AL[d.airline] ? AL[d.airline].name : "") : d[f] || "";
    });
    if (F.shown && quiet !== true) {
      TFIELDS.forEach(function (f) {
        if (!cur[f] || cur[f] === F.shown[f]) return;
        if (Array.isArray(quiet) && quiet.indexOf(f) >= 0) return;
        var el = box.querySelector('[data-f="' + f + '"]');
        if (!el) return;
        if (FLAPPY[f]) scramble(el, cur[f]); else retrigger(el, "flipin");
      });
    }
    F.shown = cur;
  }
  function renderFoot() {
    var last = F.step === STEPS.length - 1;
    var next = $("#flowNext");
    next.textContent = last ? (F.editing ? "変更を保存" : "記録する") : "次へ";
    next.disabled = !canNext();
    $("#flowBack").disabled = F.step === 0;
  }
  function renderFlow(dir, keepScroll) {
    var body = $("#flowBody");
    var top = body.scrollTop;
    var st = STEPS[F.step];
    $("#flowSteps").innerHTML = STEPS.map(function (s, i) {
      return "<i class=\"" + (i === F.step ? "now" : i < F.step || i <= F.max ? "done" : "") + "\"></i>";
    }).join("");
    var cnt = $("#flowCount");
    if (F.editing && F.step < STEPS.length - 1) cnt.innerHTML = '<button type="button" class="tocf" data-act="to-confirm">確認へ</button>';
    else cnt.textContent = (F.step + 1) + " / " + STEPS.length;
    renderTicket();
    var hint = st.hint;
    if (st.key === "aircraft" && AL[F.d.airline]) hint = AL[F.d.airline].name;
    if (st.key === "reg" && F.d.type) hint = F.d.type;
    $("#flowTitle").innerHTML = esc(st.title) + (hint ? "<small>" + esc(hint) + "</small>" : "");
    body.classList.remove("fwd", "back");
    body.innerHTML = stepHTML(st.key);
    stagger(body, 12);
    if (dir === "fwd" || dir === "back") {
      void body.offsetWidth; body.classList.add(dir);
      retrigger($("#flowTitle"), "tin");
    }
    body.scrollTop = keepScroll ? top : 0;
    renderFoot();
    afterStep(st.key, dir);
  }
  function goStep(i) {
    if (!F || i < 0 || i >= STEPS.length || i === F.step || F.busy) return;
    var dir = i > F.step ? "fwd" : "back", body = $("#flowBody");
    if (document.activeElement && document.activeElement !== document.body && document.activeElement.blur) document.activeElement.blur();
    F.busy = true;
    body.classList.remove("fwd", "back");
    body.classList.add(dir === "fwd" ? "leave-f" : "leave-b");
    setTimeout(function () {
      if (!F) return;
      body.classList.remove("leave-f", "leave-b");
      F.busy = false;
      F.step = i; F.max = Math.max(F.max, i);
      renderFlow(dir);
    }, REDUCE ? 0 : 210);
  }
  function next() {
    if (!canNext()) return;
    if (F.step === STEPS.length - 1) return commit();
    goStep(F.step + 1);
  }
  function autoNext() {
    var at = F.step;
    renderFoot();
    setTimeout(function () { if (F && F.step === at && canNext()) next(); }, 460);
  }

  function stepHTML(k) {
    var d = F.d;
    if (k === "date") {
      var p = parts(d.date);
      var rel = d.date === todayISO() ? "、今日" : d.date === todayISO(1) ? "、昨日" : "";
      return '<div class="bigdate"><div class="d num">' + p.y + "<small>年</small>" + p.m + "<small>月</small>" + p.d + "<small>日</small></div>" +
        '<div class="w">' + p.w + "曜日" + rel + "</div></div>" +
        '<div class="chips" style="margin-top:14px">' + [["今日", 0], ["昨日", 1], ["一昨日", 2]].map(function (c) {
          return '<button type="button" class="chip' + (d.date === todayISO(c[1]) ? " on" : "") + '" data-act="date-q" data-off="' + c[1] + '">' + c[0] + "</button>";
        }).join("") + "</div>" +
        '<label class="datepick"><input type="date" id="dateIn" value="' + esc(d.date) + '" aria-label="日付を選ぶ"><span class="btn line">カレンダーから選ぶ</span></label>';
    }
    if (k === "airline") {
      var used = countBy(db.flights, function (f) { return f.airline; }).slice(0, 3).map(function (x) { return x[0]; }).filter(function (c) { return AL[c]; });
      var opt = function (a) {
        return '<button type="button" class="opt' + (d.airline === a.code ? " on" : "") + '" data-act="pick-airline" data-code="' + a.code + '" style="--al:' + a.color + '">' +
          "<i></i><div><b>" + esc(a.name) + "</b><small>" + esc(a.en) + '</small></div><span class="code">' + esc(a.code) + "</span></button>";
      };
      var h = "";
      if (used.length) h += '<div class="subhead">よく使う</div>' + used.map(function (c) { return opt(AL[c]); }).join("");
      h += '<div class="subhead">主要な航空会社</div>' + D.AIRLINES.filter(function (a) { return a.major && used.indexOf(a.code) < 0; }).map(opt).join("");
      h += '<div class="subhead">地域航空会社</div>' + D.AIRLINES.filter(function (a) { return !a.major && used.indexOf(a.code) < 0; }).map(opt).join("");
      return h;
    }
    if (k === "route") {
      var slot = function (key, label) {
        var c = d[key];
        return '<button type="button" class="slotbtn' + (F.slot === key ? " on" : "") + '" data-act="slot" data-slot="' + key + '">' +
          "<small>" + label + "</small><b class=\"" + (c ? "" : "blank") + "\">" + esc(c || "———") + "</b><span>" + esc(c ? apName(c) : "未選択") + "</span></button>";
      };
      return '<div class="route-pick">' + slot("from", "出発") +
        '<button type="button" class="swap" data-act="swap" aria-label="出発と到着を入れ替え">' + ICON_SWAP + "</button>" + slot("to", "到着") + "</div>" +
        '<div class="search">' + ICON_SEARCH + '<input class="input" id="apq" type="search" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="羽田、はねだ、HND、RJTT" value="' + esc(F.q) + '"></div>' +
        '<div id="aplist">' + apListHTML() + "</div>";
    }
    if (k === "aircraft") return aircraftHTML();
    if (k === "seat") return seatHTML();
    if (k === "reg") {
      var body = (d.reg || "").replace(/^JA/, "");
      var pool = db.flights.filter(function (f) { return f.id !== d.id && f.reg && (!d.airline || f.airline === d.airline); });
      var onRoute = countBy(pool.filter(function (f) { return (f.from === d.from && f.to === d.to) || (f.from === d.to && f.to === d.from); }), function (f) { return f.reg; });
      var sugg = onRoute.concat(countBy(pool, function (f) { return f.reg; }).filter(function (r) { return !onRoute.some(function (x) { return x[0] === r[0]; }); })).slice(0, 14);
      return '<label class="reg"><span>JA</span><input id="regIn" value="' + esc(body) + '" placeholder="———" maxlength="8" autocapitalize="characters" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="next" aria-label="機体記号"></label>' +
        '<div class="reg-status" id="regStatus">' + regStatus() + "</div>" +
        (sugg.length ? '<div class="subhead">' + (onRoute.length ? "この路線でよく乗る機体" : "よく乗る機体") + '</div><div class="chips" id="regChips">' + sugg.map(function (r) {
          return '<button type="button" class="chip' + (d.reg === r[0] ? " on" : "") + '" data-act="pick-reg" data-reg="' + esc(r[0]) + '">' + esc(r[0]) + "<small>" + r[1] + "回</small></button>";
        }).join("") + "</div>" : "") +
        '<div class="btns one" style="margin-top:16px"><button type="button" class="btn quiet" data-act="reg-clear">機体記号がわからない</button></div>';
    }
    if (k === "note") {
      return '<label class="field"><span>便名</span><div class="reg" style="margin:0"><span style="font-size:24px">' + esc(d.airline || "") + "</span>" +
        '<input id="fnoIn" style="font-size:24px" inputmode="numeric" value="' + esc(d.flightNo || "") + '" placeholder="———" maxlength="5" autocomplete="off" aria-label="便名"></div></label>' +
        '<label class="field"><span>備考</span><textarea class="input" id="noteIn" placeholder="天気や景色、機内のことなど">' + esc(d.note || "") + "</textarea></label>";
    }
    if (k === "confirm") return confirmHTML();
    return "";
  }
  function afterStep(k, dir) {
    if (k === "seat" && F.d.seat && dir !== "none-keep") {
      var el = $('#flowBody .seat.sel');
      if (el) setTimeout(function () { el.scrollIntoView({ block: "center", behavior: dir === "fwd" || dir === "back" ? "auto" : "smooth" }); }, 30);
    }
    if (k === "reg" && dir !== "keep") {
      var r = $("#regIn");
      if (r && !F.d.reg) setTimeout(function () { r.focus(); }, 380);
    }
  }

  function apListHTML() {
    var d = F.d, q = norm(F.q);
    var row = function (a) {
      return '<button type="button" class="ap" data-act="pick-ap" data-iata="' + a.iata + '"><b>' + a.iata + "</b><span>" + esc(a.name) + "</span><small>" + a.icao + "</small></button>";
    };
    var freq = apFreq();
    if (q) {
      var res = [];
      D.AIRPORTS.forEach(function (a) {
        var s = 99;
        if (a._i === q) s = 0;
        else if (a._c === q) s = 1;
        else if (a._i.indexOf(q) === 0) s = 2;
        else if (a._c.indexOf(q) === 0 || a._n.indexOf(q) === 0) s = 3;
        else if (a._w.some(function (w) { return w.indexOf(q) === 0; })) s = 4;
        else if (a._n.indexOf(q) >= 0 || a._w.some(function (w) { return w.indexOf(q) >= 0; })) s = 6;
        if (s < 99) res.push([s, -(freq[a.iata] || 0), a]);
      });
      res.sort(function (x, y) { return x[0] - y[0] || x[1] - y[1]; });
      if (!res.length) return '<p class="note" style="color:var(--muted);padding:12px 4px">該当する空港がありません。漢字、ひらがな、3文字または4文字のコードで探せます。</p>';
      return res.slice(0, 30).map(function (x) { return row(x[2]); }).join("");
    }
    var h = "";
    var last = sorted()[0];
    if (last && !d.from && !d.to && AP[last.to] && AP[last.from]) {
      h += '<div class="subhead">前回の続き</div><div class="chips"><button type="button" class="chip" data-act="route-set" data-from="' + last.to + '" data-to="' + last.from + '">' +
        esc(last.to) + " から " + esc(last.from) + "<small>" + esc(apName(last.to)) + "、" + esc(apName(last.from)) + "</small></button>" +
        '<button type="button" class="chip" data-act="route-set" data-from="' + last.from + '" data-to="' + last.to + '">' +
        esc(last.from) + " から " + esc(last.to) + "<small>前回と同じ</small></button></div>";
    }
    var top = Object.keys(freq).filter(function (c) { return AP[c]; }).sort(function (a, b) { return freq[b] - freq[a]; }).slice(0, 6);
    if (F.slot === "to" && d.from) {
      var dest = countBy(db.flights.filter(function (f) { return f.from === d.from; }), function (f) { return f.to; }).map(function (x) { return x[0]; });
      top = dest.concat(top.filter(function (c) { return dest.indexOf(c) < 0; })).filter(function (c) { return c !== d.from && AP[c]; }).slice(0, 6);
    }
    if (top.length) h += '<div class="subhead">よく使う空港</div>' + top.map(function (c) { return row(AP[c]); }).join("");
    h += '<div class="subhead">すべての空港（北から）</div>' + D.AIRPORTS.map(row).join("");
    return h;
  }

  function aircraftHTML() {
    var d = F.d, al = AL[d.airline];
    var fam = al ? al.fam : "";
    var list = D.CONFIGS.filter(function (c) { return c.fam === fam; });
    var lastSame = sorted().filter(function (f) { return f.airline === d.airline && f.config && f.id !== d.id; })[0];
    var color = al ? al.color : "var(--brass)";
    var opt = function (c, tag) {
      return '<button type="button" class="opt' + (d.config === c.id ? " on" : "") + '" data-act="pick-cfg" data-id="' + c.id + '" style="--al:' + color + '">' +
        "<i></i><div><b>" + esc(c.type) + (tag ? '<span class="tag gold">' + tag + "</span>" : "") + (c.src === "approx" ? '<span class="tag">目安</span>' : "") + "</b>" +
        "<small>" + esc(c.label) + "、" + c.seats + "席</small></div><span></span></button>";
    };
    var h = "";
    if (d.type && !d.config) {
      var same = sameType(d.type, d.airline);
      h += '<p class="note" style="color:var(--muted);margin:0 4px 10px">いまは「' + esc(d.type) + "」として記録されています。" +
        (same.length ? "座席表を出すには仕様を選んでください。" : "") + "</p>";
    }
    if (F.auto && d.config && CFG[d.config]) {
      h += '<div class="subhead">機体記号 ' + esc(d.reg) + " から判定</div>" + opt(CFG[d.config], "自動");
    } else if (F.det && F.det.config && CFG[F.det.config] && !d.config) {
      h += '<div class="subhead">機体記号 ' + esc(d.reg) + " からの候補</div>" + opt(CFG[F.det.config], "候補");
    } else if (lastSame && getConfig(lastSame.config) && CFG[lastSame.config] && CFG[lastSame.config].fam === fam) {
      h += '<div class="subhead">前回と同じ</div>' + opt(CFG[lastSame.config], "前回");
    }
    if (list.length) {
      h += '<div class="subhead">' + esc(FAM_NAME[fam] || "") + "の機材</div>" + list.map(function (c) { return opt(c); }).join("");
    }
    h += '<div class="subhead">一覧にない場合</div>';
    h += '<button type="button" class="opt' + (d.config && d.config.indexOf("GEN:") === 0 ? " on" : "") + '" data-act="gen-toggle"><i></i><div><b>その他の機材</b><small>機材名と座席の並びを指定して座席表を作ります</small></div><span></span></button>';
    if (F.showGen) {
      var g = F.gen;
      h += '<div class="card"><label class="field"><span>機材名</span><input class="input" id="genName" value="' + esc(g.name) + '" placeholder="例 B737-800" autocapitalize="characters" autocomplete="off"></label>' +
        '<div class="field"><span>座席の並び</span><div class="chips">' + Object.keys(D.GENERIC).map(function (p) {
          return '<button type="button" class="chip' + (g.preset === p ? " on" : "") + '" data-act="gen-preset" data-p="' + p + '">' + p + "</button>";
        }).join("") + "</div></div>" +
        '<label class="field"><span>列数</span><input class="input" id="genRows" type="number" inputmode="numeric" min="1" max="80" value="' + g.rows + '"></label>' +
        '<button type="button" class="btn gold block" data-act="gen-apply">この機材で決定</button></div>';
    }
    h += '<button type="button" class="opt" data-act="type-unknown"><i></i><div><b>機材がわからない</b><small>座席表なしで記録します</small></div><span></span></button>';
    return h;
  }

  function seatHTML() {
    var d = F.d, cfg = getConfig(d.config);
    var manual = '<label class="field" style="margin-top:4px"><span>座席番号を直接入力</span><div class="manual">' +
      '<input class="input" id="seatIn" value="' + esc(d.seat) + '" placeholder="例 12K" maxlength="4" autocapitalize="characters" autocomplete="off" spellcheck="false">' +
      '<button type="button" class="btn line" data-act="seat-clear">クリア</button></div></label>';
    if (!cfg) {
      var same = sameType(d.type, d.airline);
      var h = '<p class="note" style="color:var(--muted);margin:4px 4px 14px">' + (same.length
        ? "この記録には座席仕様が登録されていません。仕様を選ぶと座席表が出ます。"
        : "この機材には座席表がありません。座席番号だけ記録できます。") + "</p>";
      if (same.length) h += same.map(function (c) {
        return '<button type="button" class="opt" data-act="pick-cfg-stay" data-id="' + c.id + '" style="--al:' + alColor(d.airline) + '"><i></i><div><b>' +
          esc(c.type) + "</b><small>" + esc((FAM_NAME[c.fam] || "") + "、" + c.label) + "</small></div><span></span></button>";
      }).join("");
      return h + manual;
    }
    var info = seatInfo(cfg, d.seat);
    var desc = "";
    if (d.seat && info) {
      desc = [info.cabin, info.window ? "窓側（進行方向" + info.side + "）" : info.aisle ? "通路側" : "中央", info.exit ? "非常口" : "", info.noRecline ? "リクライニング不可" : ""]
        .filter(Boolean).join("、");
    } else if (d.seat) desc = "座席表にない番号です";
    else desc = "座席表から選ぶか、下で番号を入力";
    var head = '<div class="seat-head" id="seatHead"><div class="seat-now"><b class="' + (d.seat ? "" : "blank") + '">' + esc(d.seat || "未選択") + "</b><span>" + esc(desc) + "</span></div>";
    if (info && info.window) {
      var cur = ratingOf(cfg.id, d.seat);
      head += '<div class="rating">' + ["green", "yellow", "red", "black", "unknown"].map(function (r) {
        return '<button type="button" class="' + r + (cur === r ? " on" : "") + '" data-act="rate" data-r="' + r + '"><i></i>' + RLABEL[r] + "</button>";
      }).join("") + '</div><div class="rating-cap">窓の見え方。選ぶとこの機材の窓位置マップにも記録されます。</div>';
    }
    head += "</div>";
    return head +
      '<div class="legend" style="margin:0 2px 10px"><span><i class="green"></i>真横</span><span><i class="yellow"></i>ほぼ</span>' +
      '<span><i class="red"></i>見にくい</span><span><i class="black"></i>窓なし</span><span><i></i>未判定</span></div>' +
      '<div class="cabin-wrap">' + cabinHTML(cfg, { mode: "select", selected: d.seat }) + "</div>" + manual +
      (cfg.src === "approx" ? '<p class="note" style="color:var(--faint);font-size:12px;margin:2px 4px 0">この座席表は代表的な配置の目安です。実機と違うときは番号を直接入力してください。</p>' : "");
  }

  function sameType(type, airline) {
    if (!type) return [];
    var all = D.CONFIGS.filter(function (c) { return typeKey(c.type) === typeKey(type); });
    var fam = AL[airline] ? AL[airline].fam : "";
    var mine = all.filter(function (c) { return c.fam === fam; });
    return mine.length ? mine : all;
  }

  function regStatus() {
    var d = F.d;
    if (!d.reg) return "空欄のままなら「不明」として記録します。機材は次の画面で選べます。";
    var n = regTimes(d.reg, d.id);
    var s = n ? "この機体は <b class=\"num\">" + (n + 1) + "</b> 回目です。" : "はじめて乗る機体です。";
    var det = F.det;
    if (det && !F.manualType) s += "<br>機材は <b>" + esc(det.type) + "</b>" + (det.src === "history" ? "（前回の記録から）" : "（機体記号から推定）");
    else if (F.manualType && d.type) s += "<br>機材は " + esc(d.type) + "（選択済み）";
    else if (d.reg.length >= 5) s += "<br>機材は次の画面で選んでください。";
    return s;
  }

  function confirmHTML() {
    var d = F.d, cfg = getConfig(d.config), info = seatInfo(cfg, d.seat);
    var dist = km(d.from, d.to);
    var rows = [];
    rows.push(["区間", esc(apName(d.from)) + " から " + esc(apName(d.to)) + (dist ? "、約 " + fmtNum(dist) + " km" : "")]);
    if (d.seat) rows.push(["座席", esc(d.seat) + (info ? "、" + esc(info.cabin) + (info.window ? "、窓は" + RLABEL[ratingOf(cfg.id, d.seat)] : "") : "")]);
    rows.push(["機体", d.reg ? esc(d.reg) + "、" + (regTimes(d.reg, d.id) + 1) + "回目" : "不明"]);
    if (cfg) rows.push(["座席仕様", esc(cfg.label)]);
    if (d.note) rows.push(["備考", esc(d.note).replace(/\n/g, "<br>")]);
    return '<p class="note" style="color:var(--muted);margin:0 4px">券面の項目をタップすると、その画面に戻って直せます。</p>' +
      '<div class="summary">' + rows.map(function (r) { return "<div><span>" + r[0] + "</span><div>" + r[1] + "</div></div>"; }).join("") + "</div>";
  }

  function commit() {
    var d = F.d, now = Date.now();
    var cfg = getConfig(d.config), info = seatInfo(cfg, d.seat);
    var rec = {
      id: d.id || uid(), date: d.date, airline: d.airline, from: d.from, to: d.to, type: d.type,
      config: d.config || null, seat: d.seat || "", reg: d.reg || "", flightNo: d.flightNo || "",
      note: (d.note || "").trim(), window: info && info.window ? ratingOf(cfg.id, d.seat) : "",
      createdAt: d.createdAt || now, updatedAt: now
    };
    var i = db.flights.findIndex(function (f) { return f.id === rec.id; });
    if (i >= 0) db.flights[i] = rec; else db.flights.push(rec);
    enqueue("upsert", rec.id);
    save();
    var editing = F.editing;
    var t = $("#flowTicket .ticket");
    $("#flowNext").disabled = true;
    var reduce = REDUCE;
    if (t && !reduce) {
      t.classList.remove("live");
      $$("#flowTicket .slot.now").forEach(function (s) { s.classList.remove("now"); });
      $("#flowBody").classList.add("dim");
      t.classList.add("issued");
      setTimeout(function () { t.classList.add("torn"); }, 900);
      setTimeout(function () { $("#flowTicket").classList.add("lift"); }, 2150);
    }
    setTimeout(function () {
      closeFlow();
      go("home");
      var hero = $(".hero .ticket");
      if (hero && !reduce && sorted()[0] && sorted()[0].id === rec.id) retrigger(hero, "landed");
      var el = $('.fl[data-id="' + rec.id + '"]');
      if (el) {
        setTimeout(function () { el.classList.add("flash"); }, 500);
        if (el.getBoundingClientRect().top > window.innerHeight - 160) el.scrollIntoView({ block: "center" });
      }
      toast(editing ? "変更を保存しました" : "記録しました");
      flush();
      setTimeout(checkBadges, reduce ? 300 : 2200);
    }, reduce ? 200 : 2800);
  }

  /* ---------- detail sheet ---------- */
  function openSheet(html) {
    $("#sheetIn").innerHTML = '<div class="grab"></div>' + html;
    stagger($("#sheetIn"), 10);
    $("#sheet").classList.add("open"); $("#scrim").classList.add("open");
    $("#sheet").setAttribute("aria-hidden", "false");
    $("#sheet").scrollTop = 0;
  }
  function closeSheet() {
    $("#sheet").classList.remove("open"); $("#scrim").classList.remove("open");
    $("#sheet").setAttribute("aria-hidden", "true");
  }
  function openDetail(id) {
    var f = db.flights.filter(function (x) { return x.id === id; })[0];
    if (!f) return;
    var cfg = getConfig(f.config), info = seatInfo(cfg, f.seat), dist = km(f.from, f.to), n = regOrdinal(f);
    var rows = [];
    rows.push(["区間", esc(apName(f.from)) + " から " + esc(apName(f.to)) + (dist ? "、約 " + fmtNum(dist) + " km" : "")]);
    if (f.seat) rows.push(["座席", esc(f.seat) + (info ? "、" + esc(info.cabin) + (info.window ? "、窓は" + RLABEL[ratingOf(cfg.id, f.seat)] : "") : "")]);
    if (f.reg) rows.push(["機体", esc(f.reg) + "、" + n + "回目の搭乗"]);
    if (cfg) rows.push(["座席仕様", esc(cfg.label)]);
    if (f.note) rows.push(["備考", esc(f.note).replace(/\n/g, "<br>")]);
    openSheet(ticketHTML(f) + '<div class="summary">' + rows.map(function (r) { return "<div><span>" + r[0] + "</span><div>" + r[1] + "</div></div>"; }).join("") + "</div>" +
      '<div class="btns" style="margin-top:18px"><button type="button" class="btn danger" data-act="delete" data-id="' + f.id + '">削除</button>' +
      '<button type="button" class="btn gold" data-act="edit" data-id="' + f.id + '">編集</button></div>');
  }

  /* ---------- events ---------- */
  document.addEventListener("click", function (e) {
    var tab = e.target.closest("[data-tab]");
    if (tab) { go(tab.dataset.tab); return; }

    var seatBtn = e.target.closest("[data-seat]");
    if (seatBtn) { onSeat(seatBtn.dataset.seat, !!seatBtn.closest("#flow")); return; }

    var el = e.target.closest("[data-act]");
    if (!el) return;
    var act = el.dataset.act;
    switch (act) {
      case "new": openFlow(null); break;
      case "detail": openDetail(el.dataset.id); break;
      case "sheet-close": closeSheet(); break;
      case "edit": {
        var f = db.flights.filter(function (x) { return x.id === el.dataset.id; })[0];
        closeSheet();
        if (f) setTimeout(function () { openFlow(f); }, 520);
        break;
      }
      case "delete":
        if (confirm("この記録を削除しますか？")) {
          db.flights = db.flights.filter(function (x) { return x.id !== el.dataset.id; });
          enqueue("delete", el.dataset.id); save(); closeSheet(); render(); flush();
          toast("削除しました");
        }
        break;
      case "to-settings": go("settings"); break;
      case "stats-more": statsOpen[el.dataset.key] = !statsOpen[el.dataset.key]; render(); break;

      case "flow-close":
        if (!F.editing && (F.d.airline || F.d.from) && !confirm("入力中の内容を破棄しますか？")) break;
        closeFlow(); break;
      case "flow-back": if (F.step > 0) goStep(F.step - 1); break;
      case "flow-next": next(); break;
      case "to-confirm": {
        var bad = STEPS.findIndex(function (s) { return !stepValid(s.key); });
        if (bad >= 0) { toast(STEPS[bad].title + "を入れてください"); if (bad !== F.step) goStep(bad); break; }
        goStep(STEPS.length - 1);
        break;
      }
      case "imp-file": $("#csvIn").click(); break;
      case "recap": openRecap(); break;
      case "recap-kind":
        RECAP.kind = el.dataset.k; RECAP.key = recapPeriods(RECAP.kind)[0];
        $$("#recapKinds button").forEach(function (b) { b.classList.toggle("on", b === el); });
        $("#recapPeriods").innerHTML = recapPeriodsHTML();
        renderRecap();
        break;
      case "recap-key":
        RECAP.key = el.dataset.k;
        $$("#recapPeriods .chip").forEach(function (b) { b.classList.toggle("on", b === el); });
        renderRecap();
        break;
      case "recap-share": shareRecap(); break;
      case "map-mode":
        mapMode = el.dataset.m;
        $$("#mapSeg button").forEach(function (b) { b.classList.toggle("on", b === el); });
        $("#mapWrap").innerHTML = routeMapSVG(db.flights, mapMode);
        break;
      case "badge": openBadge(el.dataset.id); break;
      case "award-next": nextAward(); break;
      case "imp-check": prepareImport(($("#impText") || {}).value || ""); break;
      case "imp-mode": IMP.mode = el.dataset.m; openImportSheet(false); break;
      case "imp-al": IMP.airline = el.dataset.code; openImportSheet(false); break;
      case "imp-run": runImport(); break;
      case "toggle-intro": {
        db.ui.intro = db.ui.intro === false;
        save();
        el.classList.toggle("on", db.ui.intro);
        el.setAttribute("aria-pressed", String(db.ui.intro));
        break;
      }
      case "play-intro": playIntro(function () { go("home", { enter: true }); }); break;
      case "pick-theme": pickTheme(el.dataset.id); break;
      case "jump": {
        var idx = STEPS.findIndex(function (s) { return s.key === el.dataset.key; });
        if (idx >= 0 && idx !== F.step && (idx <= F.max || F.editing)) goStep(idx);
        break;
      }
      case "date-q": F.d.date = todayISO(+el.dataset.off); renderFlow("none"); break;
      case "pick-airline": {
        var prevFam = AL[F.d.airline] ? AL[F.d.airline].fam : null;
        F.d.airline = el.dataset.code;
        if (prevFam !== AL[F.d.airline].fam && F.d.config && F.d.config.indexOf("GEN:") !== 0) { F.d.config = null; F.d.type = ""; F.d.seat = ""; }
        $$("#flowBody .opt").forEach(function (o) { o.classList.toggle("on", o === el); });
        renderTicket(); autoNext(); break;
      }
      case "slot": F.slot = el.dataset.slot; renderFlow("none", true); var q = $("#apq"); if (q) q.focus(); break;
      case "swap": { var t = F.d.from; F.d.from = F.d.to; F.d.to = t; renderFlow("none", true); break; }
      case "route-set": F.d.from = el.dataset.from; F.d.to = el.dataset.to; F.q = ""; renderFlow("none"); autoNext(); break;
      case "pick-ap": {
        var c = el.dataset.iata, other = F.slot === "from" ? F.d.to : F.d.from;
        if (c === other) { toast("出発と到着が同じ空港です"); break; }
        F.d[F.slot] = c; F.q = "";
        if (F.slot === "from" && !F.d.to) F.slot = "to";
        else if (F.slot === "to" && !F.d.from) F.slot = "from";
        renderFlow("none");
        if (F.d.from && F.d.to) autoNext();
        break;
      }
      case "pick-cfg": case "pick-cfg-stay": {
        var cfg = CFG[el.dataset.id];
        if (F.d.config !== cfg.id) F.d.seat = "";
        F.d.config = cfg.id;
        if (act === "pick-cfg" || typeKey(F.d.type) !== typeKey(cfg.type)) F.d.type = cfg.type;
        F.manualType = !(F.auto && F.det && F.det.config === cfg.id); F.auto = !F.manualType;
        if (act === "pick-cfg") { $$("#flowBody .opt").forEach(function (o) { o.classList.toggle("on", o === el); }); renderTicket(); autoNext(); }
        else renderFlow("none");
        break;
      }
      case "gen-toggle": F.showGen = !F.showGen; renderFlow("none", true); break;
      case "gen-preset": F.gen.preset = el.dataset.p; readGen(); renderFlow("none", true); break;
      case "gen-apply": {
        readGen();
        var id = "GEN:" + F.gen.preset + ":" + F.gen.rows;
        if (F.d.config !== id) F.d.seat = "";
        F.d.config = id; F.d.type = F.gen.name || "不明"; F.manualType = true; F.auto = false;
        F.showGen = false; renderTicket(); next(); break;
      }
      case "type-unknown": F.d.type = "不明"; F.d.config = null; F.d.seat = ""; F.manualType = true; F.auto = false; renderTicket(); next(); break;
      case "rate": {
        setRating(F.d.config, F.d.seat, el.dataset.r);
        renderFlow("none-keep", true); break;
      }
      case "seat-clear": F.d.seat = ""; renderFlow("none-keep", true); break;
      case "pick-reg": F.d.reg = el.dataset.reg; applyDetection(); renderFlow("keep", true); break;
      case "reg-clear": F.d.reg = ""; applyDetection(); renderFlow("keep", true); break;
      case "type-auto": F.manualType = false; applyDetection(); renderFlow("keep", true); break;

      case "w-export": {
        var cid = currentWindowsCfg(), box = $("#wio");
        box.value = windowsCode(cid);
        box.select();
        if (navigator.clipboard) navigator.clipboard.writeText(box.value).then(function () { toast("コピーしました"); }, function () {});
        break;
      }
      case "w-import": {
        var cid2 = currentWindowsCfg();
        try {
          var map = parseWindows($("#wio").value);
          var n = Object.keys(map).length;
          if (!n) { toast("読み込める座席がありませんでした"); break; }
          if (!confirm(getConfig(cid2).type + " " + getConfig(cid2).label + " に " + n + " 席を読み込みます。既存の判定は上書きされます。")) break;
          db.windows[cid2] = map; save(); render(); toast(n + "席を読み込みました");
        } catch (err) { toast("この内容は読み込めませんでした"); }
        break;
      }

      case "gas-save": {
        db.settings.gasUrl = $("#gasUrl").value.trim();
        db.settings.token = $("#gasToken").value.trim();
        db.lastError = ""; save();
        if (!db.settings.gasUrl) { render(); toast("同期を解除しました"); break; }
        if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(db.settings.gasUrl)) { toast("Apps Script の /exec で終わるURLを入れてください"); break; }
        toast("接続を確認しています");
        gas("GET", { action: "ping", token: db.settings.token }).then(function (j) {
          toast("接続しました。シートに " + j.rows + " 行あります");
          render(); flush();
        }, function (err) { db.lastError = err.message; save(); render(); toast(err.message); });
        break;
      }
      case "gas-flush": db.lastError = ""; flush().then(function () { toast(db.lastError ? db.lastError : "送信しました"); }); break;
      case "gas-pull": pull(); break;
      case "gas-all":
        if (confirm(db.flights.length + "便すべてをシートに送ります。シートにある同じ記録（日付、区間、機体記号が一致）は上書きされ、重複はしません。")) {
          db.flights.forEach(function (f) { enqueue("upsert", f.id); });
          db.lastError = ""; save(); render(); flush();
        }
        break;
      case "backup-out":
        shareFile("搭乗記録-" + todayISO() + ".json", JSON.stringify({
          app: "skylog", v: 1, exportedAt: new Date().toISOString(), flights: db.flights, windows: db.windows
        }, null, 1), "application/json");
        break;
      case "backup-in": $("#fileIn").click(); break;
      case "csv-out": shareFile("搭乗記録-" + todayISO() + ".csv", csv(), "text/csv"); break;
      case "wipe":
        if (confirm("端末の記録と窓位置をすべて消します。シートの記録は消えません。続けますか？")) {
          var keep = db.settings, keepUi = db.ui; db = blank(); db.settings = keep; db.ui = keepUi; save(); render(); toast("消去しました");
        }
        break;
    }
  });

  function readGen() {
    var n = $("#genName"), r = $("#genRows");
    if (n) F.gen.name = n.value.trim().toUpperCase();
    if (r) F.gen.rows = Math.max(1, Math.min(80, parseInt(r.value, 10) || 30));
  }
  function currentWindowsCfg() {
    var s = $("#wcfg");
    return s ? s.value : lastConfigId();
  }

  function onSeat(seat, inFlow) {
    if (inFlow && F) {
      F.d.seat = F.d.seat === seat ? "" : seat;
      renderFlow("none-keep", true);
      return;
    }
    var cid = currentWindowsCfg();
    var cur = ratingOf(cid, seat);
    var nx = ORDER[(ORDER.indexOf(cur) + 1) % ORDER.length];
    setRating(cid, seat, nx);
    var wrap = $("#wcabin"), top = window.scrollY;
    if (wrap) {
      var btn = wrap.querySelector('[data-seat="' + seat + '"]');
      if (btn) {
        btn.className = btn.className.replace(/\b(green|yellow|red|black|unknown|pop)\b/g, "").trim() + " " + nx;
        retrigger(btn, "pop");
        var rowEl = btn.closest(".crow"), wins = rowEl.querySelectorAll(".win");
        var lay = rowLayout(getConfig(cid), parseInt(seat, 10)), w = winLetters(lay);
        var letter = seat.slice(-1);
        var markEl = letter === w.L ? wins[0] : wins[wins.length - 1];
        if (markEl) markEl.className = "win " + nx;
      }
    }
    // update header cards without rebuilding the map
    var tmp = document.createElement("div");
    tmp.innerHTML = windowsHTML();
    var cards = $$(".card", app), fresh = $$(".card", tmp);
    if (cards[1] && fresh[1]) cards[1].innerHTML = fresh[1].innerHTML;
    window.scrollTo(0, top);
  }

  document.addEventListener("input", function (e) {
    var t = e.target;
    if (!F) return;
    if (t.id === "apq") { F.q = t.value; $("#aplist").innerHTML = apListHTML(); }
    else if (t.id === "regIn") {
      var v = t.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (v.indexOf("JA") === 0 && v.length > 4) v = v.slice(2);
      if (t.value !== v) t.value = v;
      F.d.reg = v ? "JA" + v : "";
      applyDetection();
      $("#regStatus").innerHTML = regStatus();
      $$("#regChips .chip").forEach(function (c) { c.classList.toggle("on", c.dataset.reg === F.d.reg); });
      renderTicket(["reg"]);
    }
    else if (t.id === "fnoIn") {
      var n = t.value.toUpperCase().replace(/[^0-9A-Z]/g, "");
      var code = F.d.airline || "";
      if (code && n.indexOf(code) === 0 && /\d/.test(n.charAt(code.length))) n = n.slice(code.length);
      if (t.value !== n) t.value = n;
      F.d.flightNo = n; renderTicket(true);
    }
    else if (t.id === "noteIn") { F.d.note = t.value; }
    else if (t.id === "seatIn") {
      var s = t.value.toUpperCase().replace(/[^0-9A-Z]/g, "");
      if (t.value !== s) t.value = s;
      F.d.seat = s; renderTicket(true);
    }
  });
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.id === "dateIn" && F) { if (t.value) { F.d.date = t.value; renderFlow("none"); } }
    else if (t.id === "seatIn" && F) { renderFlow("none-keep", true); }
    else if (t.id === "wcfg") { db.ui.windowsCfg = t.value; save(); render(); }
    else if (t.id === "csvIn") {
      var cf = t.files && t.files[0];
      if (cf) readTextFile(cf, function (txt) { t.value = ""; prepareImport(txt); });
    }
    else if (t.id === "fileIn") {
      var file = t.files && t.files[0];
      if (!file) return;
      var rd = new FileReader();
      rd.onload = function () {
        try {
          var o = JSON.parse(String(rd.result));
          if (!o || !Array.isArray(o.flights)) throw new Error("x");
          if (!confirm(o.flights.length + "便の記録で、端末の記録を置き換えます。よろしいですか？")) return;
          db.flights = o.flights; db.windows = o.windows || {}; save(); render();
          toast("復元しました");
        } catch (err) { toast("このファイルは読み込めませんでした"); }
        t.value = "";
      };
      rd.readAsText(file);
    }
  });
  document.addEventListener("keydown", function (e) {
    if (!F || e.key !== "Enter") return;
    var id = e.target.id;
    if (id === "regIn" || id === "fnoIn" || id === "seatIn") { e.preventDefault(); e.target.blur(); next(); }
    if (id === "apq") {
      e.preventDefault();
      var first = $("#aplist .ap");
      if (first && F.q) first.click();
    }
  });

  window.addEventListener("online", flush);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") flush(); });
  var resizeT;
  window.addEventListener("resize", function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () { if (view === "windows" && !F) render(); }, 200);
  });

  /* ---------- launch animation ---------- */
  var introRun = 0;
  function playIntro(done) {
    var el = $("#intro"), run = ++introRun, finished = false;
    document.body.classList.add("booting");
    $(".tabs").classList.remove("arrive"); $("#fab").classList.remove("arrive");
    var skipping = false, curE = 0;
    // tap: the plane bursts away, a band of light sweeps out from the horizon, then the scene lifts like a curtain
    function skip() {
      if (finished || skipping || run !== introRun) return;
      skipping = true;
      var e0 = curE, t1 = null;
      el.classList.add("skip");
      requestAnimationFrame(function sf(now) {
        if (run !== introRun) return;
        if (t1 == null) t1 = now;
        var q = Math.min(1, (now - t1) / 620);
        setPlane(e0 + (1 - e0) * q * q);
        if (q < 1) requestAnimationFrame(sf);
      });
      // home starts arriving underneath first, so the curtain reveals it already in motion
      setTimeout(function () {
        if (run !== introRun || finished) return;
        finished = true;
        document.body.classList.remove("booting");
        retrigger($(".tabs"), "arrive"); retrigger($("#fab"), "arrive");
        done();
      }, 200);
      setTimeout(function () {
        if (run !== introRun) return;
        el.classList.add("lift");
        setTimeout(function () { if (run === introRun) el.classList.add("gone"); }, 2300);
      }, 600);
    }
    function finish() {
      if (finished || run !== introRun) return;
      finished = true;
      el.classList.add("out");
      document.body.classList.remove("booting");
      retrigger($(".tabs"), "arrive"); retrigger($("#fab"), "arrive");
      done();
      setTimeout(function () { if (run === introRun) el.classList.add("gone"); }, 3100);
    }
    if (REDUCE) { el.classList.add("gone"); finished = true; document.body.classList.remove("booting"); done(); return; }
    el.classList.remove("gone", "out", "t1", "skip", "lift");
    retrigger($(".i-scene", el), "i-scene");
    $("#introSub").textContent = db.flights.length ? "通算 " + db.flights.length + " 便" : "最初の搭乗を記録しましょう";
    // runway: edge lights in perspective + centerline
    var lights = "", i, f, y;
    for (i = 0; i < 17; i++) {
      f = 1 / (1 + i * 0.4); y = 520 + 324 * f;
      [-122, 122].forEach(function (dx) {
        lights += '<circle class="rl" style="animation-delay:' + (i * 75) + 'ms" cx="' + (195 + dx * f).toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (0.5 + 2.5 * f).toFixed(2) + '"/>';
      });
      if (i % 2 === 1) lights += '<rect class="cl" x="' + (195 - 1.3 * f).toFixed(2) + '" y="' + (y - 10 * f).toFixed(1) + '" width="' + (2.6 * f).toFixed(2) + '" height="' + (16 * f).toFixed(1) + '"/>';
    }
    $("#iLights").innerHTML = lights;
    var stars = "", seed = 7;
    function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    for (i = 0; i < 26; i++) {
      stars += '<circle class="star" style="animation-delay:' + Math.round(rnd() * 3000) + 'ms" cx="' + (rnd() * 390).toFixed(1) + '" cy="' + (rnd() * 470).toFixed(1) + '" r="' + (0.4 + rnd() * 0.9).toFixed(2) + '"/>';
    }
    $("#iStars").innerHTML = stars;
    // plane rolls down the runway, rotates, lifts off and climbs away to the right
    var s1 = $("#iSeg1"), s2 = $("#iSeg2"), plane = $("#iPlane"), mask = $("#iMask");
    var L1 = s1.getTotalLength(), L2 = s2.getTotalLength(), L = L1 + L2;
    mask.style.strokeDasharray = L2 + " " + (L2 + 10);
    mask.style.strokeDashoffset = L2;
    var START = 500, DUR = 3500, t0 = null;
    // continuous acceleration: slow roll, rotate, then an ever-faster climb out of frame
    var ease = function (x) { return Math.pow(x, 2.15); };
    function at(len) {
      var path = len <= L1 ? s1 : s2, u = len <= L1 ? len : len - L1, max = len <= L1 ? L1 : L2;
      var a = path.getPointAtLength(Math.max(0, Math.min(max, u)));
      var b = path.getPointAtLength(Math.max(0, Math.min(max, u + 1.5)));
      if (b.x === a.x && b.y === a.y) { var c = path.getPointAtLength(Math.max(0, u - 1.5)); b = { x: 2 * a.x - c.x, y: 2 * a.y - c.y }; }
      return { x: a.x, y: a.y, r: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI + 90 };
    }
    function setPlane(e) {
      curE = e;
      var len = e * L, q = at(len);
      plane.setAttribute("transform", "translate(" + q.x.toFixed(2) + " " + q.y.toFixed(2) + ") rotate(" + q.r.toFixed(2) + ") scale(" + (2.15 - 1.3 * e).toFixed(3) + ")");
      mask.style.strokeDashoffset = (L2 - Math.max(0, len - L1)).toFixed(1);
    }
    function frame(now) {
      if (finished || skipping || run !== introRun) return;
      if (t0 == null) t0 = now;
      var p = Math.max(0, Math.min(1, (now - t0 - START) / DUR));
      setPlane(ease(p));
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    setTimeout(function () { if (!finished && !skipping && run === introRun) el.classList.add("t1"); }, START + DUR * 0.74);
    setTimeout(function () { if (!skipping) finish(); }, START + DUR * 0.74 + 1600);
    el.onclick = skip;
  }

  applyTheme(themeId());
  initBadges();
  if (db.ui.intro === false) {
    $("#intro").classList.add("gone");
    document.body.classList.remove("booting");
    go("home", { enter: true });
  } else {
    playIntro(function () { go("home", { enter: true }); setTimeout(checkBadges, 2600); });
  }
  if (db.ui.intro === false) setTimeout(checkBadges, 2200);
  flush();

  window.__skylog = { checkBadges: checkBadges, openRecap: openRecap, drawRecap: drawRecap, db: function () { return db; }, openFlow: openFlow, go: go, goStep: function (i) { goStep(i); }, F: function () { return F; } };
})();
