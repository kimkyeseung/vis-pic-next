import { describe, it, expect } from "vitest";
import type { Orientation } from "@/types";
import { FRAME_INFO } from "@/constants/frames";
import { getPaperDimensions } from "@/lib/printLayout";

describe("FRAME_INFO structure", () => {
  it("count equals cols * rows for all modes", () => {
    for (const [mode, info] of Object.entries(FRAME_INFO)) {
      expect(info.cols * info.rows, `${mode}: cols*rows should equal count`).toBe(info.count);
    }
  });

  it("all modes have a non-empty label", () => {
    for (const info of Object.values(FRAME_INFO)) {
      expect(info.label.length).toBeGreaterThan(0);
    }
  });

  it("all modes have a valid orientation", () => {
    for (const info of Object.values(FRAME_INFO)) {
      expect(["landscape", "portrait"]).toContain(info.orientation);
    }
  });
});

describe("getPaperDimensions", () => {
  it("landscape: longer side becomes width", () => {
    const { pw, ph } = getPaperDimensions(10, 15, "landscape");
    expect(pw).toBe(15);
    expect(ph).toBe(10);
  });

  it("portrait: shorter side becomes width", () => {
    const { pw, ph } = getPaperDimensions(10, 15, "portrait");
    expect(pw).toBe(10);
    expect(ph).toBe(15);
  });

  it("works with reversed input order (15, 10)", () => {
    const landscape = getPaperDimensions(15, 10, "landscape");
    expect(landscape.pw).toBe(15);
    expect(landscape.ph).toBe(10);

    const portrait = getPaperDimensions(15, 10, "portrait");
    expect(portrait.pw).toBe(10);
    expect(portrait.ph).toBe(15);
  });

  it("square paper stays the same in both orientations", () => {
    const landscape = getPaperDimensions(10, 10, "landscape");
    expect(landscape.pw).toBe(10);
    expect(landscape.ph).toBe(10);
  });
});

describe("paper orientation per mode", () => {
  const cases: { mode: string; expectedOrientation: Orientation }[] = [
    { mode: "1x1", expectedOrientation: "landscape" },
    { mode: "2x1", expectedOrientation: "portrait" },
    { mode: "2x2", expectedOrientation: "landscape" },
    { mode: "2x3", expectedOrientation: "landscape" },
    { mode: "2x4", expectedOrientation: "portrait" },
    { mode: "4x1", expectedOrientation: "portrait" },
  ];

  for (const { mode, expectedOrientation } of cases) {
    it(`${mode} uses ${expectedOrientation} paper`, () => {
      expect(FRAME_INFO[mode].orientation).toBe(expectedOrientation);
    });
  }
});

describe("removed 1x2 mode", () => {
  it("1x2 is not in FRAME_INFO (cells would be portrait on 10x15 paper)", () => {
    expect(FRAME_INFO["1x2"]).toBeUndefined();
  });
});
