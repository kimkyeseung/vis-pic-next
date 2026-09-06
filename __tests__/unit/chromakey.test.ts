import { describe, it, expect } from "vitest";
import { applyChromaKey } from "@/lib/chromakey";

// 단일 픽셀 RGBA 배열을 만들어 키잉 결과를 검사하기 위한 헬퍼
function px(r: number, g: number, b: number): Uint8ClampedArray {
  return new Uint8ClampedArray([r, g, b, 255]);
}

const GREEN = { r: 0, g: 255, b: 0 };

describe("applyChromaKey — 기본 키잉(스필·침식 없음)", () => {
  it("키 색과 일치하는 픽셀은 완전 투명(alpha 0)이 된다", () => {
    const d = px(0, 255, 0);
    applyChromaKey(d, 1, 1, GREEN, 50, 50, 0, 0);
    expect(d[3]).toBe(0);
  });

  it("키 색과 충분히 먼 픽셀은 불투명(alpha 255)으로 유지된다", () => {
    const d = px(220, 60, 60); // 빨강 계열 — 초록에서 멀다
    applyChromaKey(d, 1, 1, GREEN, 50, 50, 0, 0);
    expect(d[3]).toBe(255);
  });

  it("스필=0이면 색상 채널을 건드리지 않는다", () => {
    const d = px(200, 180, 120);
    applyChromaKey(d, 1, 1, GREEN, 50, 50, 0, 0);
    expect([d[0], d[1], d[2]]).toEqual([200, 180, 120]);
  });
});

describe("applyChromaKey — 스필 제거", () => {
  it("남은 인물 픽셀에서 우세 채널(초록)을 나머지 두 채널 최댓값으로 눌러낸다(강도 100)", () => {
    // 초록이 튀는 살구색 픽셀(테두리 초록 번짐). r=200,b=120 → otherMax=200.
    const d = px(200, 240, 120);
    applyChromaKey(d, 1, 1, GREEN, 50, 50, 100, 0);
    expect(d[3]).toBe(255);      // 키잉으로 지워지진 않음
    expect(d[1]).toBe(200);      // 초록이 max(r,b)=200 까지 눌림
  });

  it("우세 채널이 이미 나머지보다 작으면 스필이 색을 바꾸지 않는다", () => {
    const d = px(200, 100, 150); // g=100 < max(r,b)=200
    applyChromaKey(d, 1, 1, GREEN, 50, 50, 100, 0);
    expect(d[1]).toBe(100);
  });

  it("블루스크린이면 파랑 채널을 눌러낸다", () => {
    const BLUE = { r: 0, g: 0, b: 255 };
    const d = px(180, 120, 240); // b가 튐, otherMax=180
    applyChromaKey(d, 1, 1, BLUE, 50, 50, 100, 0);
    expect(d[2]).toBe(180);
  });
});

describe("applyChromaKey — 경계 침식(choke)", () => {
  it("반경이 0보다 크면 불투명 픽셀이 투명 이웃 쪽으로 깎인다", () => {
    // 4×1 가로줄: [불투명, 불투명, 불투명, 투명]. 침식하면 투명(3)에 인접한 불투명 픽셀들이 0이 된다.
    const w = 400, h = 1; // 폭을 크게 잡아 choke=100에서 반경 ≥1 이 되게 한다
    const data = new Uint8ClampedArray(w * h * 4);
    for (let x = 0; x < w; x++) {
      data[x * 4] = 128; data[x * 4 + 1] = 128; data[x * 4 + 2] = 128;
      // 오른쪽 절반을 투명(배경)으로
      data[x * 4 + 3] = x < w / 2 ? 255 : 0;
    }
    applyChromaKey(data, w, h, GREEN, 50, 50, 0, 100);
    // 경계(중앙) 바로 왼쪽 불투명 픽셀은 투명 이웃 때문에 깎여 0이 되어야 한다.
    const edge = Math.floor(w / 2) - 1;
    expect(data[edge * 4 + 3]).toBe(0);
    // 왼쪽 끝(경계에서 먼 곳)은 여전히 불투명하게 남는다.
    expect(data[0 * 4 + 3]).toBe(255);
  });

  it("choke=0이면 알파를 그대로 둔다", () => {
    const w = 10, h = 1;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let x = 0; x < w; x++) {
      data[x * 4 + 3] = x < 5 ? 255 : 0;
    }
    applyChromaKey(data, w, h, GREEN, 50, 50, 0, 0);
    expect(data[4 * 4 + 3]).toBe(255); // 경계 왼쪽 불투명 유지
  });
});

describe("applyChromaKey — 밝기 무시 키잉", () => {
  it("그늘진 초록(어두운 같은 색)은 RGB 모드에선 안 빠지지만 밝기 무시 모드에선 빠진다", () => {
    // 어두운 초록: 밝은 키(0,255,0)와 색은 같지만 밝기가 낮다.
    const rgb = () => new Uint8ClampedArray([0, 40, 0, 255]);

    const off = rgb();
    applyChromaKey(off, 1, 1, GREEN, 50, 50, 0, 0, false);
    expect(off[3]).toBe(255); // RGB 모드: 거리가 멀어 남음

    const on = rgb();
    applyChromaKey(on, 1, 1, GREEN, 50, 50, 0, 0, true);
    expect(on[3]).toBe(0); // 밝기 무시 모드: 같은 색으로 정규화되어 제거
  });

  it("밝기 무시 모드에서도 무채색(회색)은 키 색이 아니므로 제거되지 않는다", () => {
    const gray = new Uint8ClampedArray([100, 100, 100, 255]);
    applyChromaKey(gray, 1, 1, GREEN, 50, 50, 0, 0, true);
    expect(gray[3]).toBe(255);
  });
});
