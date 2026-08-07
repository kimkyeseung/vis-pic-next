import { describe, it, expect } from "vitest";
import { toBankImage } from "@/lib/bankImage";

/**
 * 뱅크 목록 항목 매핑. focalX/focalY는 편집 다이얼로그(프레임 포컬)가 소비하므로 반드시 보존해야 한다.
 * 여기가 회귀하면 프레임 이름만 바꿔 저장해도 포컬이 0.5로 초기화되는 조용한 데이터 손실이 된다.
 */
describe("toBankImage", () => {
  it("focalX/focalY를 그대로 전달한다 (프레임 포컬 보존)", () => {
    const r = toBankImage({ id: 1, name: "f", filename: "f.png", focalX: 0.3, focalY: 0.7 }, 2);
    expect(r.focalX).toBe(0.3);
    expect(r.focalY).toBe(0.7);
  });

  it("focal 0(경계값)은 유지된다 — 기본값으로 대체하지 않음", () => {
    const r = toBankImage({ id: 1, name: "f", filename: "f.png", focalX: 0, focalY: 0 }, 2);
    expect(r.focalX).toBe(0);
    expect(r.focalY).toBe(0);
  });

  it("focal 누락/비수치면 0.5 기본값", () => {
    expect(toBankImage({ id: 1, name: "f", filename: "f.png" }, 2)).toMatchObject({ focalX: 0.5, focalY: 0.5 });
    // 런타임 방어: 잘못된 타입도 0.5로 폴백
    const bad = { id: 1, name: "f", filename: "f.png", focalX: null, focalY: "x" } as unknown as Parameters<typeof toBankImage>[0];
    expect(toBankImage(bad, 2)).toMatchObject({ focalX: 0.5, focalY: 0.5 });
  });

  it("deviceIds/imageType 기본값과 전달값", () => {
    expect(toBankImage({ id: 5, name: "n", filename: "x" }, 2)).toMatchObject({
      deviceIds: [],
      imageType: 2, // fallbackType 사용
    });
    expect(
      toBankImage({ id: 5, name: "n", filename: "x", deviceIds: ["d1"], imageType: 1 }, 2),
    ).toMatchObject({ deviceIds: ["d1"], imageType: 1 });
  });
});
