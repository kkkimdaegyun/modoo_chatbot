"use client";

import { ArrowLeft, Bot, Check, Copy, ExternalLink, LoaderCircle, MessageCircle, Send, X } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { apiBase } from "../../lib/api";
import { readToken, useAdminOnly } from "../../lib/admin-session";

function fallbackCopy(text: string) {
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const copied = document.execCommand("copy");
    document.body.removeChild(area);
    return copied;
  } catch {
    return false;
  }
}

/** 화면 어디서든 코드 블록을 그리고 복사까지 처리한다. */
function CodeCard({ title, note, code }: { title: string; note?: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");

  /**
   * navigator.clipboard 는 HTTPS·localhost 같은 보안 컨텍스트에서만 존재한다.
   * LAN IP(http://192.168…)로 접속하면 undefined 라서 그냥 부르면 예외가 나므로
   * 실패 시 임시 textarea + execCommand 로 대체하고, 그것마저 막히면 안내를 띄운다.
   */
  async function copy() {
    setCopyError("");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("보안 컨텍스트가 아니라 클립보드 API를 쓸 수 없습니다.");
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      if (fallbackCopy(code)) {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
        return;
      }
      console.error("코드 복사 실패", error);
      setCopyError("브라우저가 복사를 막았습니다. 위 코드를 직접 선택해 복사해 주세요.");
    }
  }

  return (
    <div className="doc-block">
      <div className="doc-block-head">
        <strong>{title}</strong>
        {note && <span>{note}</span>}
      </div>
      <div className="code-card">
        <pre>{code}</pre>
        <button onClick={() => void copy()}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "복사됨" : "코드 복사"}</button>
      </div>
      {copyError && <div className="form-error copy-error" role="alert">{copyError}</div>}
    </div>
  );
}

const ENDPOINTS = [
  ["POST", "/api/chat", "질문 하나를 보내고 완성된 답변과 출처를 한 번에 받습니다.", "공개"],
  ["POST", "/api/chat/stream", "답변을 SSE 로 토큰 단위로 흘려 받습니다. 화면에 타이핑처럼 보여줄 때 씁니다.", "공개"],
  ["GET", "/api/chat-intro", "첫 화면 문구와 예시 질문. 문서 목록은 노출 설정을 켠 경우에만 담깁니다.", "공개"],
  ["GET", "/api/knowledge/documents", "학습 완료된 문서 목록(파일명·규모). 파일명이 드러나므로 인증이 필요합니다.", "관리자"],
  ["GET", "/api/system/status", "임베딩·리랭커·DB·Gemini 연결 상태.", "공개"],
  ["POST", "/api/auth/login", "관리자 토큰 발급. 아래 관리자 API 의 Bearer 토큰을 여기서 받습니다.", "공개"],
  ["GET", "/api/documents", "업로드된 문서와 처리 진행률.", "관리자"],
  ["POST", "/api/documents/upload", "문서 업로드(multipart/form-data, 필드명 file).", "관리자"],
  ["GET|PUT", "/api/settings", "첫 화면 문구·예시 질문과 검색 파라미터를 읽고 씁니다.", "관리자"],
  ["GET|POST", "/api/qa", "직접 등록하는 질문·답변 쌍.", "관리자"],
] as const;

export default function WidgetPage() {
  const gate = useAdminOnly();
  const [open, setOpen] = useState(true);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([
    { role: "assistant", content: "안녕하세요! 궁금한 점을 말씀해 주시면 확인해서 안내해 드릴게요." },
  ]);
  const [sending, setSending] = useState(false);
  // 설치 코드에는 실제로 배포된 주소가 들어가야 복사해서 바로 쓸 수 있다.
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    // basePath(/leehk 등)까지 포함한 이 앱의 뿌리 주소. /widget 을 떼면 그게 챗봇 주소다.
    setOrigin(`${window.location.origin}${window.location.pathname.replace(/\/widget\/?$/, "")}`);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = question.trim();
    if (!text || sending) return;
    setQuestion("");
    setSending(true);
    setMessages((current) => [...current, { role: "user", content: text }]);
    try {
      const response = await fetch(`${apiBase()}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, conversation_history: [] }),
      });
      const result = await response.json();
      setMessages((current) => [...current, { role: "assistant", content: result.answer || result.detail || "답변을 확인하지 못했습니다." }]);
    } catch {
      setMessages((current) => [...current, { role: "assistant", content: "현재 상담 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요." }]);
    } finally {
      setSending(false);
    }
  }

  if (gate === "checking") {
    return <main className="login-page"><div className="login-card"><h1>확인 중</h1><p>관리자 로그인 여부를 확인하고 있습니다.</p><LoaderCircle className="loading-ring" size={22} /></div></main>;
  }

  const site = origin || "https://helpcenter.example.com/leehk";
  const api = apiBase() || site;

  return (
    <main className="widget-demo">
      <Link className="widget-back" href="/admin" aria-label="관리자 페이지로 돌아가기" title="관리자 페이지로 돌아가기">
        <ArrowLeft size={17} />
        <span>관리자</span>
      </Link>
      <section className="widget-install">
        <span className="eyebrow">웹사이트 설치 · 연동 안내</span>
        <h1>어디서든 ELA Chatbot을<br />바로 연결하세요</h1>
        <p>
          아래 세 가지 중 상황에 맞는 방법을 고르면 됩니다. 스크립트 한 줄로 붙이는 것이 가장 빠르고,
          화면을 직접 만들고 싶으면 REST API 를 쓰면 됩니다.
        </p>

        <CodeCard
          title="1. 스크립트 한 줄 (가장 간단)"
          note="닫는 </body> 태그 바로 앞에 붙여 넣으세요."
          code={`<script
  src="${site}/widget.js"
  data-position="right"
  data-color="#2864f0"
  data-label="문의하기"
  async
></script>`}
        />
        <p className="doc-note">
          오른쪽 아래에 상담 버튼이 생기고, 누르면 이 챗봇 화면이 iframe 으로 열립니다.
          스크립트를 내려준 주소를 그대로 쓰므로 고객사별로 코드를 고칠 필요가 없습니다.
        </p>

        <CodeCard
          title="2. 페이지 안에 직접 넣기 (iframe)"
          note="상담 전용 페이지나 도움말 센터 안에 넣을 때."
          code={`<iframe
  src="${site}/"
  title="고객상담 챗봇"
  style="width:100%;height:640px;border:0;border-radius:16px"
></iframe>`}
        />

        <CodeCard
          title="3. REST API — 답변 한 번에 받기"
          note="화면을 직접 만들 때. 인증이 필요 없습니다."
          code={`curl -X POST '${api}/api/chat' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "question": "환불은 언제까지 신청할 수 있나요?",
    "conversation_history": []
  }'

# 응답
# {
#   "answer": "구매일로부터 7일 이내에 ... [S1]",
#   "sources": [
#     { "id": "...", "document_name": "환불_배송_정책.pdf",
#       "page_number": 3, "excerpt": "...", "source_type": "document" }
#   ]
# }`}
        />

        <CodeCard
          title="4. REST API — 스트리밍(SSE)으로 받기"
          note="타이핑처럼 흘려 보여주고 싶을 때."
          code={`const response = await fetch('${api}/api/chat/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ question, conversation_history: [] }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = '';
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const blocks = buffer.split('\\n\\n');
  buffer = blocks.pop() || '';
  for (const block of blocks) {
    const event = block.match(/^event:\\s*(.+)$/m)?.[1];
    const data = JSON.parse(block.match(/^data:\\s*(.+)$/m)?.[1] || '{}');
    if (event === 'token') append(data.text);
    if (event === 'sources') showSources(data.sources);
  }
}

// 이벤트 순서
// retrieval_started → retrieval_completed → generation_started
// → token(여러 번) → sources → completed
// 오류가 나면 그 자리에서 error 이벤트가 대신 옵니다.`}
        />

        <div className="doc-block">
          <div className="doc-block-head">
            <strong>엔드포인트 목록</strong>
            <span>관리자 표시가 붙은 항목은 <code>Authorization: Bearer &lt;토큰&gt;</code> 이 필요합니다.</span>
          </div>
          <div className="endpoint-table">
            {ENDPOINTS.map(([method, path, description, scope]) => (
              <div className="endpoint-row" key={path}>
                <span className="endpoint-method">{method}</span>
                <code>{path}</code>
                <p>{description}</p>
                <span className={`endpoint-scope${scope === "관리자" ? " admin" : ""}`}>{scope}</span>
              </div>
            ))}
          </div>
        </div>

        <CodeCard
          title="관리자 토큰 받기"
          note="발급받은 계정으로 로그인하면 토큰이 나옵니다. 기본 8시간 유효합니다."
          code={`curl -X POST '${api}/api/auth/login' \\
  -H 'Content-Type: application/json' \\
  -d '{"username":"발급받은-아이디","password":"발급받은-비밀번호"}'

# {"access_token":"eyJ...","token_type":"bearer","user":{...}}

curl '${api}/api/documents' -H 'Authorization: Bearer eyJ...'`}
        />

        <div className="doc-block">
          <div className="doc-block-head">
            <strong>참고</strong>
            <span>운영 시 알아 두면 좋은 것들</span>
          </div>
          <ul className="doc-list">
            <li><strong>요청 한도</strong> — <code>/api/chat*</code> 은 IP 당 분당 60건까지 받고, 넘으면 429 를 돌려줍니다.</li>
            <li><strong>다른 도메인에서 호출할 때</strong> — 서버 <code>.env</code> 의 <code>CORS_ORIGINS</code> 에 그 도메인을 넣어야 브라우저 요청이 통과합니다. 위젯 스크립트와 iframe 방식은 챗봇과 같은 출처를 쓰므로 해당되지 않습니다.</li>
            <li><strong>근거가 없을 때</strong> — 검색 결과가 없으면 모델을 호출하지 않고 &quot;문서에서 확인할 수 없다&quot;고 답합니다. 추측한 답이 나가지 않습니다.</li>
            <li><strong>예시 질문 바꾸기</strong> — 첫 화면 카드는 관리자 페이지 &gt; 시작 화면 탭에서 바로 수정할 수 있습니다.</li>
          </ul>
          <a className="button button-secondary" href={`${api}/docs`} target="_blank" rel="noreferrer">
            <ExternalLink size={15} /> Swagger 문서 열기
          </a>
          {!readToken() && <div className="form-error">관리자 토큰이 없어 Swagger 의 관리자 엔드포인트는 시도할 수 없습니다.</div>}
        </div>
      </section>

      {open && <section className="widget-window">
        <header><span className="avatar blue"><Bot size={18} /></span><div><strong>ELA 상담 어시스턴트</strong><span>● 온라인 · 24시간 응대</span></div><button aria-label="위젯 닫기" onClick={() => setOpen(false)}><X size={18} /></button></header>
        <div className="widget-messages">{messages.map((message, index) => <div className={`widget-message ${message.role}`} key={index}>{message.content}</div>)}</div>
        <form onSubmit={submit}><input aria-label="위젯 질문 입력" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={sending ? "답변을 기다리는 중입니다" : "궁금한 점을 입력해 주세요"} disabled={sending} /><button aria-label="질문 전송" disabled={sending || !question.trim()}>{sending ? <LoaderCircle className="loading-ring" size={16} /> : <Send size={16} />}</button></form>
      </section>}
      {!open && <button className="widget-launcher" aria-label="상담 위젯 열기" onClick={() => setOpen(true)}><MessageCircle size={25} /></button>}
    </main>
  );
}
