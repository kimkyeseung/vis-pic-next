import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, readSealedSession } from "@/lib/session";

// Next 16에서 middleware가 proxy로 개명됨. /admin/* 접근을 세션 게이트로 보호한다.
// 봉인 세션을 실제로 열어(검증) 판단하므로, 위조된 쿠키는 미인증으로 처리된다.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLoginPage = pathname.replace(/\/$/, "") === "/admin/login";
  const session = await readSealedSession(request.cookies.get(SESSION_COOKIE)?.value);
  const authed = !!session;

  if (!isLoginPage && !authed) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  if (isLoginPage && authed) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }
}

export const config = {
  matcher: "/admin/:path*",
};
