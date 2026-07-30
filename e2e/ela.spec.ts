import { expect, test } from "@playwright/test";

test("landing, admin login and chat navigation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "문서 하나로, 24시간 상담사가 생깁니다" })).toBeVisible();
  await page.goto("/admin");
  await page.getByLabel("이메일").fill("admin@example.com");
  await page.getByLabel("비밀번호").fill("change-me");
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page.getByRole("heading", { name: "문서 관리" })).toBeVisible();
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "무엇이 궁금하신가요?" })).toBeVisible();
});
