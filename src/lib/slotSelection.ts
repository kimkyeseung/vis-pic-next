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
 * 사진을 탭했을 때의 슬롯/active 갱신 — 탭한 사진을 현재 active 슬롯에 넣는다(교체).
 *  - 빈 active 슬롯을 채운 경우 → 다음 순번 슬롯으로 이동(순차 채움, 마지막이면 멈춤).
 *  - 이미 찬 active 슬롯을 교체한 경우 → 그 슬롯에 머문다(슬롯이 다 차 있어도 계속 교체 가능).
 *  - 한 사진은 한 슬롯만 → 그 사진이 다른 슬롯에 있었으면 옛 슬롯을 비운다(이동).
 */
export function tapPhoto(
  slots: number[],
  activeSlot: number,
  photoIndex: number,
): { slots: number[]; activeSlot: number } {
  const requiredCount = slots.length;
  const next = slots.slice();
  const wasFilled = next[activeSlot] >= 0;
  // 다른 슬롯에 있던 사진이면 옛 슬롯을 비워 중복을 막는다.
  const prev = next.indexOf(photoIndex);
  if (prev >= 0 && prev !== activeSlot) next[prev] = -1;
  next[activeSlot] = photoIndex;
  const nextActive = wasFilled ? activeSlot : Math.min(activeSlot + 1, requiredCount - 1);
  return { slots: next, activeSlot: nextActive };
}
