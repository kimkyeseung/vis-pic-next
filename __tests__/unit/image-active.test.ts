import { describe, it, expect, beforeEach, vi } from "vitest";
import { BACKGROUND_IMAGE_TYPE, MAX_ACTIVE_BACKGROUNDS } from "@/constants/images";

// prisma(@/lib/db 기본 export)를 목으로 대체 — DB 없이 불변식 로직만 검증.
const { countMock } = vi.hoisted(() => ({ countMock: vi.fn() }));
vi.mock("@/lib/db", () => ({ default: { image: { count: countMock } } }));

import { defaultActiveForNewImage } from "@/lib/imageActive";

/**
 * "활성 배경 최대 MAX_ACTIVE_BACKGROUNDS(6)장" 불변식을 업로드 경로에서 지키는 로직.
 * 경계(< vs <=)나 타입 체크가 깨지면 7번째 배경이 몰래 활성화돼 선택 UI가 어긋난다.
 */
describe("defaultActiveForNewImage", () => {
  beforeEach(() => countMock.mockReset());

  it("배경이 아닌 타입은 항상 활성이며 count를 조회하지 않는다", async () => {
    expect(await defaultActiveForNewImage(2)).toBe(true); // 프레임
    expect(await defaultActiveForNewImage(3)).toBe(true); // 스티커
    expect(countMock).not.toHaveBeenCalled();
  });

  it("활성 배경이 최대치 미만이면 활성으로 생성", async () => {
    countMock.mockResolvedValue(MAX_ACTIVE_BACKGROUNDS - 1); // 5
    expect(await defaultActiveForNewImage(BACKGROUND_IMAGE_TYPE)).toBe(true);
  });

  it("활성 배경이 정확히 최대치면 비활성으로 생성 (경계)", async () => {
    countMock.mockResolvedValue(MAX_ACTIVE_BACKGROUNDS); // 6
    expect(await defaultActiveForNewImage(BACKGROUND_IMAGE_TYPE)).toBe(false);
  });

  it("최대치를 초과한 상태면 비활성", async () => {
    countMock.mockResolvedValue(MAX_ACTIVE_BACKGROUNDS + 1); // 7
    expect(await defaultActiveForNewImage(BACKGROUND_IMAGE_TYPE)).toBe(false);
  });

  it("배경 count 조회는 active=true인 배경만 센다", async () => {
    countMock.mockResolvedValue(0);
    await defaultActiveForNewImage(BACKGROUND_IMAGE_TYPE);
    expect(countMock).toHaveBeenCalledWith({
      where: { imageType: BACKGROUND_IMAGE_TYPE, active: true },
    });
  });
});
