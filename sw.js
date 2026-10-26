/* 搭乗記録 — Service Worker
 * 更新したら CACHE の番号を上げること（上げないと古い画面が残ります）
 */
var CACHE = "skylog-v1.4.1";
var SHELL = ["./", "index.html", "app.js", "data.js", "manifest.webmanifest", "icon-180.png", "icon-512.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE && k.indexOf("skylog-") === 0; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  // スプレッドシート同期は常にネットワーク
  if (/script\.google(usercontent)?\.com$/.test(url.hostname)) return;
  // Google Fonts は取得できたらキャッシュして機内でも使う
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.open(CACHE + "-fonts").then(function (c) {
      return c.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) { c.put(req, res.clone()); return res; });
      });
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (hit) {
    return hit || fetch(req).then(function (res) {
      if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () { return caches.match("index.html"); });
  }));
});
