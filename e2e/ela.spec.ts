import { expect, test } from "@playwright/test";

/**
 * accounts.json 은 커밋되지 않으므로 아이디·비밀번호를 코드에 박지 않는다.
 * 실행 예: ELA_ADMIN_USER=test ELA_ADMIN_PASSWORD=1111 npm run test:e2e
 */
const ADMIN_USER = process.env.ELA_ADMIN_USER;
const ADMIN_PASSWORD = process.env.ELA_ADMIN_PASSWORD;

test("고객 채팅 화면에는 사이드바도 관리자 링크도 없다", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "무엇이 궁금하신가요?" })).toBeVisible();
  await expect(page.getByPlaceholder("연결된 문서에 대해 질문해 보세요")).toBeVisible();
  await expect(page.getByRole("link", { name: /관리자/ })).toHaveCount(0);
  await expect(page.locator(".app-sidebar, .context-panel, .chat-resizer")).toHaveCount(0);
});

test("관리자 페이지는 주소로 직접 들어가야 열린다", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "관리자 로그인" })).toBeVisible();
});

test("위젯 안내는 로그인하지 않으면 관리자 로그인으로 보낸다", async ({ page }) => {
  await page.goto("/widget");
  await expect(page.getByRole("heading", { name: "관리자 로그인" })).toBeVisible();
});

test("로그인하면 문서 관리와 시작 화면 탭을 쓸 수 있다", async ({ page }) => {
  test.skip(!ADMIN_USER || !ADMIN_PASSWORD, "ELA_ADMIN_USER / ELA_ADMIN_PASSWORD 를 지정해야 실행됩니다.");
  await page.goto("/admin");
  await page.getByLabel("아이디").fill(ADMIN_USER!);
  await page.getByLabel("비밀번호").fill(ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page.getByRole("heading", { name: "문서 관리" })).toBeVisible();

  await page.getByRole("tab", { name: "시작 화면" }).click();
  await expect(page.getByRole("heading", { name: "첫 화면 문구" })).toBeVisible();
  await expect(page.getByRole("button", { name: "카드 추가" })).toBeVisible();

  // 고객 화면에서 뺀 메뉴가 관리자 상단으로 옮겨졌다.
  await expect(page.getByRole("link", { name: "위젯·연동 안내" })).toBeVisible();
  await expect(page.getByRole("link", { name: "서비스 소개" })).toBeVisible();
});
