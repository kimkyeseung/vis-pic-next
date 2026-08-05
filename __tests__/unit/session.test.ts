import { describe, it, expect, beforeAll } from "vitest";
import { sealData } from "iron-session";
import { sealAdminSession, readSealedSession, SESSION_TTL } from "@/lib/session";

/**
 * 관리자 세션 봉인. 예전에는 쿠키가 관리자 id 원문("admin_session=1")이라 위조가 자유로웠다.
 * iron-session 봉인 후에는 SESSION_PASSWORD를 아는 서버만 유효한 세션을 만들 수 있어야 한다.
 */
const PW = "unit_test_session_password_at_least_32_chars";
beforeAll(() => {
  process.env.SESSION_PASSWORD = PW;
});

describe("admin session sealing", () => {
  it("봉인→해제 왕복으로 adminId를 복원한다", async () => {
    const sealed = await sealAdminSession(42);
    expect(await readSealedSession(sealed)).toEqual({ adminId: 42 });
  });

  it("빈 값/누락은 null", async () => {
    expect(await readSealedSession(undefined)).toBeNull();
    expect(await readSealedSession(null)).toBeNull();
    expect(await readSealedSession("")).toBeNull();
  });

  it("구 방식 원문 id 위조('1','42' 등)는 거부된다", async () => {
    expect(await readSealedSession("1")).toBeNull();
    expect(await readSealedSession("42")).toBeNull();
  });

  it("변조된 봉인은 거부된다", async () => {
    const sealed = await sealAdminSession(7);
    const tampered = sealed.slice(0, 10) + (sealed[10] === "a" ? "b" : "a") + sealed.slice(11);
    expect(await readSealedSession(tampered)).toBeNull();
  });

  it("SESSION_PASSWORD를 모르면 외부에서 유효 세션을 만들 수 없다", async () => {
    const forged = await sealData({ adminId: 1 }, { password: "attacker_password_at_least_32_chars_long", ttl: SESSION_TTL });
    expect(await readSealedSession(forged)).toBeNull();
  });

  it("adminId 없는 봉인 데이터는 null", async () => {
    const noId = await sealData({ foo: "bar" }, { password: PW, ttl: SESSION_TTL });
    expect(await readSealedSession(noId)).toBeNull();
  });
});
