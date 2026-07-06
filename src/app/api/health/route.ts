import { NextResponse } from "next/server";

// 서버 번들의 빌드 시각. 프리플라이트가 클라이언트에 인라인된 값과 비교해
// 구버전 번들/서비스워커 캐시 불일치를 감지한다.
const BUILD_DATE = process.env.NEXT_PUBLIC_BUILD_DATE || null;

export async function GET() {
  return NextResponse.json({ status: "ok", buildDate: BUILD_DATE });
}
