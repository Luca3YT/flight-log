// バージョン番号の読み書き。番号の正本は app.js の VERSION。
// sw.js の CACHE 名はリリース時に tools/release.mjs が同じ番号へ揃える（手で書き換えない）。
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const file = (p) => fileURLToPath(new URL("../" + p, import.meta.url));
export const APP_RE = /var VERSION = "(\d+\.\d+\.\d+)";/;
export const SW_RE = /var CACHE = "skylog-v(\d+\.\d+\.\d+)";/;

export async function readVersions() {
  const [app, sw] = await Promise.all([readFile(file("app.js"), "utf8"), readFile(file("sw.js"), "utf8")]);
  const a = app.match(APP_RE), s = sw.match(SW_RE);
  if (!a) throw new Error('app.js に var VERSION = "x.y.z"; が見つかりません');
  if (!s) throw new Error('sw.js に var CACHE = "skylog-vx.y.z"; が見つかりません');
  return { app: a[1], sw: s[1], appSrc: app, swSrc: sw };
}
