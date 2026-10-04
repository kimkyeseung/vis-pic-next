import { describe, it, expect } from "vitest";

// 관리자 인증 없는 설정 변경 API는 누구나 PAYMENT_ENABLED=0 등을 조작할 수 있는
// 취약점이었다. requireAdmin() 가드가 다시 빠지는 회귀를 잡기 위한 테스트.
const BASE = process.env.INTEGRATION_BASE_URL || "http://localhost:3000"; // 다른 포트로 띄웠으면 INTEGRATION_BASE_URL로 지정

describe("POST /api/setting — 관리자 인증 필요", () => {
  it("인증 쿠키 없이 요청하면 401", async () => {
    const res = await fetch(`${BASE}/api/setting/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ PROBE_UNAUTH_TEST: "1" }),
    });
    expect(res.status).toBe(401);
  });

  it("인증 없는 요청은 값이 저장되지 않는다", async () => {
    const key = `PROBE_UNAUTH_${Date.now()}`;
    await fetch(`${BASE}/api/setting/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: "should-not-persist" }),
    });

    const res = await fetch(`${BASE}/api/setting/`);
    const data = await res.json();
    expect(data.settings[key]).toBeUndefined();
  });
});

describe("POST /api/device/[deviceId]/settings — 관리자 인증 필요", () => {
  it("인증 쿠키 없이 요청하면 401", async () => {
    const res = await fetch(`${BASE}/api/device/test/settings/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ PROBE_UNAUTH_TEST: "1" }),
    });
    expect(res.status).toBe(401);
  });

  it("인증 없는 요청은 값이 저장되지 않는다", async () => {
    const key = `PROBE_UNAUTH_${Date.now()}`;
    await fetch(`${BASE}/api/device/test/settings/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: "should-not-persist" }),
    });

    const res = await fetch(`${BASE}/api/device/test/settings/`);
    const data = await res.json();
    expect(data.settings?.[key]).toBeUndefined();
  });
});

describe("GET /api/setting, GET /api/device/[deviceId]/settings — 키오스크 조회는 인증 불필요", () => {
  it("GET /api/setting은 인증 없이 200", async () => {
    const res = await fetch(`${BASE}/api/setting/`);
    expect(res.status).toBe(200);
  });

  it("GET /api/device/[deviceId]/settings은 인증 없이 200", async () => {
    const res = await fetch(`${BASE}/api/device/test/settings/`);
    expect(res.status).toBe(200);
  });
});

describe("GET /api/devices — 키오스크 장치 선택용 공개 목록", () => {
  it("인증 없이 200을 반환한다", async () => {
    const res = await fetch(`${BASE}/api/devices/`);
    expect(res.status).toBe(200);
  });

  it("각 항목은 deviceId·name·hasPassword만 노출한다 (비밀번호 해시·isActive 등 내부 필드 미노출)", async () => {
    const res = await fetch(`${BASE}/api/devices/`);
    const data = await res.json();
    expect(Array.isArray(data.devices)).toBe(true);
    for (const d of data.devices) {
      expect(typeof d.deviceId).toBe("string");
      expect(typeof d.name).toBe("string");
      expect(typeof d.hasPassword).toBe("boolean"); // 실행 비밀번호 입력창을 띄울지 판단용(해시는 내보내지 않음)
      expect(Object.keys(d).sort()).toEqual(["deviceId", "hasPassword", "name"]);
    }
  });

  it("관리자 전용 /api/admin/devices는 여전히 인증이 필요하다 (대조군)", async () => {
    const res = await fetch(`${BASE}/api/admin/devices/`);
    expect(res.status).toBe(401);
  });
});
