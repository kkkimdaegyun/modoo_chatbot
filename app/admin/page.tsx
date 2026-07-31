"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity, Bot, CheckCircle2, CircleAlert, FileText, LoaderCircle, LogOut,
  MessageCircle, RefreshCw, ShieldCheck, Trash2, UploadCloud, UserRound,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Account, ApiError, apiFetch, apiBase, AuthResult, DocumentItem, SystemStatus } from "../../lib/api";

const loginSchema = z.object({
  username: z.string().min(1, "아이디를 입력해 주세요."),
  password: z.string().min(1, "비밀번호를 입력해 주세요."),
});
type LoginForm = z.infer<typeof loginSchema>;

const TOKEN_KEY = "ela_admin_token";
const ACCOUNT_KEY = "ela_admin_account";
const ACCEPT_EXTENSIONS = [".pdf", ".docx", ".txt", ".md", ".csv", ".xlsx", ".json"];
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

type UploadProgress = { index: number; total: number; name: string; percent: number };

/**
 * fetch 는 업로드 진행률을 알려주지 않아서 이 요청만 XMLHttpRequest 로 보낸다.
 * register 로 넘긴 요청 객체는 "취소" 버튼이 abort 할 수 있게 바깥에 보관한다.
 */
function uploadFile(
  file: File,
  token: string,
  onProgress: (percent: number) => void,
  register: (request: XMLHttpRequest | null) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    register(request);
    request.open("POST", `${apiBase()}/api/documents/upload`);
    if (token) request.setRequestHeader("Authorization", `Bearer ${token}`);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      register(null);
      if (request.status >= 200 && request.status < 300) {
        resolve();
        return;
      }
      let detail = `${file.name} 업로드에 실패했습니다.`;
      try {
        detail = JSON.parse(request.responseText)?.detail || detail;
      } catch {
        // 서버가 JSON 이 아닌 응답을 준 경우엔 기본 문구를 쓴다.
      }
      reject(new Error(detail));
    };
    request.onerror = () => { register(null); reject(new Error("네트워크 오류로 업로드가 중단되었습니다.")); };
    request.onabort = () => { register(null); reject(new Error("업로드를 취소했습니다.")); };
    const data = new FormData();
    data.append("file", file);
    request.send(data);
  });
}

/** 올릴 수 없는 파일이면 고객사가 바로 이해할 수 있는 이유를 돌려준다. */
function rejectReason(file: File): string | null {
  if (!ACCEPT_EXTENSIONS.some((extension) => file.name.toLowerCase().endsWith(extension))) {
    return `${file.name} 은(는) 지원하지 않는 형식입니다. PDF, DOCX, TXT, MD, CSV, XLSX, JSON 파일만 올릴 수 있어요.`;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `${file.name} 은(는) ${(file.size / 1024 / 1024).toFixed(1)}MB 로 최대 50MB를 넘습니다.`;
  }
  return null;
}

function Brand() {
  return <Link className="brand" href="/"><span className="brand-mark"><MessageCircle size={18} /></span><span>ELA Chatbot</span></Link>;
}

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [account, setAccount] = useState<Account | null>(null);
  const [loginError, setLoginError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploadLabel, setUploadLabel] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const uploadRequestRef = useRef<XMLHttpRequest | null>(null);
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
    // 토큰이 만료·폐기됐을 때(401)만 세션을 버린다.
    // 서버 재시작 같은 일시적 통신 오류로 로그인 화면으로 튕기면 작업 중이던 내용을 잃는다.
    if (!meQuery.isError) return;
    if (!(meQuery.error instanceof ApiError) || meQuery.error.status !== 401) return;
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(ACCOUNT_KEY);
    setToken("");
    setAccount(null);
    setLoginError("세션이 만료되었습니다. 다시 로그인해 주세요.");
  }, [meQuery.isError, meQuery.error]);
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
    const list = Array.from(files);
    // 서버까지 보내고 나서 거절당하면 큰 파일일수록 기다린 시간이 아까우니 미리 걸러낸다.
    const blocked = list.map(rejectReason).find(Boolean);
    if (blocked) {
      setProgress(null);
      setUploadLabel("");
      setUploadError(blocked);
      return;
    }
    setUploadError("");
    setUploadLabel("");
    try {
      for (const [index, file] of list.entries()) {
        const base = { index: index + 1, total: list.length, name: file.name };
        setProgress({ ...base, percent: 0 });
        await uploadFile(
          file,
          token,
          (percent) => setProgress({ ...base, percent }),
          (request) => { uploadRequestRef.current = request; },
        );
      }
      setProgress(null);
      setUploadLabel(`${list.length}개 문서 분석을 시작했습니다. 왼쪽 목록에서 진행률을 확인하세요.`);
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
    } catch (error) {
      setProgress(null);
      setUploadLabel("");
      setUploadError(error instanceof Error ? error.message : "업로드에 실패했습니다.");
      // 도중에 끊겼어도 이미 올라간 파일은 목록에 보여야 한다.
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
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
            <span className="account-pill" title="로그인한 계정"><UserRound size={13} />{account.name || account.username}</span>
            <Link className="button button-secondary button-compact" href="/"><Bot size={15} /> 챗봇 열기</Link>
            <button className="button button-secondary button-compact" onClick={logout}><LogOut size={14} /> 로그아웃</button>
          </div>
        </header>
        <div className="admin-content">
          <div className="admin-heading">
            <div><h2>문서 관리</h2><p>업로드한 문서의 분석 상태를 확인하고 관리합니다.</p></div>
          </div>

            <div className="stats-grid">
              <div className="stat-card"><span>연결 문서</span><strong>{documents.length}</strong><small>{readyDocs}개 답변 가능</small></div>
              <div className="stat-card"><span>분석된 문단</span><strong>{totalChunks.toLocaleString()}</strong><small>검색 가능한 단위</small></div>
              <div className="stat-card"><span>총 페이지</span><strong>{totalPages.toLocaleString()}</strong><small>분석 완료된 분량</small></div>
              <div className="stat-card"><span>API 연결 상태</span><strong>{status?.gemini_configured ? "정상" : "미설정"}</strong><small>{status?.gemini_configured ? "답변 생성 준비 완료" : "환경변수 확인 필요"}</small></div>
              <div className="stat-card"><span>답변 시간</span><strong>{status?.answer_seconds_avg ? `${status.answer_seconds_avg}초 이내` : "측정 전"}</strong><small>{status?.answer_samples ? `최근 ${status.answer_samples}건 평균` : "질문이 들어오면 측정됩니다"}</small></div>
              <div className="stat-card"><span>운영 시간</span><strong>24/7</strong><small>{status?.database_connected ? "정상 운영 중" : "연결 확인 필요"}</small></div>
            </div>
            <div className="admin-grid">
              <div className="admin-card">
                <div className="admin-card-head"><h3>연결된 문서 <em>{documents.length}</em></h3><button className="icon-button" aria-label="문서 새로고침" onClick={() => void documentsQuery.refetch()}><RefreshCw size={14} /></button></div>
                {documentsQuery.isError && <div className="form-error">백엔드에 연결할 수 없습니다. Docker 서비스 상태를 확인해 주세요.</div>}
                <div className="table-scroll">
                  <table className="document-table"><thead><tr><th>문서</th><th>처리 상태</th><th>페이지</th><th>문단</th><th>작업</th></tr></thead><tbody>
                    {documents.map((document) => <tr key={document.id}><td><span className="document-name"><FileText size={16} color="#2864f0" /><span title={document.original_filename}>{document.original_filename}</span></span></td><td><DocumentStatus document={document} /></td><td>{document.page_count || "—"}</td><td>{document.chunk_count || "—"}</td><td><div className="table-actions"><button className="icon-button" aria-label="재인덱싱" onClick={() => void reindexDocument(document.id)}><RefreshCw size={13} /></button><button className="icon-button" aria-label="문서 삭제" onClick={() => void removeDocument(document.id)}><Trash2 size={13} /></button></div></td></tr>)}
                    {!documents.length && !documentsQuery.isLoading && <tr><td colSpan={5}>연결된 문서가 없습니다. 오른쪽에서 첫 문서를 업로드하세요.</td></tr>}
                  </tbody></table>
                </div>
              </div>
              <div className="admin-card">
                <div className="admin-card-head"><h3>새 문서 업로드</h3></div>
                <label
                  className={`dropzone ${dragging ? "dragging" : ""}`}
                  onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => { event.preventDefault(); setDragging(false); void upload(event.dataTransfer.files); }}
                >
                  <UploadCloud size={44} />
                  <strong>파일을 여기에 끌어다 놓거나</strong>
                  <span className="button button-primary upload-pick">파일 선택</span>
                  <small>PDF, DOCX, TXT, MD, CSV, XLSX, JSON · 파일당 최대 50MB</small>
                  {/* 화면에서는 숨기되 키보드 탭으로는 닿을 수 있어야 해서 display:none 을 쓰지 않는다. */}
                  <input
                    type="file"
                    multiple
                    accept={ACCEPT_EXTENSIONS.join(",")}
                    onChange={(event) => {
                      const input = event.target;
                      void upload(input.files).finally(() => { input.value = ""; });
                    }}
                  />
                </label>
                {progress && (
                  <div className="upload-progress">
                    <div className="upload-progress-head">
                      <span title={progress.name}>{progress.total > 1 ? `${progress.index}/${progress.total} · ` : ""}{progress.name}</span>
                      <strong>{progress.percent >= 100 ? "확인 중" : `${progress.percent}%`}</strong>
                      <button type="button" onClick={() => uploadRequestRef.current?.abort()}>취소</button>
                    </div>
                    <div className="progress-track"><div className="progress-fill" style={{ width: `${progress.percent}%` }} /></div>
                  </div>
                )}
                {uploadLabel && <div className="upload-state"><Activity size={14} /> {uploadLabel}</div>}
                {uploadError && <div className="form-error upload-error" role="alert">{uploadError}</div>}
              </div>
            </div>
        </div>
      </section>
    </main>
  );
}

function DocumentStatus({ document }: { document: DocumentItem }) {
  if (document.status === "ready") {
    return <span className="badge"><CheckCircle2 size={11} />학습 완료</span>;
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
