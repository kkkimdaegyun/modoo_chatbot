"use client";

import Link from "next/link";
import {
  Bot, ChevronRight, CircleStop, FileText, Home, MessageCircle,
  Plus, Send, Settings, ShieldCheck, Sparkles,
} from "lucide-react";
import { FormEvent, useMemo, useRef, useState } from "react";
import { API_BASE, Source } from "../../lib/api";

type Message = { role: "user" | "assistant"; content: string; sources?: Source[] };

const suggestions = [
  "환불은 언제까지 신청할 수 있나요?",
  "배송은 보통 며칠 걸리나요?",
  "주말에도 상담할 수 있나요?",
];

function Brand() {
  return <Link className="brand" href="/"><span className="brand-mark"><MessageCircle size={18} /></span><span>ELA Chatbot</span></Link>;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<"idle" | "retrieving" | "generating" | "error">("idle");
  const [error, setError] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const busy = phase === "retrieving" || phase === "generating";

  const statusText = useMemo(() => {
    if (phase === "retrieving") return "문서에서 근거 검색 중";
    if (phase === "generating") return "Gemini가 답변 생성 중";
    if (phase === "error") return "연결 확인 필요";
    return "답변 가능한 상태";
  }, [phase]);

  function reset() {
    abortRef.current?.abort();
    setMessages([]); setSources([]); setError(""); setPhase("idle");
  }

  async function sendQuestion(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setInput(""); setError(""); setPhase("retrieving");
    const history = [...messages, { role: "user" as const, content: text }];
    setMessages([...history, { role: "assistant", content: "" }]);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch(`${API_BASE}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text,
          conversation_history: messages.slice(-8).map(({ role, content }) => ({ role, content })),
        }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "채팅 서버에 연결할 수 없습니다.");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() || "";
        for (const block of blocks) {
          const event = block.match(/^event:\s*(.+)$/m)?.[1];
          const raw = block.match(/^data:\s*(.+)$/m)?.[1];
          if (!event || !raw) continue;
          const data = JSON.parse(raw);
          if (event === "retrieval_completed" || event === "generation_started") setPhase("generating");
          if (event === "token") {
            setMessages((current) => {
              const copy = [...current];
              const last = copy.at(-1);
              if (last?.role === "assistant") copy[copy.length - 1] = { ...last, content: last.content + data.text };
              return copy;
            });
          }
          if (event === "sources") setSources(data.sources || []);
          if (event === "completed") setPhase("idle");
          if (event === "error") throw new Error(data.message || "답변 생성 중 오류가 발생했습니다.");
        }
      }
      setPhase("idle");
    } catch (caught) {
      if ((caught as Error).name === "AbortError") {
        setPhase("idle");
        return;
      }
      const message = caught instanceof Error ? caught.message : "연결 오류가 발생했습니다.";
      setError(message);
      setPhase("error");
      setMessages((current) => {
        const copy = [...current];
        const last = copy.at(-1);
        if (last?.role === "assistant" && !last.content) {
          copy[copy.length - 1] = { ...last, content: "답변을 불러오지 못했습니다. 서버와 Gemini 설정을 확인한 뒤 다시 시도해 주세요." };
        }
        return copy;
      });
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void sendQuestion(input);
  }

  return (
    <main className="app-shell">
      <aside className="app-sidebar">
        <Brand />
        <span className="sidebar-label">WORKSPACE</span>
        <nav className="sidebar-nav">
          <button className="active" onClick={reset}><Plus size={17} /><span>새 대화</span></button>
          <Link href="/"><Home size={17} /><span>홈으로</span></Link>
          <Link href="/widget"><MessageCircle size={17} /><span>위젯 미리보기</span></Link>
        </nav>
        <span className="sidebar-label">MANAGE</span>
        <nav className="sidebar-nav"><Link href="/admin"><Settings size={17} /><span>관리자 설정</span></Link></nav>
        <div className="sidebar-bottom"><div className="workspace-pill"><span className="workspace-avatar">ELA</span><div><strong>ELA Workspace</strong><span>3개 문서 연결</span></div></div></div>
      </aside>
      <section className="app-main">
        <header className="app-topbar"><h1>고객상담 어시스턴트</h1><span className="status-pill"><i className="status-dot" />{statusText}</span></header>
        <div className="chat-layout">
          <div className="chat-column">
            <div className="chat-scroll">
              {messages.length === 0 ? (
                <div className="chat-welcome">
                  <span className="big-bot"><Bot size={26} /></span>
                  <h2>무엇이 궁금하신가요?</h2>
                  <p>연결된 회사 문서에서 정확한 근거를 찾아 답변해 드립니다.</p>
                  <div className="suggestions">
                    {suggestions.map((question) => <button className="suggestion" key={question} onClick={() => void sendQuestion(question)}>{question}<ChevronRight size={14} /></button>)}
                  </div>
                </div>
              ) : (
                <div className="conversation">
                  {messages.map((message, index) => (
                    <div className={`chat-message ${message.role}`} key={`${message.role}-${index}`}>
                      <span className={`mini-avatar ${message.role === "user" ? "user-avatar" : ""}`}>{message.role === "user" ? "나" : <Bot size={13} />}</span>
                      <div className="chat-bubble">
                        {message.content || (busy && index === messages.length - 1 ? "근거를 확인하고 있습니다…" : "")}
                        {message.role === "assistant" && index === messages.length - 1 && sources.length > 0 && (
                          <div className="source-chips">{sources.map((source, sourceIndex) => <span className="source-chip" key={source.id}>[{sourceIndex + 1}] {source.document_name}</span>)}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {error && <div className="form-error" role="alert">{error}</div>}
            </div>
            <form className="chat-composer-wrap" onSubmit={submit}>
              <div className="chat-composer">
                <textarea aria-label="질문 입력" placeholder="연결된 문서에 대해 질문해 보세요" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendQuestion(input); }
                }} />
                {busy ? <button className="send-button" type="button" aria-label="답변 생성 중지" onClick={() => abortRef.current?.abort()}><CircleStop size={19} /></button> : <button className="send-button" type="submit" aria-label="질문 전송" disabled={!input.trim()}><Send size={18} /></button>}
              </div>
              <span className="composer-hint">ELA는 연결된 문서만을 근거로 답변하며, 중요한 내용은 원문 출처를 확인하세요.</span>
            </form>
          </div>
          <aside className="context-panel">
            <h2>현재 연결 문서</h2><p>답변에 사용된 출처를 확인할 수 있습니다.</p>
            {(sources.length ? sources : [
              { id: "default-1", document_name: "서비스 이용약관.pdf", page_number: 12, section_title: "청약철회", excerpt: "답변이 생성되면 관련 원문 일부가 여기에 표시됩니다.", source_type: "document" as const },
              { id: "default-2", document_name: "환불·배송 정책.pdf", page_number: 3, section_title: "환불 신청", excerpt: "문서명, 페이지, 섹션 정보를 함께 제공합니다.", source_type: "document" as const },
            ]).map((source) => (
              <article className="source-card" key={source.id}>
                <div className="source-card-head"><FileText size={17} color="#2864f0" /><div><strong>{source.document_name}</strong><span>{source.page_number ? `${source.page_number}페이지 · ` : ""}{source.section_title || (source.source_type === "qa" ? "QA" : "문서")}</span></div></div>
                <p>{source.excerpt}</p>
              </article>
            ))}
            <div className="system-row"><ShieldCheck size={18} color="#14a366" /><div><strong>출처 검증 활성화</strong><span>검색된 근거만 답변에 사용합니다.</span></div></div>
          </aside>
        </div>
      </section>
    </main>
  );
}
