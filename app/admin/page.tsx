"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity, Bot, CheckCircle2, CircleAlert, FileText, LoaderCircle, LogOut,
  MessageCircle, RefreshCw, ShieldCheck, Trash2, UploadCloud,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Account, apiFetch, apiBase, AuthResult, DocumentItem, SystemStatus } from "../../lib/api";

const loginSchema = z.object({
  username: z.string().min(1, "아이디를 입력해 주세요."),
  password: z.string().min(1, "비밀번호를 입력해 주세요."),
});
type LoginForm = z.infer<typeof loginSchema>;
type QaItem = { id: string; question: string; answer: string; category: string; is_active: boolean };

const TOKEN_KEY = "ela_admin_token";
const ACCOUNT_KEY = "ela_admin_account";

function Brand() {
  return <Link className="brand" href="/"><span className="brand-mark"><MessageCircle size={18} /></span><span>ELA Chatbot</span></Link>;
}

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [account, setAccount] = useState<Account | null>(null);
  const [loginError, setLoginError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploadLabel, setUploadLabel] = useState("");
  const queryClient = useQueryClient();
  const form = useForm<LoginForm>({ resolver: zodResolver(loginSchema), defaultValues: { username: "", password: "" } });

  useEffect(() => {
    const savedToken = sessionStorage.getItem(TOKEN_KEY);
    const savedAccount = sessionStorage.getItem(ACCOUNT_KEY);
    if (savedToken) setToken(savedToken);
    if (savedAccount) setAccount(JSON.parse(savedAccount) as Account);
  }, []);

  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const isAdmin = account?.role === "admin";
  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<Account>("/api/auth/me", { headers: authHeaders }),
    enabled: Boolean(token),
    retry: false,
  });
  useEffect(() => {
    if (!meQuery.data) return;
    setAccount(meQuery.data);
    sessionStorage.setItem(ACCOUNT_KEY, JSON.stringify(meQuery.data));
  }, [meQuery.data]);
  useEffect(() => {
    // 토큰이 만료·폐기됐으면 저장된 세션을 버리고 로그인 화면으로 되돌린다.
    if (!meQuery.isError) return;
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(ACCOUNT_KEY);
    setToken("");
    setAccount(null);
    setLoginError("세션이 만료되었습니다. 다시 로그인해 주세요.");
  }, [meQuery.isError]);
  const statusQuery = useQuery({
    queryKey: ["system-status"],
    queryFn: () => apiFetch<SystemStatus>("/api/system/status"),
    enabled: Boolean(token),
    refetchInterval: 20_000,
  });
  const documentsQuery = useQuery({
    queryKey: ["documents"],
    queryFn: () => apiFetch<DocumentItem[]>("/api/documents", { headers: authHeaders }),
    enabled: Boolean(token) && isAdmin,
    // 처리 중인 문서가 있으면 진행률이 움직이도록 계속 새로 받아온다.
    refetchInterval: (query) =>
      (query.state.data || []).some((item) => item.status !== "ready" && item.status !== "failed") ? 3_000 : false,
  });
  const qaQuery = useQuery({
    queryKey: ["qa"],
    queryFn: () => apiFetch<QaItem[]>("/api/qa", { headers: authHeaders }),
    enabled: Boolean(token) && isAdmin,
  });

  function applyAuth(result: AuthResult) {
    sessionStorage.setItem(TOKEN_KEY, result.access_token);
    setToken(result.access_token);
    if (result.user) {
      sessionStorage.setItem(ACCOUNT_KEY, JSON.stringify(result.user));
      setAccount(result.user);
    }
  }

  async function login(values: LoginForm) {
    setLoginError("");
    try {
      applyAuth(await apiFetch<AuthResult>("/api/auth/login", { method: "POST", body: JSON.stringify(values) }));
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
        const response = await fetch(`${apiBase()}/api/documents/upload`, { method: "POST", body: data, headers: authHeaders });
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


  function logout() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(ACCOUNT_KEY);
    setToken("");
    setAccount(null);
    queryClient.clear();
  }

  if (!token) {
    return (
      <main className="login-page">
        <form className="login-card" onSubmit={form.handleSubmit(login)}>
          <Brand />
          <h1>관리자 로그인</h1>
          <p>발급받은 아이디로 로그인하세요.</p>
          {loginError && <div className="form-error" role="alert">{loginError}</div>}
          <div className="field"><label htmlFor="username">아이디</label><input id="username" autoComplete="username" {...form.register("username")} />{form.formState.errors.username && <small>{form.formState.errors.username.message}</small>}</div>
          <div className="field"><label htmlFor="password">비밀번호</label><input id="password" type="password" autoComplete="current-password" {...form.register("password")} />{form.formState.errors.password && <small>{form.formState.errors.password.message}</small>}</div>
          <button className="button button-primary full" type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? <LoaderCircle className="loading-ring" size={17} /> : <ShieldCheck size={17} />} 로그인</button>
        </form>
      </main>
    );
  }

  if (account && !isAdmin) {
    return (
      <main className="login-page">
        <div className="login-card">
          <Brand /><h1>관리자 권한이 필요합니다</h1>
          <p><strong>{account.username}</strong> 계정은 일반 사용자입니다. 관리자 권한이 필요하면 담당자에게 요청하세요.</p>
          <Link className="button button-primary full" href="/"><Bot size={17} /> 챗봇으로 돌아가기</Link>
          <button className="button button-secondary full" onClick={logout}><LogOut size={16} /> 다른 계정으로 로그인</button>
        </div>
      </main>
    );
  }

  if (!account) {
    return <main className="login-page"><div className="login-card"><Brand /><h1>계정 확인 중</h1><p>권한을 확인하고 있습니다.</p><LoaderCircle className="loading-ring" size={22} /></div></main>;
  }

  const documents = documentsQuery.data || [];
  const qas = qaQuery.data || [];
  const status = statusQuery.data;
  const readyDocs = documents.filter((item) => item.status === "ready").length;
  const totalChunks = documents.reduce((sum, item) => sum + item.chunk_count, 0);
  const totalPages = documents.reduce((sum, item) => sum + item.page_count, 0);

  return (
    <main className="app-shell">
      <section className="app-main admin-solo">
        <header className="app-topbar">
          <Brand />
          <div className="topbar-actions">
            <span className="status-pill live"><i className="status-dot" />시스템 운영 중</span>
            <span className="account-pill"><ShieldCheck size={13} />{account.name || account.username}</span>
            <Link className="button button-secondary button-compact" href="/"><Bot size={15} /> 챗봇 열기</Link>
            <button className="button button-secondary button-compact" onClick={logout}><LogOut size={14} /> 로그아웃</button>
          </div>
        </header>
        <div className="admin-content">
          <div className="admin-heading">
            <div><h2>문서 관리</h2><p>업로드한 문서의 분석·임베딩 상태를 확인하고 관리합니다.</p></div>
          </div>

            <div className="stats-grid">
              <div className="stat-card"><span>연결 문서</span><strong>{documents.length}</strong><small>{readyDocs}개 답변 가능</small></div>
              <div className="stat-card"><span>지식 청크</span><strong>{totalChunks.toLocaleString()}</strong><small>BGE-M3 임베딩</small></div>
              <div className="stat-card"><span>구조화 QA</span><strong>{qas.length}</strong><small>우선 검색 대상</small></div>
              <div className="stat-card"><span>Gemini 연결</span><strong>{status?.gemini_configured ? "정상" : "미설정"}</strong><small>{status?.gemini_model || "환경변수 확인"}</small></div>
            </div>
            <div className="stats-grid">
              <div className="stat-card"><span>총 페이지</span><strong>{totalPages.toLocaleString()}</strong><small>인덱싱된 문서 분량</small></div>
              <div className="stat-card"><span>임베딩 엔진</span><strong>{status?.embedding_model_loaded ? (status?.embedding_device || "cpu").toUpperCase() : "대기"}</strong><small>{status?.embedding_model_loaded ? "모델 로드 완료" : "첫 요청 시 로드"}</small></div>
              <div className="stat-card"><span>리랭커</span><strong>{status?.reranker_model_loaded ? (status?.reranker_device || "cpu").toUpperCase() : "대기"}</strong><small>{status?.reranker_model_loaded ? "모델 로드 완료" : "첫 요청 시 로드"}</small></div>
              <div className="stat-card"><span>운영 시간</span><strong>24/7</strong><small>{status?.database_connected ? "DB 연결 정상" : "DB 연결 확인 필요"}</small></div>
            </div>
            <div className="admin-grid">
              <div className="admin-card">
                <div className="admin-card-head"><h3>연결된 문서</h3><button className="icon-button" aria-label="문서 새로고침" onClick={() => void documentsQuery.refetch()}><RefreshCw size={14} /></button></div>
                {documentsQuery.isError && <div className="form-error">백엔드에 연결할 수 없습니다. Docker 서비스 상태를 확인해 주세요.</div>}
                <table className="document-table"><thead><tr><th>문서</th><th>처리 상태</th><th>페이지</th><th>청크</th><th>작업</th></tr></thead><tbody>
                  {documents.map((document) => <tr key={document.id}><td><span className="document-name"><FileText size={15} color="#2864f0" />{document.original_filename}</span></td><td><DocumentStatus document={document} /></td><td>{document.page_count || "—"}</td><td>{document.chunk_count || "—"}</td><td><div className="table-actions"><button className="icon-button" aria-label="재인덱싱" onClick={() => void reindexDocument(document.id)}><RefreshCw size={13} /></button><button className="icon-button" aria-label="문서 삭제" onClick={() => void removeDocument(document.id)}><Trash2 size={13} /></button></div></td></tr>)}
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
        </div>
      </section>
    </main>
  );
}

function DocumentStatus({ document }: { document: DocumentItem }) {
  if (document.status === "ready") {
    return <span className="badge"><CheckCircle2 size={11} />지식 반영 완료</span>;
  }
  if (document.status === "failed") {
    return <span className="badge failed" title={document.error_message || undefined}><CircleAlert size={11} />{document.stage || "처리 실패"}</span>;
  }
  return (
    <div className="progress-cell">
      <div className="progress-head">
        <LoaderCircle className="loading-ring" size={11} />
        <span>{document.stage || "대기 중"}</span>
        <strong>{document.progress}%</strong>
      </div>
      <div className="progress-track"><div className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, document.progress))}%` }} /></div>
    </div>
  );
}
