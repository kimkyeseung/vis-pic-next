import { describe, it, expect, beforeAll } from "vitest";
import bcrypt from "bcryptjs";
import { evaluateDevicePasswordGate } from "@/lib/deviceAuth";

/**
 * 장치 실행 잠금 판정 — 실행 시 장치를 선택할 때 비밀번호를 요구하는 보안 게이트.
 * 여기서 계약을 못 박는다: 미설정 장치는 통과, 설정 장치는 정확히 일치해야만 통과,
 * 없는 장치는 실행 불가. (verify 라우트가 이 함수를 그대로 사용)
 */
describe("evaluateDevicePasswordGate", () => {
  let hash: string;
  beforeAll(async () => {
    hash = await bcrypt.hash("sikret123", 10);
  });

  it("장치가 없으면 ok:false, required:false (실행 불가)", async () => {
    expect(await evaluateDevicePasswordGate(false, null, "")).toEqual({ ok: false, required: false });
    // 없는 장치는 어떤 비밀번호를 넣어도 통과하지 않는다
    expect(await evaluateDevicePasswordGate(false, hash, "sikret123")).toEqual({ ok: false, required: false });
  });

  it("비밀번호 미설정 장치(null/빈값)는 잠금 없이 통과", async () => {
    expect(await evaluateDevicePasswordGate(true, null, "")).toEqual({ ok: true });
    expect(await evaluateDevicePasswordGate(true, undefined, "")).toEqual({ ok: true });
    expect(await evaluateDevicePasswordGate(true, "", "")).toEqual({ ok: true });
    // 미설정이면 입력값이 있어도 통과
    expect(await evaluateDevicePasswordGate(true, null, "anything")).toEqual({ ok: true });
  });

  it("설정된 장치는 올바른 비밀번호만 통과", async () => {
    expect(await evaluateDevicePasswordGate(true, hash, "sikret123")).toEqual({ ok: true });
  });

  it("설정된 장치에 틀린/빈 비밀번호는 required:true (입력 요구)", async () => {
    expect(await evaluateDevicePasswordGate(true, hash, "wrong")).toEqual({ ok: false, required: true });
    expect(await evaluateDevicePasswordGate(true, hash, "")).toEqual({ ok: false, required: true });
    // 대소문자·공백 차이도 불일치
    expect(await evaluateDevicePasswordGate(true, hash, "SIKRET123")).toEqual({ ok: false, required: true });
    expect(await evaluateDevicePasswordGate(true, hash, " sikret123 ")).toEqual({ ok: false, required: true });
  });
});
