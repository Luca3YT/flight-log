// リリース番号を上げる。変更はこのコマンド1つで済むようにしてある。
//   npm run release -- 1.3.1
// - app.js の VERSION と sw.js の CACHE 名を同じ番号にそろえる（CACHE が変わらないと iPhone に古い画面が残る）
// - UPDATE.md の更新履歴に見出しがなければ追加する（中身は自分で書く）
import { readFile, writeFile } from "node:fs/promises";
import { APP_RE, SW_RE, file, readVersions } from "./version.mjs";

const next = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(next || "")) {
  console.error("使い方: npm run release -- 1.3.1");
  process.exit(1);
}
const cur = await readVersions();
const gt = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; };
if (!gt(next, cur.app)) {
  console.error(`今のバージョン ${cur.app} より大きい番号を指定してください`);
  process.exit(1);
}
await writeFile(file("app.js"), cur.appSrc.replace(APP_RE, `var VERSION = "${next}";`));
await writeFile(file("sw.js"), cur.swSrc.replace(SW_RE, `var CACHE = "skylog-v${next}";`));

const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
let upd = await readFile(file("UPDATE.md"), "utf8");
const MARK = "<!-- 更新履歴はこの下に新しい順で追加 -->";
if (!upd.includes(`### ${next} `)) {
  if (!upd.includes(MARK)) throw new Error(`UPDATE.md に「${MARK}」がありません`);
  upd = upd.replace(MARK, `${MARK}\n\n### ${next} （${today}）\n\n- （変更内容を書く）`);
  await writeFile(file("UPDATE.md"), upd);
}
console.log(`${cur.app} → ${next}（app.js / sw.js / UPDATE.md）`);
console.log("UPDATE.md の「（変更内容を書く）」を書き換えてから npm test → コミット → 確認をとって git push");
