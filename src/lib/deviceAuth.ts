import bcrypt from "bcryptjs";

/**
 * 장치 실행 잠금 판정 결과.
 *  - { ok: true }                  → 실행 허용(비밀번호 미설정 또는 일치)
 *  - { ok: false, required: true } → 비밀번호 설정됨 + 미입력/불일치 → 입력 요구
 *  - { ok: false, required: false }→ 장치 없음/비활성 → 실행 불가
 */
export type DeviceGateResult =
  | { ok: true }
  | { ok: false; required: boolean };

/**
 * 장치 선택 시 실행 잠금을 판정한다. 라우트(verify)와 단위 테스트가 공유하는 단일 로직.
 * @param exists     장치가 존재하고 활성 상태인지
 * @param storedHash 저장된 비밀번호 bcrypt 해시(미설정이면 null/빈값)
 * @param provided   사용자가 입력한 비밀번호(없으면 "")
 */
export async function evaluateDevicePasswordGate(
  exists: boolean,
  storedHash: string | null | undefined,
  provided: string,
): Promise<DeviceGateResult> {
  if (!exists) return { ok: false, required: false };
  // 비밀번호 미설정 장치는 잠금 없이 통과
  if (!storedHash) return { ok: true };
  const match = provided.length > 0 && (await bcrypt.compare(provided, storedHash));
  return match ? { ok: true } : { ok: false, required: true };
}
