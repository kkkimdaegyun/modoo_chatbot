"use client";

import { useEffect, useState } from "react";
import { Account, basePath } from "./api";

export const TOKEN_KEY = "ela_admin_token";
export const ACCOUNT_KEY = "ela_admin_account";

export function readToken(): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(TOKEN_KEY) || "";
}

export function readAccount(): Account | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(ACCOUNT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Account;
  } catch {
    return null;
  }
}

export function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(ACCOUNT_KEY);
}

/**
 * 위젯 안내·서비스 소개처럼 고객에게는 보일 필요가 없는 화면을 가린다.
 * 브라우저에서만 판단하므로 접근 통제가 아니라 화면 정리 목적이다.
 * 두 화면 모두 문서 내용이나 계정 정보를 담지 않으므로 이 수준으로 충분하고,
 * 실제 데이터는 서버에서 Bearer 토큰으로 막는다.
 */
export function useAdminOnly(): "checking" | "allowed" {
  const [state, setState] = useState<"checking" | "allowed">("checking");
  useEffect(() => {
    if (readToken()) {
      setState("allowed");
      return;
    }
    // 서브패스(/leehk 등)로 서비스하면 그 앞자리를 붙여야 로그인 화면으로 간다.
    window.location.replace(`${basePath()}/admin`);
  }, []);
  return state;
}
