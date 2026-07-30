"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity, Bot, Braces, CheckCircle2, Database, FileQuestion, FileText, Gauge,
  LoaderCircle, LogOut, MessageCircle, RefreshCw, Search, Settings, ShieldCheck,
  Trash2, UploadCloud,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { apiFetch, API_BASE, DocumentItem, SystemStatus } from "../../lib/api";

const loginSchema = z.object({
  email: z.string().email("올바른 이메일을 입력해 주세요."),
  password: z.string().min(4, "비밀번호를 입력해 주세요."),
});
type LoginForm = z.infer<typeof loginSchema>;
type View = "documents" | "qa" | "debug" | "settings";
type QaItem = { id: string; question: string; answer: string; category: string; is_active: boolean };

function Brand() {
  return <Link className="brand" href="/"><span className="brand-mark"><MessageCircle size={18} /></span><span>ELA Chatbot</span></Link>;
}

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [view, setView] = useState<View>("documents");
  const [loginError, setLoginError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploadLabel, setUploadLabel] = useState("");
  const [qaDraft, setQaDraft] = useState({ question: "", answer: "", category: "일반" });
  const [debugQuestion, setDebugQuestion] = useState("환불은 언제까지 신청할 수 있나요?");
  const [settingsDraft, setSettingsDraft] = useState({ system_prompt: "", final_context_top_k: 7, max_context_tokens: 10000, qa_priority_boost: 1.15 });
  const [settingsSaved, setSettingsSaved] = useState("");
  const queryClient = useQueryClient();
  const form = useForm<LoginForm>({ resolver: zodResolver(loginSchema), defaultValues: { email: "admin@example.com", password: "change-me" } });

  useEffect(() => {
    const saved = sessionStorage.getItem("ela_admin_token");
    if (saved) setToken(saved);
  }, []);

  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const statusQuery = useQuery({
    queryKey: ["system-status"],
    queryFn: () => apiFetch<SystemStatus>("/api/system/status"),
    enabled: Boolean(token),
    refetchInterval: 20_000,
  });
  const documentsQuery = useQuery({
    queryKey: ["documents"],
    queryFn: () => apiFetch<DocumentItem[]>("/api/documents", { headers: authHeaders }),
    enabled: Boolean(token),
  });
  const qaQuery = useQuery({
    queryKey: ["qa"],
    queryFn: () => apiFetch<QaItem[]>("/api/qa", { headers: authHeaders }),
    enabled: Boolean(token),
  });
  const settingsQuery = useQuery({
    queryKey: ["chatbot-settings"],
    queryFn: () => apiFetch<typeof settingsDraft>("/api/settings", { headers: authHeaders }),
    enabled: Boolean(token),
  });
  useEffect(() => {
    if (settingsQuery.data) setSettingsDraft(settingsQuery.data);
  }, [settingsQuery.data]);
  const debugMutation = useMutation({
    mutationFn: () => apiFetch<Record<string, unknown>>("/api/retrieval/debug", { method: "POST", headers: authHeaders, body: JSON.stringify({ question: debugQuestion }) }),
  });

  async function login(values: LoginForm) {
    setLoginError("");
    try {
      const result = await apiFetch<{ access_token: string }>("/api/admin/login", { method: "POST", body: JSON.stringify(values) });
      sessionStorage.setItem("ela_admin_token", result.access_token);
      setToken(result.access_token);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "로그인에 실패했습니다.");
    }
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploadLabel("업로드 중");
    try {
      for (const file of Array.from(files)) {
        const data = new FormData();
        data.append("file", file);
        const response = await fetch(`${API_BASE}/api/documents/upload`, { method: "POST", body: data, headers: authHeaders });
        if (!response.ok) {
          const detail = await response.json().catch(() => null);
          throw new Error(detail?.detail || `${file.name} 업로드 실패`);
        }
      }
      setUploadLabel("문서 분석 및 지식 인덱싱 시작");
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
    } catch (error) {
      setUploadLabel(error instanceof Error ? error.message : "업로드 실패");
    }
  }

  async function removeDocument(id: string) {
    await apiFetch(`/api/documents/${id}`, { method: "DELETE", headers: authHeaders });
    await queryClient.invalidateQueries({ queryKey: ["documents"] });
  }

  async function reindexDocument(id: string) {
    await apiFetch(`/api/documents/${id}/reindex`, { method: "POST", headers: authHeaders });
    await queryClient.invalidateQueries({ queryKey: ["documents"] });
  }

  async function addQa() {
    await apiFetch("/api/qa", { method: "POST", headers: authHeaders, body: JSON.stringify(qaDraft) });
    setQaDraft({ question: "", answer: "", category: "일반" });
    await queryClient.invalidateQueries({ queryKey: ["qa"] });
  }

  async function removeQa(id: string) {
    await apiFetch(`/api/qa/${id}`, { method: "DELETE", headers: authHeaders });
    await queryClient.invalidateQueries({ queryKey: ["qa"] });
  }

  async function importQa(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const data = new FormData();
    data.append("file", file);
    const response = await fetch(`${API_BASE}/api/qa/import`, { method: "POST", headers: authHeaders, body: data });
    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      setUploadLabel(detail?.detail || "QA 가져오기에 실패했습니다.");
      return;
    }
    const result = await response.json();
    setUploadLabel(`QA ${result.imported}개 반영 · 중복 ${result.duplicates}개 제외`);
    await queryClient.invalidateQueries({ queryKey: ["qa"] });
  }

  async function saveSettings() {
    setSettingsSaved("");
    await apiFetch("/api/settings", { method: "PUT", headers: authHeaders, body: JSON.stringify(settingsDraft) });
    setSettingsSaved("설정을 저장했습니다.");
    await queryClient.invalidateQueries({ queryKey: ["chatbot-settings"] });
  }

  function logout() {
    sessionStorage.removeItem("ela_admin_token");
    setToken("");
  }

  if (!token) {
    return (
      <main className="login-page">
        <form className="login-card" onSubmit={form.handleSubmit(login)}>
          <Brand /><h1>관리자 로그인</h1><p>문서와 챗봇 지식을 안전하게 관리하세요.</p>
          {loginError && <div className="form-error" role="alert">{loginError}</div>}
          <div className="field"><label htmlFor="email">이메일</label><input id="email" type="email" autoComplete="username" {...form.register("email")} />{form.formState.errors.email && <small>{form.formState.errors.email.message}</small>}</div>
          <div className="field"><label htmlFor="password">비밀번호</label><input id="password" type="password" autoComplete="current-password" {...form.register("password")} />{form.formState.errors.password && <small>{form.formState.errors.password.message}</small>}</div>
          <button className="button button-primary full" type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? <LoaderCircle className="loading-ring" size={17} /> : <ShieldCheck size={17} />} 로그인</button>
        </form>
      </main>
    );
  }

  const documents = documentsQuery.data || [];
  const qas = qaQuery.data || [];
  const status = statusQuery.data;
  const readyDocs = documents.filter((item) => item.status === "ready").length;
  const totalChunks = documents.reduce((sum, item) => sum + item.chunk_count, 0);

  return (
    <main className="app-shell">
      <aside className="app-sidebar">
        <Brand />
        <span className="sidebar-label">MANAGEMENT</span>
        <nav className="sidebar-nav">
          <button className={view === "documents" ? "active" : ""} onClick={() => setView("documents")}><FileText size={17} /><span>문서 관리</span></button>
          <button className={view === "qa" ? "active" : ""} onClick={() => setView("qa")}><FileQuestion size={17} /><span>QA 관리</span></button>
          <button className={view === "debug" ? "active" : ""} onClick={() => setView("debug")}><Search size={17} /><span>Retrieval Debug</span></button>
          <button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}><Settings size={17} /><span>챗봇 설정</span></button>
        </nav>
        <div className="sidebar-bottom"><nav className="sidebar-nav"><button onClick={logout}><LogOut size={17} /><span>로그아웃</span></button></nav></div>
      </aside>
      <section className="app-main">
        <header className="app-topbar"><h1>ELA Workspace</h1><span className="status-pill"><i className="status-dot" />시스템 운영 중</span></header>
        <div className="admin-content">
          <div className="admin-heading">
            <div><h2>{view === "documents" ? "문서 관리" : view === "qa" ? "QA 지식 관리" : view === "debug" ? "검색 디버그" : "챗봇 설정"}</h2><p>문서 분석, 검색 인덱싱과 답변 생성 상태를 한곳에서 관리합니다.</p></div>
            <Link className="button button-secondary" href="/app"><Bot size={16} /> 챗봇 열기</Link>
          </div>

          {view === "documents" && <>
            <div className="stats-grid">
              <div className="stat-card"><span>연결 문서</span><strong>{documents.length}</strong><small>{readyDocs}개 답변 가능</small></div>
              <div className="stat-card"><span>지식 청크</span><strong>{totalChunks.toLocaleString()}</strong><small>BGE-M3 임베딩</small></div>
              <div className="stat-card"><span>구조화 QA</span><strong>{qas.length}</strong><small>우선 검색 대상</small></div>
              <div className="stat-card"><span>Gemini 연결</span><strong>{status?.gemini_configured ? "정상" : "미설정"}</strong><small>{status?.gemini_model || "환경변수 확인"}</small></div>
            </div>
            <div className="admin-grid">
              <div className="admin-card">
                <div className="admin-card-head"><h3>연결된 문서</h3><button className="icon-button" aria-label="문서 새로고침" onClick={() => void documentsQuery.refetch()}><RefreshCw size={14} /></button></div>
                {documentsQuery.isError && <div className="form-error">백엔드에 연결할 수 없습니다. Docker 서비스 상태를 확인해 주세요.</div>}
                <table className="document-table"><thead><tr><th>문서</th><th>처리 상태</th><th>페이지</th><th>청크</th><th>작업</th></tr></thead><tbody>
                  {documents.map((document) => <tr key={document.id}><td><span className="document-name"><FileText size={15} color="#2864f0" />{document.original_filename}</span></td><td><span className={`badge ${document.status !== "ready" ? "processing" : ""}`}>{document.status === "ready" ? <CheckCircle2 size={11} /> : <LoaderCircle className="loading-ring" size={11} />}{document.status === "ready" ? "지식 반영 완료" : document.status}</span></td><td>{document.page_count || "—"}</td><td>{document.chunk_count || "—"}</td><td><div className="table-actions"><button className="icon-button" aria-label="재인덱싱" onClick={() => void reindexDocument(document.id)}><RefreshCw size={13} /></button><button className="icon-button" aria-label="문서 삭제" onClick={() => void removeDocument(document.id)}><Trash2 size={13} /></button></div></td></tr>)}
                  {!documents.length && !documentsQuery.isLoading && <tr><td colSpan={5}>연결된 문서가 없습니다. 오른쪽에서 첫 문서를 업로드하세요.</td></tr>}
                </tbody></table>
              </div>
              <div className="admin-card">
                <div className="admin-card-head"><h3>새 문서 업로드</h3></div>
                <div className={`dropzone ${dragging ? "dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void upload(event.dataTransfer.files); }}>
                  <label><UploadCloud size={31} /><strong>파일을 끌어놓거나 선택하세요</strong><span>PDF, DOCX, TXT, MD, CSV, XLSX, JSON · 최대 50MB</span><input type="file" multiple accept=".pdf,.docx,.txt,.md,.csv,.xlsx,.json" onChange={(event) => void upload(event.target.files)} /></label>
                </div>
                {uploadLabel && <div className="upload-state"><Activity size={14} /> {uploadLabel}</div>}
              </div>
            </div>
          </>}

          {view === "qa" && <div className="admin-grid">
            <div className="admin-card"><div className="admin-card-head"><h3>등록된 QA</h3><label className="button button-secondary qa-import"><UploadCloud size={14} />CSV/JSON 가져오기<input type="file" accept=".csv,.json" onChange={(event) => void importQa(event.target.files)} /></label></div>
              {uploadLabel && <div className="upload-state"><Activity size={14} /> {uploadLabel}</div>}
              <table className="document-table"><thead><tr><th>질문</th><th>카테고리</th><th>상태</th><th>작업</th></tr></thead><tbody>{qas.map((qa) => <tr key={qa.id}><td>{qa.question}</td><td>{qa.category}</td><td><span className="badge">{qa.is_active ? "활성" : "비활성"}</span></td><td><button className="icon-button" aria-label="QA 삭제" onClick={() => void removeQa(qa.id)}><Trash2 size={13} /></button></td></tr>)}</tbody></table>
            </div>
            <div className="admin-card"><div className="admin-card-head"><h3>QA 직접 등록</h3></div><div className="field"><label>질문</label><input value={qaDraft.question} onChange={(event) => setQaDraft({ ...qaDraft, question: event.target.value })} /></div><div className="field"><label>답변</label><textarea rows={5} value={qaDraft.answer} onChange={(event) => setQaDraft({ ...qaDraft, answer: event.target.value })} /></div><div className="field"><label>카테고리</label><input value={qaDraft.category} onChange={(event) => setQaDraft({ ...qaDraft, category: event.target.value })} /></div><button className="button button-primary full" disabled={!qaDraft.question || !qaDraft.answer} onClick={() => void addQa()}>QA 등록 및 인덱싱</button></div>
          </div>}

          {view === "debug" && <div className="admin-card">
            <div className="admin-card-head"><h3>Hybrid Retrieval Pipeline</h3><span className="badge processing"><Gauge size={12} />관리자 전용</span></div>
            <div className="debug-form"><input value={debugQuestion} onChange={(event) => setDebugQuestion(event.target.value)} /><button className="button button-primary" onClick={() => debugMutation.mutate()} disabled={debugMutation.isPending}>{debugMutation.isPending ? <LoaderCircle className="loading-ring" size={15} /> : <Search size={15} />} 검색 분석</button></div>
            {debugMutation.isError && <div className="form-error">{(debugMutation.error as Error).message}</div>}
            {debugMutation.data ? <pre className="debug-output">{JSON.stringify(debugMutation.data, null, 2)}</pre> : <div className="empty-debug"><Braces size={30} /><strong>질문을 실행하면 단계별 검색 결과를 표시합니다.</strong><span>Dense · Keyword · RRF · QA boost · Reranker · Context budget</span></div>}
          </div>}

          {view === "settings" && <div className="admin-grid">
            <div className="admin-card"><div className="admin-card-head"><h3>검색 설정</h3></div><div className="field"><label>최종 Context 개수</label><input type="number" value={settingsDraft.final_context_top_k} onChange={(event) => setSettingsDraft({ ...settingsDraft, final_context_top_k: Number(event.target.value) })} /></div><div className="field"><label>Context 토큰 예산</label><input type="number" value={settingsDraft.max_context_tokens} onChange={(event) => setSettingsDraft({ ...settingsDraft, max_context_tokens: Number(event.target.value) })} /></div><div className="field"><label>QA 우선 가중치</label><input type="number" step="0.05" value={settingsDraft.qa_priority_boost} onChange={(event) => setSettingsDraft({ ...settingsDraft, qa_priority_boost: Number(event.target.value) })} /></div><div className="field"><label>시스템 프롬프트 추가 지침</label><textarea rows={5} value={settingsDraft.system_prompt || ""} onChange={(event) => setSettingsDraft({ ...settingsDraft, system_prompt: event.target.value })} /></div>{settingsSaved && <div className="upload-state"><CheckCircle2 size={14} />{settingsSaved}</div>}<button className="button button-primary" onClick={() => void saveSettings()}>설정 저장</button></div>
            <div className="admin-card"><div className="admin-card-head"><h3>시스템 상태</h3></div><div className="system-list">
              <SystemRow icon={Database} title="PostgreSQL + pgvector" ok={Boolean(status?.database_connected)} detail={status?.database_connected ? "연결됨" : "연결 확인 필요"} />
              <SystemRow icon={Activity} title="BGE-M3 Embedding" ok={Boolean(status?.embedding_model_loaded)} detail={status?.embedding_device || "모델 로딩 대기"} />
              <SystemRow icon={Gauge} title="BGE Reranker" ok={Boolean(status?.reranker_model_loaded)} detail={status?.reranker_device || "모델 로딩 대기"} />
              <SystemRow icon={Bot} title="Gemini Generation" ok={Boolean(status?.gemini_configured)} detail={status?.gemini_configured ? status?.gemini_model || "설정됨" : "GEMINI_API_KEY 미설정"} />
            </div></div>
          </div>}
        </div>
      </section>
    </main>
  );
}

function SystemRow({ icon: Icon, title, ok, detail }: { icon: typeof Database; title: string; ok: boolean; detail: string }) {
  return <div className="system-row"><Icon size={18} color={ok ? "#14a366" : "#98a2b3"} /><div><strong>{title}</strong><span>{detail}</span></div><span className={`badge ${ok ? "" : "processing"}`}>{ok ? "정상" : "대기"}</span></div>;
}
