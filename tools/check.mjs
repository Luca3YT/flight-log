// 公開前の点検（依存なし）。npm test の最初にも走る。
//   npm run check
// - JS の構文
// - app.js と sw.js のバージョンが一致しているか
// - UPDATE.md に今のバージョンの更新履歴があるか
// - sw.js がキャッシュするファイルが実在するか
// - Code.gs に本物の合言葉が入っていないか（リポジトリは公開）
// - デザイン4種類の色の変数がそろっているか
// - 座席表の席数が宣言（seats）と合うか（公式の座席表は不一致なら失敗、目安は注意だけ）
import { readFile, access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { file, readVersions } from "./version.mjs";

const problems = [];
const ok = (m) => console.log("  OK  " + m);

for (const f of ["app.js", "data.js", "sw.js"]) {
  const r = spawnSync(process.execPath, ["--check", file(f)], { encoding: "utf8" });
  if (r.status !== 0) problems.push(`${f} の構文エラー\n${r.stderr}`); else ok(`${f} の構文`);
}
{
  const vm = await import("node:vm");
  try { new vm.Script(await readFile(file("gas/Code.gs"), "utf8"), { filename: "Code.gs" }); ok("gas/Code.gs の構文"); }
  catch (e) { problems.push("gas/Code.gs の構文エラー: " + e.message); }
}

const v = await readVersions();
if (v.app !== v.sw) problems.push(`バージョンがずれています（app.js ${v.app} / sw.js ${v.sw}）。npm run release -- <番号> で揃えてください`);
else ok(`バージョン ${v.app}（app.js と sw.js が一致）`);

const upd = await readFile(file("UPDATE.md"), "utf8");
const history = upd.split("<!-- 更新履歴はこの下に新しい順で追加 -->")[1] || "";
if (!history.includes(`### ${v.app} `)) problems.push(`UPDATE.md の更新履歴に ${v.app} がありません`);
else if (history.includes("（変更内容を書く）")) problems.push("UPDATE.md の更新履歴に「（変更内容を書く）」が残っています");
else ok(`UPDATE.md に ${v.app} の更新履歴`);

const shell = v.swSrc.match(/var SHELL = \[([^\]]*)\]/);
if (!shell) problems.push("sw.js の SHELL が読めません");
else {
  const list = shell[1].split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter((s) => s && s !== "./");
  for (const f of list) { try { await access(file(f)); } catch { problems.push(`sw.js がキャッシュする ${f} がありません`); } }
  ok(`sw.js のキャッシュ対象 ${list.length} ファイル`);
}

// デザインの色の変数が4つのテーマでそろっているか（抜けると、設定の見本で別のテーマの色を引き継いでしまう）
{
  const html = await readFile(file("index.html"), "utf8");
  const block = (sel) => {
    const i = html.indexOf(sel);
    if (i < 0) return null;
    return new Set(html.slice(i, html.indexOf("\n}", i)).match(/--[a-z0-9-]+(?=:)/g));
  };
  const base = block(':root, [data-theme="night"] {');
  const lacks = [];
  for (const t of ["dawn", "dusk", "classic"]) {
    const b = block(`[data-theme="${t}"] {`);
    if (!b) { lacks.push(`${t} のブロックがない`); continue; }
    const miss = [...base].filter((k) => !b.has(k)), extra = [...b].filter((k) => !base.has(k));
    if (miss.length || extra.length) lacks.push(`${t}: ${[...miss.map((k) => "足りない " + k), ...extra.map((k) => "夜の機内にない " + k)].join("、")}`);
  }
  if (!base) problems.push("index.html にデザインの色（夜の機内）のブロックがありません");
  else if (lacks.length) problems.push("デザインの色の変数がそろっていません\n  " + lacks.join("\n  "));
  else ok(`デザイン4種類の色の変数（${base.size}個ずつ）`);
}

// 座席表の席数が宣言（seats）と合うか。数え方は app.js の rowLayout と同じく rows の例外を優先（"" は欠番の列）
{
  const vm = await import("node:vm");
  const ctx = { window: {} };
  vm.runInNewContext(await readFile(file("data.js"), "utf8"), ctx);
  const rowLayout = (c, r) => {
    if (c.rows && c.rows[r] != null) return c.rows[r] || null;
    for (const k of c.cabins) if (r >= k.from && r <= k.to) return k.layout;
    return null;
  };
  const bad = [], approx = [];
  for (const c of ctx.window.SKYDATA.CONFIGS) {
    let n = 0;
    const seats = new Set();
    for (const k of c.cabins) for (let r = k.from; r <= k.to; r++) {
      const lay = rowLayout(c, r);
      if (!lay) continue;
      for (const ch of lay.replace(/[|-]/g, "")) { n++; seats.add(r + ch); }
    }
    const lost = (c.noWindow || []).filter((s) => !seats.has(s));
    if (lost.length) bad.push(`${c.id}: 窓なしの席 ${lost.join("、")} が座席表にない`);
    if (n === c.seats) continue;
    (c.src === "official" ? bad : approx).push(`${c.id}: 宣言 ${c.seats}席 / 座席表 ${n}席`);
  }
  if (bad.length) problems.push("座席表の席数が合いません\n  " + bad.join("\n  "));
  else ok(`座席表の席数（公式の座席表 ${ctx.window.SKYDATA.CONFIGS.filter((c) => c.src === "official").length}仕様が一致）`);
  if (approx.length) console.log("  注意 目安の座席表で席数が合わないもの（公式の座席表が見つかっていない）\n        " + approx.join("\n        "));
}

const gs = await readFile(file("gas/Code.gs"), "utf8");
if (!/const TOKEN = 'ここを自分だけの合言葉に変える';/.test(gs)) problems.push("gas/Code.gs の TOKEN が書き換わっています。公開リポジトリなので本物の合言葉はコミットしないでください");
else ok("gas/Code.gs に合言葉は入っていない");

if (problems.length) {
  console.error("\n点検で問題が見つかりました:\n- " + problems.join("\n- "));
  process.exit(1);
}
console.log("点検 OK");
