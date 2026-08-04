import { describe, it, expect } from "vitest";
import { normalizeSlots, firstEmptySlot, tapPhoto } from "@/lib/slotSelection";

/**
 * 사진 선택 화면 슬롯 배치 로직. 슬롯 배열은 길이 requiredCount, 각 칸은 사진 index 또는 -1(빈칸).
 * 계약: 슬롯을 고르면 그 슬롯에 배치되고, 안 고르면 순서대로 한 칸씩 채워진다(다음 순번 이동).
 * 한 사진은 한 슬롯만 — 이미 배치된 사진을 다시 탭하면 해제된다.
 */
describe("normalizeSlots", () => {
  it("가변 길이 selectedPhotos를 길이 requiredCount 슬롯 배열로 정규화", () => {
    expect(normalizeSlots([], 4)).toEqual([-1, -1, -1, -1]);
    expect(normalizeSlots([2, 0], 4)).toEqual([2, 0, -1, -1]);
    expect(normalizeSlots([0, 1, 2, 3], 4)).toEqual([0, 1, 2, 3]);
  });

  it("음수/누락 칸은 -1로", () => {
    expect(normalizeSlots([0, -1, 3], 3)).toEqual([0, -1, 3]);
    // requiredCount보다 긴 입력은 잘라낸다
    expect(normalizeSlots([0, 1, 2, 3, 4], 3)).toEqual([0, 1, 2]);
  });
});

describe("firstEmptySlot", () => {
  it("첫 빈 슬롯 index, 모두 차 있으면 0", () => {
    expect(firstEmptySlot([-1, -1, -1, -1])).toBe(0);
    expect(firstEmptySlot([5, -1, -1, -1])).toBe(1);
    expect(firstEmptySlot([5, 3, -1, 1])).toBe(2);
    expect(firstEmptySlot([5, 3, 2, 1])).toBe(0);
  });
});

describe("tapPhoto", () => {
  it("아무 슬롯도 안 고르면 순서대로 한 칸씩 채우고 active가 다음 순번으로 이동", () => {
    let state = { slots: [-1, -1, -1, -1], activeSlot: 0 };
    state = tapPhoto(state.slots, state.activeSlot, 7);
    expect(state).toEqual({ slots: [7, -1, -1, -1], activeSlot: 1 });
    state = tapPhoto(state.slots, state.activeSlot, 3);
    expect(state).toEqual({ slots: [7, 3, -1, -1], activeSlot: 2 });
    state = tapPhoto(state.slots, state.activeSlot, 5);
    expect(state).toEqual({ slots: [7, 3, 5, -1], activeSlot: 3 });
  });

  it("고른 빈 슬롯에 배치하고 다음 순번으로 이동", () => {
    // active=2인 상태에서 사진 9 탭 → 슬롯 2에 배치, active는 3으로
    const res = tapPhoto([0, 1, -1, -1], 2, 9);
    expect(res.slots).toEqual([0, 1, 9, -1]);
    expect(res.activeSlot).toBe(3);
  });

  it("마지막 빈 슬롯을 채워도 active는 마지막에서 멈춘다", () => {
    const res = tapPhoto([0, 1, 2, -1], 3, 8);
    expect(res.slots).toEqual([0, 1, 2, 8]);
    expect(res.activeSlot).toBe(3);
  });

  it("모두 채워져도 active는 유지되고, 다른 사진을 탭하면 active 슬롯이 그 사진으로 교체된다", () => {
    // 슬롯 전부 참, active=3. 배치 안 된 사진 9 탭 → 슬롯3이 9로 교체, active는 3 유지
    const res = tapPhoto([0, 1, 2, 3], 3, 9);
    expect(res.slots).toEqual([0, 1, 2, 9]);
    expect(res.activeSlot).toBe(3);
    // 교체로 빠진 사진 3은 더 이상 어느 슬롯에도 없다
    expect(res.slots.includes(3)).toBe(false);
  });

  it("찬 active 슬롯을 교체하면 그 슬롯에 머문다(순번 이동 안 함)", () => {
    const res = tapPhoto([7, 3, 5, -1], 1, 9);
    expect(res.slots).toEqual([7, 9, 5, -1]);
    expect(res.activeSlot).toBe(1);
  });

  it("슬롯이 1개면 사진을 클릭할 때마다 슬롯 내용이 바로 교체된다(해제 불필요)", () => {
    // 빈 상태에서 사진1 → 슬롯에 들어감
    let res = tapPhoto([-1], 0, 1);
    expect(res).toEqual({ slots: [1], activeSlot: 0 });
    // 곧바로 사진2 클릭 → 해제 없이 교체
    res = tapPhoto(res.slots, res.activeSlot, 2);
    expect(res).toEqual({ slots: [2], activeSlot: 0 });
    // 다시 사진1 → 또 교체
    res = tapPhoto(res.slots, res.activeSlot, 1);
    expect(res).toEqual({ slots: [1], activeSlot: 0 });
  });

  it("한 사진은 한 슬롯만 — 다른 슬롯에 있던 사진을 active로 넣으면 옛 슬롯이 비워진다(이동)", () => {
    // 사진 5는 슬롯 2에 있음. active=0(사진 7)에서 5 탭 → 슬롯0=5, 슬롯2 비움, 7은 교체로 빠짐
    const res = tapPhoto([7, 3, 5, -1], 0, 5);
    expect(res.slots).toEqual([5, 3, -1, -1]);
    expect(res.activeSlot).toBe(0);
    expect(res.slots.filter((v) => v === 5).length).toBe(1);
  });
});
