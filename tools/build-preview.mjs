// プレビュー用の単体 HTML を作る（依存なし）
//   npm run preview  →  dist/preview.html
// - data.js と app.js を index.html に埋め込み、1ファイルで開けるようにする
// - Service Worker とホーム画面用のリンクは外す
// - 保存先のキーを本番（skylog.v1）と分けて、本番の記録に触れないようにする（index.html の head でデザインを先読みする所も）
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = (p) => fileURLToPath(new URL("../" + p, import.meta.url));
const [html, app, data] = await Promise.all(["index.html", "app.js", "data.js"].map((f) => readFile(root(f), "utf8")));

for (const [name, src] of [["app.js", app], ["data.js", data]]) {
  if (/<\/script/i.test(src)) throw new Error(`${name} に </script が含まれていて埋め込めません`);
}
const KEY = 'var KEY = "skylog.v1";';
if (!app.includes(KEY)) throw new Error("app.js の保存キー（var KEY = \"skylog.v1\";）が見つかりません");

const HEAD_KEY = 'localStorage.getItem("skylog.v1")';
if (!html.includes(HEAD_KEY)) throw new Error("index.html のデザイン先読み（" + HEAD_KEY + "）が見つかりません");

let out = html
  .replace(HEAD_KEY, 'localStorage.getItem("skylog.preview.v1")')
  .replace('<script src="data.js"></script>', () => "<script>\n" + data + "\n</script>")
  .replace('<script src="app.js"></script>', () => "<script>\n" + app.replace(KEY, 'var KEY = "skylog.preview.v1";') + "\n</script>")
  .replace(/<script>\s*if \("serviceWorker"[\s\S]*?<\/script>\n?/, "")
  .replace(/<link rel="(manifest|apple-touch-icon|icon)"[^>]*>\n?/g, "")
  .replace("<title>搭乗記録</title>", "<title>搭乗記録（プレビュー）</title>");

for (const bad of ['src="app.js"', 'src="data.js"', "serviceWorker", '"skylog.v1"']) {
  if (out.includes(bad)) throw new Error(`プレビューに ${bad} が残っています`);
}
await mkdir(root("dist"), { recursive: true });
await writeFile(root("dist/preview.html"), out);
console.log(`dist/preview.html を作りました（${Math.round(out.length / 1024)} KB）`);
