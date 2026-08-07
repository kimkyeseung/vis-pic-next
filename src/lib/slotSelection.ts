// 사진 선택 화면의 슬롯 배치 로직 (순수 함수 — 컴포넌트와 단위 테스트가 공유).
//
// 표현: `slots`는 길이 requiredCount의 배열이며 각 칸은 사진 index 또는 -1(빈칸).
// 다운스트림(FramedPreview·CompleteSection)도 슬롯 i ← selectedPhotos[i]로 읽는다.

/** selectedPhotos(가변 길이일 수 있음)를 길이 requiredCount의 슬롯 배열로 정규화(빈칸은 -1). */
export function normalizeSlots(selectedPhotos: number[], requiredCount: number): number[] {
  return Array.from({ length: requiredCount }, (_, i) => {
    const v = selectedPhotos[i];
    return v === undefined || v === null || v < 0 ? -1 : v;
  });
}

/** 첫 빈 슬롯 index. 모두 차 있으면 0. */
export function firstEmptySlot(slots: number[]): number {
  const i = slots.findIndex((v) => v < 0);
  return i < 0 ? 0 : i;
}

/**
 * 사진을 탭했을 때의 슬롯/active 갱신 — 탭한 사진을 현재 active 슬롯에 넣고(교체),
 * active를 **다음 빈 슬롯**으로 옮긴다.
 *  - 배치 후 active를 현재 슬롯 다음부터 순환 탐색해 첫 빈 슬롯으로 이동한다.
 *  - 빈 슬롯이 없으면(모두 채워짐) 현재 슬롯에 머문다 → 다른 사진 탭 시 계속 교체 가능.
 *  - 한 사진은 한 슬롯만 → 그 사진이 다른 슬롯에 있었으면 옛 슬롯을 비운다(이동).
 */
export function tapPhoto(
  slots: number[],
  activeSlot: number,
  photoIndex: number,
): { slots: number[]; activeSlot: number } {
  const n = slots.length;
  const next = slots.slice();
  // 다른 슬롯에 있던 사진이면 옛 슬롯을 비워 중복을 막는다.
  const prev = next.indexOf(photoIndex);
  if (prev >= 0 && prev !== activeSlot) next[prev] = -1;
  next[activeSlot] = photoIndex;
  // 다음 빈 슬롯으로 이동(현재 다음부터 순환 탐색). 없으면 현재 유지.
  let nextActive = activeSlot;
  for (let i = 1; i <= n; i++) {
    const idx = (activeSlot + i) % n;
    if (next[idx] < 0) { nextActive = idx; break; }
  }
  return { slots: next, activeSlot: nextActive };
}
