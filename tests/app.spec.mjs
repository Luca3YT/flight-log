// アプリの主な機能の自動テスト（動きは止めて、機能だけを確かめる）
import { test, expect } from "@playwright/test";
import { openApp, skipIntro, db, dismissAwards, stepTitle, ticketBox, next } from "./helpers.mjs";

test("起動すると内蔵の49便が入っていて、4つのタブが開ける", async ({ page }) => {
  const errors = await openApp(page);
  const d = await db(page);
  expect(d.flights.length).toBe(49);
  expect(d.seedVersion).toBe(2);
  for (const [tab, title] of [["stats", "統計"], ["windows", "窓位置"], ["settings", "設定"], ["home", "搭乗記録"]]) {
    await page.locator(`[data-tab="${tab}"]`).click();
    await expect(page.locator("#app h1")).toHaveText(title);
  }
  await page.locator('[data-tab="settings"]').click();
  await expect(page.locator(".foot-note")).toHaveText(/^搭乗記録 \d+\.\d+\.\d+$/);
  expect(errors).toEqual([]);
});

test("新しい搭乗を最後まで記録できる。券の大きさはどの画面でも変わらない", async ({ page }) => {
  const errors = await openApp(page);
  await page.locator("#fab").click();
  const sizes = [];
  const measure = async () => sizes.push(await ticketBox(page));

  expect(await stepTitle(page)).toBe("搭乗日");
  await measure(); await next(page);

  expect(await stepTitle(page)).toBe("航空会社");
  await measure();
  await page.locator('[data-act="pick-airline"][data-code="JL"]').click();
  await expect.poll(() => stepTitle(page)).toBe("区間");

  await measure();
  await page.locator("#apq").fill("はねだ");
  await page.locator('#aplist [data-iata="HND"]').click();
  await page.locator("#apq").fill("rjnk");
  await page.locator('#aplist [data-iata="KMQ"]').click();
  await expect.poll(() => stepTitle(page)).toBe("機体記号");

  await measure();
  await page.locator("#regIn").pressSequentially("333j");
  await expect(page.locator("#regStatus")).toContainText("B737-800");
  await expect(page.locator("#regStatus")).toContainText("前回の記録から");
  await measure(); await next(page);

  expect(await stepTitle(page)).toBe("機材");
  await expect(page.locator('#flowBody .opt.on .tag.gold')).toHaveText("自動");
  await measure(); await next(page);

  expect(await stepTitle(page)).toBe("座席");
  await page.locator('#flowBody [data-seat="12K"]').click();
  await page.locator('[data-act="rate"][data-r="green"]').click();
  await measure(); await next(page);

  expect(await stepTitle(page)).toBe("備考");
  await page.locator("#fnoIn").fill("185");
  await page.locator("#noteIn").fill("富士山が見えた");
  await measure(); await next(page);

  expect(await stepTitle(page)).toBe("確認");
  await measure();
  await page.locator("#flowNext").click();
  await expect(page.locator("#flow")).not.toHaveClass(/open/);
  await page.waitForTimeout(600);
  await dismissAwards(page);

  // 券は全画面で同じ高さ、隠れた項目なし
  expect(new Set(sizes.map((s) => s.h)).size).toBe(1);
  expect(sizes.every((s) => s.hidden === 0)).toBe(true);

  const d = await db(page);
  expect(d.flights.length).toBe(50);
  const f = d.flights.find((x) => x.reg === "JA333J" && x.seat === "12K");
  expect(f).toMatchObject({ airline: "JL", from: "HND", to: "KMQ", type: "B737-800", config: "JL-738-V35", flightNo: "185", note: "富士山が見えた", window: "green" });
  expect(d.windows["JL-738-V35"]["12K"]).toBe("green");
  expect(d.outbox.length).toBe(1);
  expect(errors).toEqual([]);
});

test("機体記号から機材を推定し、手で選び直した機材は機体記号を変えても上書きされない", async ({ page }) => {
  await openApp(page);
  await page.locator("#fab").click();
  await next(page);
  await page.locator('[data-act="pick-airline"][data-code="JL"]').click();
  await expect.poll(() => stepTitle(page)).toBe("区間");
  await page.locator('[data-act="route-set"]').first().click();
  await expect.poll(() => stepTitle(page)).toBe("機体記号");

  await page.locator("#regIn").pressSequentially("06xj");
  await expect(page.locator("#regStatus")).toContainText("A350-900");
  await expect(page.locator("#regStatus")).toContainText("機体記号から推定");
  await next(page);
  await page.locator('[data-act="pick-cfg"][data-id="JL-763-A25"]').click();
  await expect.poll(() => stepTitle(page)).toBe("座席");
  expect((await page.evaluate(() => window.__skylog.F().d)).type).toBe("B767-300ER");

  await page.locator('#flowTicket [data-key="reg"]').click();
  await expect.poll(() => stepTitle(page)).toBe("機体記号");
  await page.locator("#regIn").fill("");
  await page.locator("#regIn").pressSequentially("333j");
  const d = await page.evaluate(() => window.__skylog.F().d);
  expect(d.type).toBe("B767-300ER");
  expect(d.config).toBe("JL-763-A25");
});

test("編集は日付の画面から始まり、「確認へ」で最後まで飛べる", async ({ page }) => {
  await openApp(page);
  await page.locator(".hero [data-act=detail]").click();
  await page.locator('#sheet [data-act="edit"]').click();
  await expect(page.locator("#flow")).toHaveClass(/open/);
  expect(await stepTitle(page)).toBe("搭乗日");
  await page.locator('[data-act="to-confirm"]').click();
  await expect.poll(() => stepTitle(page)).toBe("確認");
  await expect(page.locator("#flowNext")).toHaveText("変更を保存");
  await page.locator('#flowTicket [data-key="seat"]').click();
  await expect.poll(() => stepTitle(page)).toBe("座席");
  await page.locator('#flowBody [data-seat="20A"]').click();
  await page.locator('[data-act="to-confirm"]').click();
  await expect.poll(() => stepTitle(page)).toBe("確認");
  await page.locator("#flowNext").click();
  await expect(page.locator("#flow")).not.toHaveClass(/open/);
  await page.waitForTimeout(600);
  await dismissAwards(page);
  const d = await db(page);
  expect(d.flights.length).toBe(49);
  expect(d.flights.filter((f) => f.seat === "20A").length).toBe(1);
});

test("スプレッドシートの範囲を貼り付けて取り込める。重複はしない", async ({ page }) => {
  await openApp(page);
  await page.locator('[data-tab="settings"]').click();
  const sheet = [
    "#\t日付\t出発\t到着\t路線\t機材\t機体記号\t備考",
    "1\t2024/07/21\tHND\tCTS\tHND → CTS\tA350-900\t不明\t",
    "49\t2026/10/03\tHND\tKMQ\tHND → KMQ\tB737-800\tJA323J\t",
    "50\t2026/10/20\tKMQ\tHND\tKMQ → HND\tB737-800\tJA341J\t雨で揺れた",
    "51\t2026/11/02\t羽田\t新千歳\t\tA350-900\tJA06XJ\t",
    "52\t不明\t\t\t\t\t\t"
  ].join("\n");
  await page.locator("#impText").fill(sheet);
  await page.locator('[data-act="imp-check"]').click();
  await expect(page.locator("#sheet")).toHaveClass(/open/);
  const k = page.locator("#sheet .kpis.three .kpi b");
  await expect(k.nth(0)).toContainText("2");
  await expect(k.nth(1)).toContainText("2");
  await expect(k.nth(2)).toContainText("1");
  await page.locator('[data-act="imp-run"]').click();
  await expect.poll(async () => (await db(page)).flights.length).toBe(51);
  await dismissAwards(page);
  const d = await db(page);
  expect(d.flights.find((f) => f.date === "2026-10-20")).toMatchObject({ from: "KMQ", to: "HND", reg: "JA341J", note: "雨で揺れた", airline: "JL" });
  expect(d.flights.find((f) => f.date === "2026-11-02")).toMatchObject({ from: "HND", to: "CTS", reg: "JA06XJ" });
});

test("古い端末の記録に、新しい内蔵データの足りない便だけが足される", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const o = JSON.parse(JSON.stringify(window.__skylog.db()));
    o.flights = o.flights.filter((f) => f.date <= "2026-05-26");   // 内蔵データ 1 版の 37 便
    delete o.seedVersion;
    o.flights.push({ id: "u1", date: "2026-10-01", airline: "NH", from: "HND", to: "ITM", type: "B787-8", config: null, seat: "", reg: "JA801A", flightNo: "", note: "test", window: "", createdAt: 1, updatedAt: 1 });
    o.flights[5].note = "自分で書いたメモ";
    localStorage.setItem("skylog.v1", JSON.stringify(o));
  });
  await page.reload();
  await page.locator("#app .view").waitFor();
  const d = await db(page);
  const keys = d.flights.map((f) => f.date + f.from + f.to + f.reg);
  expect(d.flights.length).toBe(50);
  expect(new Set(keys).size).toBe(keys.length);
  expect(d.flights.some((f) => f.note === "自分で書いたメモ")).toBe(true);
  expect(d.flights.some((f) => f.id === "u1")).toBe(true);
  expect(d.seedVersion).toBe(2);
});

test("統計：路線マップ・実績・振り返りカード（年間・半年・月間）", async ({ page }) => {
  const errors = await openApp(page);
  await page.locator('[data-tab="stats"]').click();
  await expect(page.locator("#mapWrap svg .rt")).toHaveCount(5);
  await expect(page.locator(".badges .badge")).toHaveCount(24);
  await page.locator('[data-act="map-mode"][data-m="all"]').click();
  await expect(page.locator("#mapWrap svg .rt")).toHaveCount(5);

  await page.locator('[data-act="recap"]').click();
  for (const kind of ["year", "half", "month"]) {
    await page.locator(`[data-act="recap-kind"][data-k="${kind}"]`).click();
    await expect(page.locator("#recapImg")).toHaveClass(/ready/);
    const w = await page.locator("#recapImg").evaluate((img) => img.naturalWidth);
    expect(w).toBe(1080);
  }
  expect(errors).toEqual([]);
});

test("プレビュー版は本番と別の場所に保存する", async ({ page }) => {
  const { execFileSync } = await import("node:child_process");
  execFileSync(process.execPath, ["tools/build-preview.mjs"]);
  await openApp(page, "/dist/preview.html");
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys).toContain("skylog.preview.v1");
  expect(keys).not.toContain("skylog.v1");
});

test("デザインを切り替えると全体の色が変わり、開き直しても残る。券の大きさは変わらず、記録を消してもデザインは残る", async ({ page }) => {
  const errors = await openApp(page);
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
  const bg = () => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
  const ticketH = () => page.locator(".hero .ticket").evaluate((t) => t.getBoundingClientRect().height);
  expect(await theme()).toBe("night");
  const night = await bg(), h0 = await ticketH();

  await page.locator('[data-tab="settings"]').click();
  await expect(page.locator(".theme")).toHaveCount(4);
  await expect(page.locator(".theme.on")).toHaveAttribute("data-id", "night");
  for (const id of ["dawn", "dusk", "classic"]) {
    await page.locator(`.theme[data-id="${id}"]`).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", id);
    await expect(page.locator(".theme.on")).toHaveCount(1);
    await expect(page.locator(".theme.on")).toHaveAttribute("data-id", id);
    expect(await bg()).not.toBe(night);
    expect((await db(page)).ui.theme).toBe(id);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  }
  expect(await page.locator('meta[name="theme-color"]').getAttribute("content")).toBe("#6E2530");

  // 開き直すと、起動アニメーションの前からそのデザイン
  await page.reload();
  expect(await theme()).toBe("classic");
  await skipIntro(page);
  await dismissAwards(page);
  expect(await ticketH()).toBeCloseTo(h0, 0);
  const cv = await page.evaluate(async () => { const c = await window.__skylog.drawRecap("year", "2026"); return [c.width, c.height]; });
  expect(cv).toEqual([1080, 1350]);

  // 記録を全部消しても、デザインの設定は残る
  page.once("dialog", (d) => d.accept());
  await page.locator('[data-tab="settings"]').click();
  await page.locator('[data-act="wipe"]').click();
  await expect.poll(async () => (await db(page)).flights.length).toBe(0);
  expect((await db(page)).ui.theme).toBe("classic");
  expect(await theme()).toBe("classic");
  expect(errors).toEqual([]);
});

test("保存の途中で「戻る」「閉じる」「記録する」を押しても、二重に記録されない", async ({ page }) => {
  const errors = await openApp(page);
  await dismissAwards(page);
  const n0 = (await db(page)).flights.length;
  await page.locator("#fab").click();
  await page.evaluate(() => { const F = window.__skylog.F(); Object.assign(F.d, { airline: "JL", from: "HND", to: "ITM", type: "B737-800", reg: "JA301J" }); F.max = 7; window.__skylog.goStep(7); });
  await expect(page.locator("#flowNext")).toHaveText("記録する");
  // 記録した直後、演出が終わる前に連打する
  const states = await page.evaluate(() => {
    const $ = (s) => document.querySelector(s);
    $("#flowNext").click();
    const s = { back: $("#flowBack").disabled, next: $("#flowNext").disabled };
    $("#flowBack").click(); $("#flowNext").click(); $('#flow [data-act="flow-close"]').click();
    return s;
  });
  expect(states).toEqual({ back: true, next: true });
  await expect(page.locator("#flow")).not.toHaveClass(/open/);
  await expect.poll(async () => (await db(page)).flights.length).toBe(n0 + 1);
  await page.waitForTimeout(600);
  expect((await db(page)).flights.filter((f) => f.from === "HND" && f.to === "ITM" && f.reg === "JA301J")).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("形のおかしいバックアップや保存データでも画面が壊れない。復元をやめても同じファイルを選び直せる", async ({ page }, info) => {
  const { writeFileSync } = await import("node:fs");
  const errors = await openApp(page);
  await dismissAwards(page);
  // 1便は正しく、1便は日付がないバックアップ
  const file = info.outputPath("backup.json");
  writeFileSync(file, JSON.stringify({ flights: [{ id: "ok1", date: "2026-10-20", airline: "JL", from: "HND", to: "ITM", reg: "JA301J" }, { from: "HND" }], windows: {} }));
  page.once("dialog", (d) => d.dismiss());               // いったん、やめる
  await page.locator("#fileIn").setInputFiles(file);
  await expect.poll(() => page.locator("#fileIn").evaluate((i) => i.value)).toBe("");
  expect((await db(page)).flights.length).toBe(49);
  page.once("dialog", (d) => d.accept());                // 選び直して、復元する
  await page.locator("#fileIn").setInputFiles(file);
  await expect.poll(async () => (await db(page)).flights.length).toBe(1);
  const f = (await db(page)).flights[0];
  expect([f.id, f.date, f.note, f.seat, f.config]).toEqual(["ok1", "2026-10-20", "", "", null]);

  // 端末の保存データに壊れた記録が混ざっていても、開き直せば画面が出る
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem("skylog.v1")); d.flights.push({ from: "HND", to: "ITM" }, null); localStorage.setItem("skylog.v1", JSON.stringify(d)); });
  await page.reload();
  await skipIntro(page);
  await expect(page.locator("#app h1")).toHaveText("搭乗記録");
  expect((await db(page)).flights.length).toBe(1);
  expect(errors).toEqual([]);
});

test("開発用サーバーは .git などの隠しファイルを出さない（大文字でも）", async ({ request }) => {
  for (const p of ["/.git/config", "/.GIT/config", "/.Git/HEAD", "/.gitignore", "/node_modules/.package-lock.json", "/NODE_MODULES/.package-lock.json"]) {
    expect((await request.get(p)).status(), p).toBe(404);
  }
  expect((await request.get("/index.html")).status()).toBe(200);
  expect((await request.get("/app.js")).status()).toBe(200);
});
