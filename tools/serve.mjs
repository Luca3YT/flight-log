// 開発用のローカルサーバー（依存なし）
//   npm run serve            → http://localhost:8080/
//   npm run serve -- 9000    → ポート指定
// 同じ Wi-Fi の iPhone からは、表示される http://192.168.x.x:8080/ で開けます。
// （http なので Service Worker は動きません。オフライン動作の確認は GitHub Pages 側で）
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json",
  ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".md": "text/plain; charset=utf-8", ".gs": "text/plain; charset=utf-8"
};

const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (path.endsWith("/")) path += "index.html";
    const file = normalize(join(ROOT, path));
    if (file !== ROOT && !file.startsWith(ROOT + sep)) { res.writeHead(403).end(); return; }
    if (file.includes(sep + "node_modules" + sep) || file.includes(sep + ".git")) { res.writeHead(404).end(); return; }
    const info = await stat(file);
    if (!info.isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "Content-Type": TYPES[extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("見つかりません");
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`搭乗記録 開発サーバー  http://localhost:${PORT}/`);
  for (const list of Object.values(networkInterfaces())) {
    for (const n of list || []) {
      if (n.family === "IPv4" && !n.internal) console.log(`  iPhone から:  http://${n.address}:${PORT}/   プレビュー版: http://${n.address}:${PORT}/dist/preview.html`);
    }
  }
  console.log("止めるときは Ctrl + C");
});
