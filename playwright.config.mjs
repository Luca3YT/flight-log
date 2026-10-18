// テストの設定。npm test で tools/serve.mjs を立ち上げてから全テストを流す。
import { defineConfig } from "@playwright/test";

const PORT = 8123;
// クラウド環境などで入っている Chromium を使うときだけ PW_CHROMIUM にパスを入れる（普段は空のままで OK）
const executablePath = process.env.PW_CHROMIUM || undefined;

export default defineConfig({
  testDir: "tests",
  timeout: 120000,
  expect: { timeout: 10000 },
  fullyParallel: true,
  reporter: [["list"]],
  webServer: { command: `node tools/serve.mjs ${PORT}`, url: `http://localhost:${PORT}/`, reuseExistingServer: true, timeout: 20000 },
  use: {
    baseURL: `http://localhost:${PORT}/`,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    // 動きを止めて機能だけを速く確かめる。演出そのものを見るテストは個別に "no-preference" にする
    reducedMotion: "reduce",
    serviceWorkers: "block",
    launchOptions: executablePath ? { executablePath } : {}
  }
});
