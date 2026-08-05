import { sealData, unsealData } from "iron-session";

// 관리자 세션 — iron-session으로 암호화·서명한 스테이트리스 쿠키.
// 예전에는 쿠키 값이 관리자 id 원문("admin_session=1")이라 누구나 위조 가능했다.
// 이제 SESSION_PASSWORD로 봉인(seal)하므로 서버 비밀 없이는 유효한 세션을 만들 수 없다.
//
// ⚠️ next/headers에 의존하지 않는다(순수) — Next 16 proxy(구 middleware)에서도 import 가능해야 하므로.

export const SESSION_COOKIE = "admin_session";
// 봉인 만료(초) = 쿠키 maxAge와 동일(24시간).
export const SESSION_TTL = 60 * 60 * 24;

export interface AdminSession {
  adminId: number;
}

/** SESSION_PASSWORD env(32자 이상)를 강제. 미설정이면 로그인/검증이 실패하도록 fail-loud. */
function sessionPassword(): string {
  const pw = process.env.SESSION_PASSWORD;
  if (!pw || pw.length < 32) {
    throw new Error("SESSION_PASSWORD 환경변수를 32자 이상으로 설정해야 합니다.");
  }
  return pw;
}

/** 관리자 세션을 봉인해 쿠키에 넣을 문자열로 만든다. */
export async function sealAdminSession(adminId: number): Promise<string> {
  return sealData({ adminId }, { password: sessionPassword(), ttl: SESSION_TTL });
}

/**
 * 쿠키 값(봉인 문자열)을 열어 유효한 관리자 세션이면 반환, 아니면 null.
 * 위조·변조·만료·잘못된 password는 모두 adminId 없는 빈 데이터로 나오므로 null 처리된다.
 */
export async function readSealedSession(sealed: string | undefined | null): Promise<AdminSession | null> {
  if (!sealed) return null;
  try {
    const data = await unsealData<Partial<AdminSession>>(sealed, {
      password: sessionPassword(),
      ttl: SESSION_TTL,
    });
    return typeof data?.adminId === "number" ? { adminId: data.adminId } : null;
  } catch {
    return null;
  }
}

/** 세션 쿠키 옵션. Tauri 임베디드 HTTP 서버 때문에 Secure는 COOKIE_SECURE=true일 때만 켠다. */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax" as const,
    maxAge: SESSION_TTL,
    path: "/",
  };
}
