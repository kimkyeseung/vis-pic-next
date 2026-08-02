import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import prisma from "@/lib/db";

// POST /api/setting은 admin_session 쿠키(= AdminAccount.id)만 검사하므로
// 비밀번호 없이도 활성 관리자 id로 쿠키를 구성해 인증된 요청을 흉내낼 수 있다.
const BASE = "http://localhost:3000";
let adminCookie: string;

beforeAll(async () => {
  const admin = await prisma.adminAccount.findFirst({ where: { isActive: true } });
  if (!admin) throw new Error("테스트를 실행하려면 활성 관리자 계정이 최소 1개 필요합니다");
  adminCookie = `admin_session=${admin.id}`;
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
