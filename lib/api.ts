export const DEFAULT_BACKEND_PORT = "7127";

export type RuntimeConfig = { backendUrl?: string; backendPort?: string };

/**
 * NEXT_PUBLIC_* 는 이 스택의 브라우저 번들에 인라인되지 않는다. 그래서 layout에서
 * 서버 환경변수를 window.__ELA__ 로 심어주고 여기서 읽는다.
 */
function runtimeConfig(): RuntimeConfig {
  if (typeof window === "undefined") return {};
  return (window as unknown as { __ELA__?: RuntimeConfig }).__ELA__ || {};
}

/**
 * 브라우저가 접속한 호스트를 그대로 써서 API 주소를 만든다.
 * localhost로 고정하면 다른 PC에서 접속했을 때 그 PC 자신을 가리켜 연결이 실패한다.
 * API를 별도 도메인으로 노출하면 NEXT_PUBLIC_BACKEND_URL이 우선한다.
 */
export function apiBase(): string {
  const config = runtimeConfig();
  const configured = config.backendUrl || process.env.NEXT_PUBLIC_BACKEND_URL;
  if (configured) return configured;
  const port = config.backendPort || process.env.NEXT_PUBLIC_BACKEND_PORT || DEFAULT_BACKEND_PORT;
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:${port}`;
  }
  return `http://localhost:${port}`;
}

export type SystemStatus = {
  database_connected: boolean;
  embedding_model_loaded: boolean;
  embedding_device: string;
  reranker_model_loaded: boolean;
  reranker_device: string;
  gemini_configured: boolean;
  gemini_model: string;
  storage_available: boolean;
};

export type Source = {
  id: string;
  document_name: string;
  page_number?: number | null;
  section_title?: string | null;
  excerpt: string;
  source_type: "document" | "qa";
};

export type DocumentItem = {
  id: string;
  original_filename: string;
  status: string;
  page_count: number;
  chunk_count: number;
  created_at: string;
  progress: number;
  stage: string | null;
  error_message: string | null;
};

export type KnowledgeDocument = {
  id: string;
  original_filename: string;
  page_count: number;
  chunk_count: number;
};

export type AccountRole = "admin" | "user";

export type Account = {
  username: string;
  name: string;
  role: AccountRole;
};

export type AuthResult = {
  access_token: string;
  token_type: string;
  user: Account | null;
};

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.detail || "요청을 처리하지 못했습니다.");
  }
  return response.json() as Promise<T>;
}
