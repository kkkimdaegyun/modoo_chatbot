export const API_BASE =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

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
};

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
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
