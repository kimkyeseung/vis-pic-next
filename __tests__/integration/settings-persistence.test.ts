import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import prisma from "@/lib/db";
import { SESSION_COOKIE, sealAdminSession } from "@/lib/session";

// 관리자 세션은 iron-session 봉인 쿠키다 — 서버와 같은 SESSION_PASSWORD(.env)로 활성 관리자 id를 봉인해
// 비밀번호 로그인 없이 인증된 요청을 만든다. (예전엔 쿠키 값이 관리자 id 원문이라 그대로 넣었다.)
const BASE = process.env.INTEGRATION_BASE_URL || "http://localhost:3000"; // 다른 포트로 띄웠으면 INTEGRATION_BASE_URL로 지정
let adminCookie: string;

beforeAll(async () => {
  const admin = await prisma.adminAccount.findFirst({ where: { isActive: true } });
  if (!admin) throw new Error("테스트를 실행하려면 활성 관리자 계정이 최소 1개 필요합니다");
  adminCookie = `${SESSION_COOKIE}=${await sealAdminSession(admin.id)}`;
});

afterAll(async () => {
  await prisma.$disconnect();
});

// 회귀 대상: POST /api/setting이 upsert만 지원해 인쇄 배경(PRINT_BACKGROUND)을
// 관리자 화면에서 제거해도 저장 후 새로고침하면 되살아나던 버그.
describe("POST /api/setting — null 값은 설정을 삭제한다", () => {
  const KEY = `PROBE_DELETE_${Date.now()}`;

  afterAll(async () => {
    await prisma.setting.deleteMany({ where: { name: KEY } });
  });

  it("먼저 문자열 값으로 저장된다", async () => {
    const res = await fetch(`${BASE}/api/setting/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ [KEY]: "some-filename.jpg" }),
    });
    expect(res.status).toBe(200);

    const data = await (await fetch(`${BASE}/api/setting/`)).json();
    expect(data.settings[KEY]).toBe("some-filename.jpg");
  });

  it("같은 키에 null을 보내면 삭제되어 이후 GET에서 사라진다", async () => {
    const res = await fetch(`${BASE}/api/setting/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ [KEY]: null }),
    });
    expect(res.status).toBe(200);

    const data = await (await fetch(`${BASE}/api/setting/`)).json();
    expect(data.settings[KEY]).toBeUndefined();
  });
});

describe("POST /api/setting — 관리자 인증 시 정상 저장 (대조군)", () => {
  const KEY = `PROBE_SAVE_${Date.now()}`;

  afterAll(async () => {
    await prisma.setting.deleteMany({ where: { name: KEY } });
  });

  it("200과 함께 값이 저장된다", async () => {
    const res = await fetch(`${BASE}/api/setting/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ [KEY]: "value" }),
    });
    expect(res.status).toBe(200);

    const data = await (await fetch(`${BASE}/api/setting/`)).json();
    expect(data.settings[KEY]).toBe("value");
  });
});
