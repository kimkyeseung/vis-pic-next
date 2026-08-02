import { describe, it, expect } from "vitest";
import {
  parsePaymentTiers,
  parseQuantityOptions,
  parseIntSafe,
  clampPercent,
  parsePaymentTerminalMode,
} from "@/lib/deviceConfig";

/**
 * 결제·매수·설정 파싱은 관리자 입력 문자열을 손님 화면 값으로 바꾸는 지점이라
 * 오타·경계값에서 조용히 틀리면 잘못된 금액 청구/매수 제한으로 이어진다.
 * 여기서 입출력 계약을 못 박는다.
 */

describe("parsePaymentTiers (결제 가격표)", () => {
  it("'수량:가격' 목록을 qty 오름차순으로 파싱", () => {
    expect(parsePaymentTiers("1:5000,2:9000,4:18000")).toEqual([
      { qty: 1, price: 5000 },
      { qty: 2, price: 9000 },
      { qty: 4, price: 18000 },
    ]);
  });

  it("입력 순서와 무관하게 qty 오름차순 정렬", () => {
    expect(parsePaymentTiers("4:18000,1:5000")).toEqual([
      { qty: 1, price: 5000 },
      { qty: 4, price: 18000 },
    ]);
  });

  it("항목 내 공백을 허용", () => {
    expect(parsePaymentTiers(" 1 : 5000 , 2 : 9000 ")).toEqual([
      { qty: 1, price: 5000 },
      { qty: 2, price: 9000 },
    ]);
  });

  it("가격 0은 유효(무료 티어 허용)", () => {
    expect(parsePaymentTiers("1:0")).toEqual([{ qty: 1, price: 0 }]);
  });

  it("중복 수량은 뒤 값이 우선 — 요금 규칙 회귀 방지", () => {
    expect(parsePaymentTiers("2:9000,2:8000")).toEqual([{ qty: 2, price: 8000 }]);
  });

  it("수량 0·음수, 음수 가격 항목은 제외", () => {
    expect(parsePaymentTiers("0:5000,-1:100,2:9000")).toEqual([{ qty: 2, price: 9000 }]);
    expect(parsePaymentTiers("1:-100,2:9000")).toEqual([{ qty: 2, price: 9000 }]);
  });

  it("깨진 항목은 걸러내고 유효 항목만 유지", () => {
    expect(parsePaymentTiers("abc,1:5000,:,2:")).toEqual([{ qty: 1, price: 5000 }]);
  });

  it("유효 항목이 없으면 빈 배열", () => {
    expect(parsePaymentTiers("")).toEqual([]);
    expect(parsePaymentTiers("garbage")).toEqual([]);
  });
});

describe("parseQuantityOptions (인화 매수 버튼)", () => {
  it("'1,2,4' → [1,2,4]", () => {
    expect(parseQuantityOptions("1,2,4")).toEqual([1, 2, 4]);
  });

  it("중복 제거 + 오름차순 정렬", () => {
    expect(parseQuantityOptions("4,2,2,1")).toEqual([1, 2, 4]);
  });

  it("0·음수·비정수 토큰은 제외", () => {
    expect(parseQuantityOptions("0,-1,2,x,3")).toEqual([2, 3]);
  });

  it("유효값 없으면 [1] 폴백 (손님이 최소 1장은 살 수 있게)", () => {
    expect(parseQuantityOptions("")).toEqual([1]);
    expect(parseQuantityOptions("x,y")).toEqual([1]);
    expect(parseQuantityOptions("0,-5")).toEqual([1]);
  });
});

describe("parseIntSafe (설정 정수 파싱)", () => {
  it("정상 정수를 파싱", () => {
    expect(parseIntSafe("5", 3)).toBe(5);
  });

  it("'0'은 유효값 — 기본값으로 대체하지 않음 (계약)", () => {
    expect(parseIntSafe("0", 3)).toBe(0);
  });

  it("빈 문자열·비수치는 기본값", () => {
    expect(parseIntSafe("", 3)).toBe(3);
    expect(parseIntSafe("abc", 3)).toBe(3);
  });

  it("음수도 그대로 파싱", () => {
    expect(parseIntSafe("-3", 0)).toBe(-3);
  });
});

describe("clampPercent (AI 배경제거 0–100)", () => {
  it("범위 내 값은 그대로", () => {
    expect(clampPercent(50)).toBe(50);
  });

  it("100 초과는 100으로", () => {
    expect(clampPercent(120)).toBe(100);
  });

  it("기본 하한 0 미만은 0으로", () => {
    expect(clampPercent(-10)).toBe(0);
  });

  it("min 하한 지정 시 0으로 나누기 방지용 바닥 보장", () => {
    expect(clampPercent(0, 1)).toBe(1);
    expect(clampPercent(5, 1)).toBe(5);
  });
});

describe("parsePaymentTerminalMode — 정확 일치만 허용(현재 동작 고정)", () => {
  it("'manual'만 수동, 그 외는 payapp_lite", () => {
    expect(parsePaymentTerminalMode("manual")).toBe("manual");
    expect(parsePaymentTerminalMode("payapp_lite")).toBe("payapp_lite");
  });

  // 알려진 함정: 공백/대문자는 수동으로 인식되지 않고 payapp_lite로 떨어진다.
  // (운영자는 정확히 "manual"을 입력해야 함. 트림/소문자화 하드닝은 별도 논의)
  it("공백·대문자 변형은 수동으로 인식되지 않음", () => {
    expect(parsePaymentTerminalMode(" manual ")).toBe("payapp_lite");
    expect(parsePaymentTerminalMode("Manual")).toBe("payapp_lite");
  });
});
