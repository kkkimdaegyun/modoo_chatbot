"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  Bot, ChevronRight, CircleAlert, CircleStop, FileText, Info, LoaderCircle,
  MessageCircle, Plus, Send, Settings, ShieldCheck,
} from "lucide-react";
import {
  CSSProperties, Fragment, FormEvent, KeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode,
  useEffect, useMemo, useRef, useState,
} from "react";
import { apiBase, apiFetch, KnowledgeDocument, Source } from "../lib/api";

type Message = { role: "user" | "assistant"; content: string; sources?: Source[] };

const suggestions = [
  "환불은 언제까지 신청할 수 있나요?",
  "배송은 보통 며칠 걸리나요?",
  "주말에도 상담할 수 있나요?",
];

function Brand() {
  return <Link className="brand" href="/"><span className="brand-mark"><MessageCircle size={18} /></span><span>ELA Chatbot</span></Link>;
}

/** 문장이 끝나고 다음 문장이 시작되는 지점. 소수점·이메일·URL 처럼 뒤에 공백이 없는 점은 건드리지 않는다. */
const SENTENCE_BREAK = /(?<=[.!?])\s+(?=\S)/g;

/**
 * 모델은 "…않습니다 [S2]." 처럼 각주를 마침표 앞에 붙여서 보낸다.
 * 그대로 그리면 "…않습니다 ² ." 가 되어 마침표가 따로 떨어져 보이므로
 * 각주를 문장부호 뒤로 옮기고 앞 공백을 없애 "…않습니다.²" 로 맞춘다.
 */
function tidyCitations(text: string) {
  return text
    .replace(
      /[ \t]*((?:\[\s*S\d+(?:\s*,\s*S?\d+)*\s*\][ \t]*)+)([.,!?;:]+)/g,
      (_match, cites: string, punctuation: string) => `${punctuation}${cites.trim()}`,
    )
    .replace(/[ \t]+(\[\s*S\d+)/g, "$1");
}

/**
 * **굵게** 는 실제 굵은 글씨로, 출처 표기는 작은 각주 번호로 바꾼다.
 * 모델이 [S1], [S1, S3], [S1][S2] 처럼 여러 형태로 쓰므로 연속된 표기는 하나로 묶는다.
 */
function renderInline(text: string, key: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|((?:\[\s*S\d+(?:\s*,\s*S?\d+)*\s*\]\s*)+)/g;
  let lastIndex = 0;
  let count = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[1] !== undefined) {
      nodes.push(<strong key={`${key}-b${count}`}>{match[1]}</strong>);
    } else {
      const numbers = Array.from(new Set(match[2].match(/\d+/g) || []));
      nodes.push(
        <sup className="cite" key={`${key}-c${count}`} title="답변 근거 출처">
          {numbers.join(",")}
        </sup>,
      );
    }
    lastIndex = match.index + match[0].length;
    count += 1;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

/** 모델이 마크다운을 흘리더라도 화면에는 별표가 보이지 않게 정리해서 그린다. */
function AnswerText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];

  const flushBullets = () => {
    if (!bullets.length) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <ul className="answer-list" key={`ul${blocks.length}`}>
        {items.map((item, index) => <li key={index}>{renderInline(tidyCitations(item), `li${blocks.length}-${index}`)}</li>)}
      </ul>,
    );
  };

  for (const raw of text.split("\n")) {
    const line = raw.replace(/^\s*#{1,6}\s*/, "").trimEnd();
    const bullet = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
    if (bullet) {
      bullets.push(bullet[1]);
      continue;
    }
    flushBullets();
    if (!line.trim()) continue;
    // 한 문단 안에서도 문장마다 줄을 바꿔 근거 단위로 읽히게 한다.
    const key = `p${blocks.length}`;
    blocks.push(
      <p key={key}>
        {line.split(SENTENCE_BREAK).map((sentence, index) => (
          <Fragment key={`${key}-s${index}`}>
            {index > 0 && <br />}
            {renderInline(tidyCitations(sentence), `${key}-s${index}`)}
          </Fragment>
        ))}
      </p>,
    );
  }
  flushBullets();
  return <>{blocks}</>;
}

/** 문서가 연결돼 있으면 켜진 것처럼, 없으면 꺼진 것처럼 보이는 상태 표시용 스위치. */
function VerifyToggle({ active }: { active: boolean }) {
  return (
    <div className={`verify-row${active ? " on" : ""}`}>
      <ShieldCheck size={17} />
      <div>
        <strong>출처 검증 {active ? "활성화" : "비활성"}</strong>
        <span>{active ? "검색된 근거만 답변에 사용합니다." : "문서를 올리면 자동으로 켜집니다."}</span>
      </div>
      <span className="verify-switch" aria-hidden="true"><i /></span>
    </div>
  );
}

function ThinkingIndicator({ phase }: { phase: "retrieving" | "generating" }) {
  return (
    <span className="thinking" role="status">
      <span className="thinking-dots"><i /><i /><i /></span>
      {phase === "retrieving" ? "문서에서 근거를 찾고 있어요" : "답변을 작성하고 있어요"}
    </span>
  );
}

/** 대화 영역이 차지하는 기본 비율(%). 나머지가 근거 패널 몫이다. */
const DEFAULT_RATIO = 75;
const RATIO_KEY = "ela_chat_ratio";
const clampRatio = (value: number) => Math.min(85, Math.max(50, value));

export default function ChatView() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<"idle" | "retrieving" | "generating" | "error">("idle");
  const [error, setError] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  const [dragging, setDragging] = useState(false);
  const layoutRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const busy = phase === "retrieving" || phase === "generating";

  // 지난번에 조절해 둔 폭을 기억해서 다시 들어와도 같은 비율로 보여준다.
  useEffect(() => {
    const saved = Number(localStorage.getItem(RATIO_KEY));
    if (saved) setRatio(clampRatio(saved));
  }, []);

  function applyRatio(next: number) {
    const value = clampRatio(next);
    setRatio(value);
    localStorage.setItem(RATIO_KEY, String(Math.round(value)));
  }

  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const layout = layoutRef.current;
    if (!layout) return;
    setDragging(true);
    document.body.classList.add("resizing");
    // 끄는 동안에는 CSS 변수만 직접 바꿔 대화 목록 전체가 다시 그려지지 않게 하고,
    // 손을 뗄 때 한 번만 상태로 확정한다.
    let latest = ratio;
    const move = (moveEvent: PointerEvent) => {
      const box = layout.getBoundingClientRect();
      latest = clampRatio(((moveEvent.clientX - box.left) / box.width) * 100);
      layout.style.setProperty("--chat-ratio", String(latest));
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      document.body.classList.remove("resizing");
      setDragging(false);
      applyRatio(latest);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }

  function resizeByKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") applyRatio(ratio - 2);
    else if (event.key === "ArrowRight") applyRatio(ratio + 2);
    else if (event.key === "Home" || event.key === "Enter") applyRatio(DEFAULT_RATIO);
    else return;
    event.preventDefault();
  }

  const knowledgeQuery = useQuery({
    queryKey: ["knowledge"],
    queryFn: () => apiFetch<KnowledgeDocument[]>("/api/knowledge/documents"),
  });
  const knowledge = knowledgeQuery.data || [];
  const totalChunks = knowledge.reduce((sum, item) => sum + item.chunk_count, 0);

  // 상단 중앙 배지: 평소에는 점 하나와 on, 작업 중에는 무엇을 하는지 짧게 보여준다.
  const status = useMemo(() => {
    if (phase === "retrieving") return { tone: "busy", label: "검색 중" };
    if (phase === "generating") return { tone: "busy", label: "작성 중" };
    if (phase === "error") return { tone: "error", label: "off" };
    return { tone: "live", label: "on" };
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
      const response = await fetch(`${apiBase()}/api/chat/stream`, {
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
          <Link href="/widget"><MessageCircle size={17} /><span>위젯 미리보기</span></Link>
          <Link href="/landing"><Info size={17} /><span>서비스 소개</span></Link>
        </nav>
      </aside>
      <section className="app-main">
        <header className="app-topbar">
          <h1>고객상담 어시스턴트</h1>
          <span className={`status-pill ${status.tone}`} role="status"><i className="status-dot" />{status.label}</span>
          <div className="topbar-actions">
            <Link className="button button-secondary button-compact" href="/admin"><Settings size={15} /> 관리자 페이지</Link>
          </div>
        </header>
        <div
          ref={layoutRef}
          className={`chat-layout${messages.length ? " chatting" : ""}${sources.length ? " split" : ""}`}
          style={{ "--chat-ratio": ratio } as CSSProperties}
        >
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
                        {message.content
                          ? <AnswerText text={message.content} />
                          : busy && index === messages.length - 1
                            ? <ThinkingIndicator phase={phase === "retrieving" ? "retrieving" : "generating"} />
                            : null}
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
          <div
            className={`chat-resizer${dragging ? " dragging" : ""}`}
            role="separator"
            aria-orientation="vertical"
            aria-label="대화 영역과 근거 패널 폭 조절"
            aria-valuenow={Math.round(ratio)}
            aria-valuemin={50}
            aria-valuemax={85}
            tabIndex={0}
            title="드래그해서 폭 조절 · 더블클릭하면 기본값"
            onPointerDown={startResize}
            onDoubleClick={() => applyRatio(DEFAULT_RATIO)}
            onKeyDown={resizeByKey}
          />
          <aside className="context-panel">
            {sources.length > 0 ? (
              <>
                <h2>이번 답변의 근거</h2><p>답변에 실제로 사용된 출처입니다.</p>
                <VerifyToggle active />
                {sources.map((source) => (
                  <article className="source-card" key={source.id}>
                    <div className="source-card-head"><FileText size={17} color="#2864f0" /><div><strong>{source.document_name}</strong><span>{source.page_number ? `${source.page_number}페이지 · ` : ""}{source.section_title || (source.source_type === "qa" ? "QA" : "문서")}</span></div></div>
                    <p>{source.excerpt}</p>
                  </article>
                ))}
              </>
            ) : (
              <>
                <h2>현재 연결 문서</h2>
                <p>{knowledge.length ? `${knowledge.length}개 문서 · ${totalChunks.toLocaleString()}개 문단이 분석되어 있습니다.` : "답변에 사용할 수 있는 문서를 확인할 수 있습니다."}</p>
                <VerifyToggle active={knowledge.length > 0} />
                {knowledgeQuery.isLoading && <div className="panel-empty"><LoaderCircle className="loading-ring" size={18} /><span>문서 목록을 불러오는 중</span></div>}
                {knowledgeQuery.isError && <div className="panel-empty"><CircleAlert size={18} /><span>문서 목록을 불러오지 못했습니다.</span></div>}
                {knowledge.map((document) => (
                  <article className="source-card" key={document.id}>
                    <div className="source-card-head"><FileText size={17} color="#2864f0" /><div><strong>{document.original_filename}</strong><span>{document.page_count ? `${document.page_count}페이지 · ` : ""}{document.chunk_count}개 문단 분석</span></div></div>
                  </article>
                ))}
                {!knowledge.length && !knowledgeQuery.isLoading && !knowledgeQuery.isError && (
                  <div className="panel-empty"><FileText size={18} /><span>분석된 문서가 없습니다. 관리자 페이지에서 문서를 올려주세요.</span></div>
                )}
              </>
            )}
          </aside>
        </div>
      </section>
    </main>
  );
}
