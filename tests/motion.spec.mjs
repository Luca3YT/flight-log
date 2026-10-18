// 演出のテスト（動きを止めずに流す）
import { test, expect } from "@playwright/test";
import { dismissAwards, next } from "./helpers.mjs";

test.use({ reducedMotion: "no-preference" });

test("起動アニメーションは最後まで流れるとホームに切り替わる", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#intro")).toHaveClass(/t1/, { timeout: 6000 });   // タイトルが浮かぶ
  await expect(page.locator("#intro")).toHaveClass(/gone/, { timeout: 12000 });
  await expect(page.locator(".hero .ticket")).toBeVisible();
});

test("起動アニメーションはタップで飛ばせる（ボタンは出さない）", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(1200);
  await expect(page.locator("#intro button")).toHaveCount(0);
  await page.locator("#intro").click({ force: true });
  await expect(page.locator("#intro")).toHaveClass(/skip/);
  await expect(page.locator("#intro")).toHaveClass(/lift/, { timeout: 2000 });
  await expect(page.locator("#intro")).toHaveClass(/gone/, { timeout: 5000 });
  // 横にはみ出さない（はみ出すと iPhone で画面が縮んでタップがずれる）
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test("記録すると、スタンプ → 半券が紙ごと切れる → 券が上へ消える の順に進む", async ({ page }) => {
  await page.goto("/");
  await page.locator("#intro").click({ force: true });
  await expect(page.locator("#intro")).toHaveClass(/gone/, { timeout: 5000 });
  await page.waitForTimeout(800);
  await dismissAwards(page);
  await page.locator(".hero [data-act=detail]").click();
  await page.locator('#sheet [data-act="edit"]').click();
  await expect(page.locator("#flow")).toHaveClass(/open/);
  await page.locator('[data-act="to-confirm"]').click();
  await expect(page.locator("#flowNext")).toHaveText("変更を保存");
  await page.waitForTimeout(800);
  await page.locator("#flowNext").click();
  const t = page.locator("#flowTicket .ticket");
  await expect(t).toHaveClass(/issued/);
  await expect(t).toHaveClass(/torn/, { timeout: 2000 });
  // 半券（.stub）そのものが動く。文字だけが動くのではない
  await page.waitForTimeout(700);
  const moved = await page.locator("#flowTicket .stub").evaluate((s) => getComputedStyle(s).transform);
  expect(moved).not.toBe("none");
  await expect(page.locator("#flowTicket")).toHaveClass(/lift/, { timeout: 3000 });
  await expect(page.locator("#flow")).not.toHaveClass(/open/, { timeout: 4000 });
});
