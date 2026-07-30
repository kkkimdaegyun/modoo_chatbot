"use client";

import { ArrowLeft, Bot, Check, Copy, MessageCircle, Send, X } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { apiBase } from "../../lib/api";

const installCode = `<script
  src="https://your-domain.example/widget.js"
  data-workspace-id="default"
  data-position="right"
  async
></script>`;

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

export default function WidgetPage() {
  const [open, setOpen] = useState(true);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([
    { role: "assistant", content: "안녕하세요! 회사 문서를 바탕으로 궁금한 점을 안내해 드릴게요." },
  ]);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = question.trim();
    if (!text) return;
    setQuestion("");
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
    }
  }

  /**
   * navigator.clipboard 는 HTTPS·localhost 같은 보안 컨텍스트에서만 존재한다.
   * LAN IP(http://192.168…)로 접속하면 undefined 라서 그냥 부르면 예외가 나므로
   * 실패 시 임시 textarea + execCommand 로 대체하고, 그것마저 막히면 안내를 띄운다.
   */
  async function copyCode() {
    setCopyError("");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("보안 컨텍스트가 아니라 클립보드 API를 쓸 수 없습니다.");
      await navigator.clipboard.writeText(installCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      if (fallbackCopy(installCode)) {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
        return;
      }
      console.error("설치 코드 복사 실패", error);
      setCopyError("브라우저가 복사를 막았습니다. 위 코드를 직접 선택해 복사해 주세요.");
    }
  }

  return (
    <main className="widget-demo">
      <Link className="widget-back" href="/" aria-label="채팅으로 돌아가기" title="채팅으로 돌아가기">
        <ArrowLeft size={17} />
        <span>채팅</span>
      </Link>
      <section className="widget-install">
        <span className="eyebrow">웹사이트 설치</span>
        <h1>어디서든 ELA Chatbot을<br />바로 연결하세요</h1>
        <p>아래 코드를 웹사이트의 닫는 body 태그 앞에 붙여 넣으면 됩니다.</p>
        <div className="code-card"><pre>{installCode}</pre><button onClick={() => void copyCode()}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "복사됨" : "설치 코드 복사"}</button></div>
        {copyError && <div className="form-error copy-error" role="alert">{copyError}</div>}
      </section>
      {open && <section className="widget-window">
        <header><span className="avatar blue"><Bot size={18} /></span><div><strong>ELA 상담 어시스턴트</strong><span>● 온라인 · 24시간 응대</span></div><button aria-label="위젯 닫기" onClick={() => setOpen(false)}><X size={18} /></button></header>
        <div className="widget-messages">{messages.map((message, index) => <div className={`widget-message ${message.role}`} key={index}>{message.content}</div>)}</div>
        <form onSubmit={submit}><input aria-label="위젯 질문 입력" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="무엇이 궁금하신가요?" /><button aria-label="질문 전송"><Send size={16} /></button></form>
      </section>}
      {!open && <button className="widget-launcher" aria-label="상담 위젯 열기" onClick={() => setOpen(true)}><MessageCircle size={25} /></button>}
    </main>
  );
}
