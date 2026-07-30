"use client";

import { Bot, Check, Copy, MessageCircle, Send, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { API_BASE } from "../../lib/api";

const installCode = `<script
  src="https://your-domain.example/widget.js"
  data-workspace-id="default"
  data-position="right"
  async
></script>`;

export default function WidgetPage() {
  const [open, setOpen] = useState(true);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([
    { role: "assistant", content: "안녕하세요! 회사 문서를 바탕으로 궁금한 점을 안내해 드릴게요." },
  ]);
  const [copied, setCopied] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = question.trim();
    if (!text) return;
    setQuestion("");
    setMessages((current) => [...current, { role: "user", content: text }]);
    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
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

  async function copyCode() {
    await navigator.clipboard.writeText(installCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <main className="widget-demo">
      <section className="widget-install">
        <span className="eyebrow">웹사이트 설치</span>
        <h1>어디서든 ELA Chatbot을<br />바로 연결하세요</h1>
        <p>아래 코드를 웹사이트의 닫는 body 태그 앞에 붙여 넣으면 됩니다.</p>
        <div className="code-card"><pre>{installCode}</pre><button onClick={() => void copyCode()}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "복사됨" : "설치 코드 복사"}</button></div>
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
