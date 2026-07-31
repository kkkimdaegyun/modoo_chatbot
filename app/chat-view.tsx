"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Bot, ChevronDown, ChevronRight, CircleStop, FileText, Plus, Send,
} from "lucide-react";
import {
  Fragment, FormEvent, ReactNode, useEffect, useMemo, useRef, useState,
} from "react";
import { apiBase, apiFetch, ChatIntro, Source } from "../lib/api";

type Message = { role: "user" | "assistant"; content: string; sources?: Source[] };

/** 관리자가 예시 질문을 아직 채우지 않았거나 서버를 못 읽었을 때 쓰는 값. */
const FALLBACK_INTRO: ChatIntro = {
  chat_title: "고객상담 어시스턴트",
  welcome_heading: "무엇을 도와드릴까요?",
  welcome_message: "안내 자료를 확인해서 정확한 내용으로 답변해 드립니다.",
  suggestions: [],
  show_documents: false,
  documents: [],
  document_count: 0,
  chunk_count: 0,
};

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
        <sup className="cite" key={`${key}-c${count}`} title="답변에 참고한 문서">
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
    // 한 문단 안에서도 문장마다 줄을 바꿔 참고 문서 단위로 읽히게 한다.
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

function ThinkingIndicator({ phase }: { phase: "retrieving" | "generating" }) {
  return (
    <span className="thinking" role="status">
      <span className="thinking-dots"><i /><i /><i /></span>
      {phase === "retrieving" ? "관련 문서를 찾아보고 있어요" : "답변을 작성하고 있어요"}
    </span>
  );
}

/**
 * 답변 아래에 접힌 상태로 붙는 근거 목록.
 * 우측 패널을 없애면서 옮겨온 자리이므로, 펼치면 문서명·페이지와 원문 일부까지 그대로 보여준다.
 */
function AnswerSources({ sources }: { sources: Source[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`answer-sources${open ? " open" : ""}`}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        <FileText size={13} />
        <span>참고한 문서 {sources.length}개</span>
        <ChevronDown size={14} />
      </button>
      {open ? (
        <div className="answer-source-list">
          {sources.map((source, index) => (
            <article key={source.id}>
              <header>
                <em>{index + 1}</em>
                <strong>{source.document_name}</strong>
                <span>{source.page_number ? `${source.page_number}페이지` : source.section_title || (source.source_type === "qa" ? "QA" : "문서")}</span>
              </header>
              <p>{source.excerpt}</p>
            </article>
          ))}
        </div>
      ) : (
        <div className="source-chips">
          {sources.map((source, index) => (
            <span className="source-chip" key={source.id}>[{index + 1}] {source.document_name}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ChatView() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<"idle" | "retrieving" | "generating" | "error">("idle");
  const [error, setError] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const busy = phase === "retrieving" || phase === "generating";

  // 답변이 늘어나는 동안 맨 아래를 따라간다. 위로 올려 읽고 있으면 따라가지 않는다.
  useEffect(() => {
    const area = scrollRef.current;
    if (!area || !stickToBottom.current) return;
    area.scrollTop = area.scrollHeight;
  }, [messages]);

  // 첫 화면 문구와 예시 질문은 관리자 페이지에서 정한 값을 쓴다. 못 읽으면 기본값으로 뜬다.
  const introQuery = useQuery({
    queryKey: ["chat-intro"],
    queryFn: () => apiFetch<ChatIntro>("/api/chat-intro"),
  });
  const intro = introQuery.data || FALLBACK_INTRO;

  // 상단 중앙 배지: 평소에는 점 하나와 on, 작업 중에는 무엇을 하는지 짧게 보여준다.
  const status = useMemo(() => {
    if (phase === "retrieving") return { tone: "busy", label: "검색 중" };
    if (phase === "generating") return { tone: "busy", label: "작성 중" };
    if (phase === "error") return { tone: "error", label: "off" };
    return { tone: "live", label: "on" };
  }, [phase]);

  async function sendQuestion(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    // 이전 답변의 출처가 남아 있으면 새 답변의 근거인 것처럼 보인다.
    setInput(""); setError(""); setSources([]); setPhase("retrieving");
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

  /** 사이드바를 없애면서 옮겨온 "새 대화". 대화가 있을 때만 보여 첫 화면을 어지럽히지 않는다. */
  function reset() {
    abortRef.current?.abort();
    setMessages([]); setSources([]); setError(""); setPhase("idle");
  }

  return (
    <main className="chat-page">
      <header className="app-topbar">
        <h1>{intro.chat_title}</h1>
        <span className={`status-pill ${status.tone}`} role="status"><i className="status-dot" />{status.label}</span>
        <div className="topbar-actions">
          {messages.length > 0 && (
            <button className="button button-secondary button-compact" onClick={reset}><Plus size={15} /> 새 대화</button>
          )}
        </div>
      </header>
      <div className="chat-column">
        <div
          className="chat-scroll"
          ref={scrollRef}
          onScroll={(event) => {
            const area = event.currentTarget;
            stickToBottom.current = area.scrollHeight - area.scrollTop - area.clientHeight < 80;
          }}
        >
          {messages.length === 0 ? (
            <div className="chat-welcome">
              <span className="big-bot"><Bot size={26} /></span>
              <h2>{intro.welcome_heading}</h2>
              <p>{intro.welcome_message}</p>
              {intro.suggestions.length > 0 && (
                <div className="suggestions">
                  {intro.suggestions.map((item) => (
                    <button className="suggestion" key={item.question} onClick={() => void sendQuestion(item.question)}>
                      <span className="suggestion-question">{item.question}</span>
                      {item.hint && <span className="suggestion-hint">{item.hint}</span>}
                      <ChevronRight size={14} />
                    </button>
                  ))}
                </div>
              )}
              {intro.show_documents && intro.document_count > 0 && (
                <div className="welcome-docs">
                  <span className="welcome-docs-head">
                    {intro.document_count}개 문서 · {intro.chunk_count.toLocaleString()}개 문단을 학습했습니다
                  </span>
                  <div className="welcome-doc-chips">
                    {intro.documents.map((document) => (
                      <span className="welcome-doc-chip" key={document.name} title={`${document.page_count ? `${document.page_count}페이지 · ` : ""}${document.chunk_count}개 문단`}>
                        <FileText size={12} />{document.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
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
                      <AnswerSources sources={sources} />
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
            <textarea aria-label="질문 입력" placeholder="궁금한 점을 입력해 주세요" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendQuestion(input); }
            }} />
            {busy ? <button className="send-button" type="button" aria-label="답변 생성 중지" onClick={() => abortRef.current?.abort()}><CircleStop size={19} /></button> : <button className="send-button" type="submit" aria-label="질문 전송" disabled={!input.trim()}><Send size={18} /></button>}
          </div>
          {/* 추측해서 답하지 않는다는 점은 알려야 하지만, "연결된 문서" 같은 내부 용어는 쓰지 않는다. */}
          <span className="composer-hint">실제 안내 자료를 근거로 답변합니다. 중요한 내용은 원문을 함께 확인해 주세요.</span>
        </form>
      </div>
    </main>
  );
}
