// テスト共通の手順
import { expect } from "@playwright/test";

// アプリを開いて、ホーム画面が出るまで待つ。ページ内のエラーは errors に集める
export async function openApp(page, path = "/") {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    // Google Fonts が取れない環境の読み込みエラーは無視する
    if (m.type() === "error" && !/Failed to load resource|fonts\.(googleapis|gstatic)/.test(m.text())) errors.push(m.text());
  });
  await page.goto(path);
  await skipIntro(page);
  await expect(page.locator("#app .view")).toBeVisible();
  return errors;
}

// 起動アニメーションが出ていればタップして飛ばし、消えるまで待つ
export async function skipIntro(page) {
  const intro = page.locator("#intro");
  if (!(await intro.evaluate((el) => el.classList.contains("gone")))) await intro.click({ force: true }).catch(() => {});
  await expect(intro).toHaveClass(/gone/, { timeout: 8000 });
}

export const db = (page) => page.evaluate(() => window.__skylog.db());

// 実績の解除演出は全画面のモーダルなので、出ていたら閉じる
export async function dismissAwards(page) {
  for (let i = 0; i < 30; i++) {
    const open = await page.locator("#award").evaluate((el) => el.classList.contains("open"));
    if (!open) return;
    await page.locator('#award [data-act="award-next"]').click();
    await page.waitForTimeout(150);
  }
}

export async function stepTitle(page) {
  return (await page.locator("#flowTitle").evaluate((el) => el.firstChild ? el.firstChild.textContent : "")).trim();
}

export async function ticketBox(page) {
  return page.locator("#flowTicket .ticket").evaluate((t) => {
    const hidden = [...t.querySelectorAll("[data-f], .t-names")].filter((e) => e.offsetParent === null).length;
    return { h: Math.round(t.getBoundingClientRect().height * 10) / 10, hidden };
  });
}

// 「次へ」を押して、次のステップに切り替わるまで待つ
export async function next(page) {
  const before = await page.locator("#flowCount").textContent();
  await page.locator("#flowNext").click();
  await expect(page.locator("#flowCount")).not.toHaveText(before || "");
}
