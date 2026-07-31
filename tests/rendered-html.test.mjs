import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the customer chat page at the root", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /ELA Chatbot/);
  assert.match(html, /class="chat-page"/);
  assert.match(html, /무엇을 도와드릴까요\?/);
  assert.match(html, /궁금한 점을 입력해 주세요/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Starter Project/);
  // "연결된 문서" 는 관리자 쪽 용어다. 고객 화면에 다시 새어 나오면 여기서 잡힌다.
  assert.doesNotMatch(html, /연결된 문서|연결 문서/);
});

test("the chat page exposes no admin entry point and no side panels", async () => {
  const html = await (await render()).text();
  // 관리자 페이지는 주소로만 들어간다. 고객 화면에 링크가 다시 생기면 여기서 잡힌다.
  assert.doesNotMatch(html, /href="\/admin"/);
  assert.doesNotMatch(html, /관리자 페이지/);
  // 좌측 사이드바와 우측 참고문서 패널은 제거됐다.
  assert.doesNotMatch(html, /app-sidebar|sidebar-nav|context-panel|chat-resizer/);
  assert.doesNotMatch(html, /위젯 미리보기|서비스 소개|새 대화/);
});

/**
 * 서비스 소개와 위젯 안내는 관리자용으로 옮겼다.
 * 관리자 여부는 브라우저의 세션 토큰으로만 알 수 있어서 서버 렌더 단계에서는
 * 내용이 아니라 확인 화면이 나가야 한다. 여기서 내용이 새면 고객에게도 보인다는 뜻이다.
 */
for (const path of ["/landing", "/widget"]) {
  test(`${path} is gated to admins and leaks no content on the server`, async () => {
    const response = await render(path);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /관리자 로그인 여부를 확인하고 있습니다/);
    // 각 화면 본문에만 있는 문구로 확인한다. layout 의 og:image alt 에도 소개 문구가
    // 들어 있어서 "24시간 상담사가 생깁니다" 같은 말로는 본문 유출을 구분할 수 없다.
    assert.doesNotMatch(html, /이런 고민, 있으신가요\?/);
    assert.doesNotMatch(html, /엔드포인트 목록/);
  });
}

test("starter preview is removed and product metadata is present", async () => {
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
  const [layout, packageJson] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /ELA Chatbot/);
  assert.match(layout, /lang="ko"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
