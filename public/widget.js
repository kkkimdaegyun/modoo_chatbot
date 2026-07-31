/**
 * ELA Chatbot 임베드 위젯.
 *
 * 고객사 웹페이지에 <script src=".../widget.js"></script> 한 줄만 넣으면
 * 오른쪽 아래에 상담 버튼이 생기고, 누르면 채팅 화면을 iframe 으로 띄운다.
 *
 * 채팅 화면 주소는 이 스크립트를 내려준 주소에서 그대로 유도한다.
 * 그래서 helpcenter.example.com/leehk/widget.js 로 넣으면 /leehk 채팅이 열리고,
 * /kbs/widget.js 로 넣으면 /kbs 채팅이 열린다. 고객사마다 코드를 고칠 필요가 없다.
 *
 * data 속성으로 조절한다.
 *   data-position="right|left"   버튼 위치 (기본 right)
 *   data-color="#2864f0"         버튼 색
 *   data-label="상담하기"         버튼에 마우스를 올렸을 때 뜨는 설명
 *   data-open="true"             페이지가 열릴 때 바로 펼쳐 둔다
 */
(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) return;
  // 같은 페이지에 스크립트가 두 번 들어가도 버튼이 두 개 생기지 않게 한다.
  if (window.__elaChatbotWidget) return;
  window.__elaChatbotWidget = true;

  var base = script.src.replace(/\/widget\.js(\?.*)?$/, "");
  var position = script.getAttribute("data-position") === "left" ? "left" : "right";
  var color = script.getAttribute("data-color") || "#2864f0";
  var label = script.getAttribute("data-label") || "문의하기";
  var startOpen = script.getAttribute("data-open") === "true";

  var host = document.createElement("div");
  host.setAttribute("data-ela-chatbot", "");
  // 고객사 CSS 가 위젯을 건드리지 못하도록 shadow DOM 안에서 그린다.
  var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;

  var style = document.createElement("style");
  style.textContent = [
    ":host, * { box-sizing: border-box; }",
    ".launcher {",
    "  position: fixed; bottom: 24px; " + position + ": 24px; z-index: 2147483000;",
    "  width: 56px; height: 56px; border: 0; border-radius: 50%; cursor: pointer;",
    "  display: grid; place-items: center; color: #fff; background: " + color + ";",
    "  box-shadow: 0 12px 30px rgba(20,40,78,.28); transition: transform .16s ease, box-shadow .16s ease;",
    "}",
    ".launcher:hover { transform: translateY(-2px); box-shadow: 0 18px 38px rgba(20,40,78,.34); }",
    ".panel {",
    "  position: fixed; bottom: 92px; " + position + ": 24px; z-index: 2147483000;",
    "  width: 384px; max-width: calc(100vw - 32px); height: 600px; max-height: calc(100vh - 120px);",
    "  overflow: hidden; border: 0; border-radius: 18px; background: #fff;",
    "  box-shadow: 0 26px 75px rgba(20,40,78,.24); opacity: 0; transform: translateY(10px);",
    "  pointer-events: none; transition: opacity .18s ease, transform .18s ease;",
    "}",
    ".panel.open { opacity: 1; transform: none; pointer-events: auto; }",
    ".panel iframe { width: 100%; height: 100%; border: 0; display: block; }",
    "@media (max-width: 520px) {",
    "  .panel { " + position + ": 12px; bottom: 84px; width: calc(100vw - 24px); height: calc(100vh - 104px); }",
    "}",
  ].join("\n");

  var panel = document.createElement("div");
  panel.className = "panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "고객상담 채팅");

  // iframe 은 버튼을 처음 누를 때 붙인다. 방문자 대부분은 위젯을 열지 않으므로
  // 미리 붙이면 모든 방문에 채팅 화면 로딩 비용을 물린다.
  var frame = null;
  function ensureFrame() {
    if (frame) return;
    frame = document.createElement("iframe");
    frame.title = "고객상담 채팅";
    frame.src = base + "/";
    frame.setAttribute("loading", "lazy");
    panel.appendChild(frame);
  }

  var launcher = document.createElement("button");
  launcher.className = "launcher";
  launcher.type = "button";
  launcher.setAttribute("aria-label", label);
  launcher.title = label;
  launcher.setAttribute("aria-expanded", "false");
  launcher.innerHTML =
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';

  var open = false;
  function setOpen(next) {
    open = next;
    if (open) ensureFrame();
    panel.classList.toggle("open", open);
    launcher.setAttribute("aria-expanded", open ? "true" : "false");
  }
  launcher.addEventListener("click", function () { setOpen(!open); });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && open) setOpen(false);
  });

  root.appendChild(style);
  root.appendChild(panel);
  root.appendChild(launcher);
  document.body.appendChild(host);
  if (startOpen) setOpen(true);
})();
