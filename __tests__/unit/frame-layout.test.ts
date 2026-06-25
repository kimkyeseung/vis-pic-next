import { describe, it, expect } from "vitest";
import type { Orientation } from "@/types";
import { FRAME_INFO } from "@/constants/frames";

function getPaperDimensions(
  paperW: number,
  paperH: number,
  orientation: Orientation,
): { pw: number; ph: number } {
  const longer = Math.max(paperW, paperH);
  const shorter = Math.min(paperW, paperH);
  if (orientation === "landscape") return { pw: longer, ph: shorter };
  return { pw: shorter, ph: longer };
}

function calcCellSize(
  canvasW: number,
  canvasH: number,
  cols: number,
  rows: number,
  padding: number,
  photoRatio: number,
): { cellW: number; cellH: number } {
  const allocW = (canvasW - padding * (cols + 1)) / cols;
  const allocH = (canvasH - padding * (rows + 1)) / rows;

  let cellW: number, cellH: number;
  if (allocW / allocH > photoRatio) {
    cellH = allocH;
    cellW = cellH * photoRatio;
  } else {
    cellW = allocW;
    cellH = cellW / photoRatio;
  }
  return { cellW, cellH };
}

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

describe("cell layout produces landscape cells on 10x15 paper", () => {
  const paperW = 10;
  const paperH = 15;
  const padding = 20;
  const photoRatio = 4 / 3;

  for (const [mode, info] of Object.entries(FRAME_INFO)) {
    it(`${mode} (${info.label}): cells are landscape or square`, () => {
      const { pw, ph } = getPaperDimensions(paperW, paperH, info.orientation);

      const basePx = 1800;
      const ratio = Math.max(pw, ph) / Math.min(pw, ph);
      let canvasW: number, canvasH: number;
      if (info.orientation === "landscape") {
        canvasW = basePx;
        canvasH = Math.round(basePx / ratio);
      } else {
        canvasH = basePx;
        canvasW = Math.round(basePx / ratio);
      }

      const { cellW, cellH } = calcCellSize(canvasW, canvasH, info.cols, info.rows, padding, photoRatio);

      expect(cellW).toBeGreaterThan(0);
      expect(cellH).toBeGreaterThan(0);
      expect(cellW / cellH).toBeGreaterThanOrEqual(1 - 0.01);
    });
  }
});

describe("cell aspect ratio is constrained to 4:3", () => {
  const padding = 20;
  const photoRatio = 4 / 3;

  it("wide allocation constrains by height", () => {
    const { cellW, cellH } = calcCellSize(1800, 600, 1, 1, padding, photoRatio);
    expect(cellW / cellH).toBeCloseTo(photoRatio, 2);
    expect(cellH).toBeCloseTo(600 - padding * 2, 0);
  });

  it("tall allocation constrains by width", () => {
    const { cellW, cellH } = calcCellSize(600, 1800, 1, 1, padding, photoRatio);
    expect(cellW / cellH).toBeCloseTo(photoRatio, 2);
    expect(cellW).toBeCloseTo(600 - padding * 2, 0);
  });

  it("exact 4:3 allocation fills completely", () => {
    const w = 800;
    const h = 600;
    const { cellW, cellH } = calcCellSize(w + padding * 2, h + padding * 2, 1, 1, padding, photoRatio);
    expect(cellW).toBeCloseTo(w, 0);
    expect(cellH).toBeCloseTo(h, 0);
  });
});

describe("composite canvas dimensions", () => {
  const basePx = 1800;
  const paperRatio = 3 / 2;

  it("landscape mode produces wider-than-tall canvas", () => {
    const canvasW = basePx;
    const canvasH = Math.round(basePx / paperRatio);
    expect(canvasW).toBe(1800);
    expect(canvasH).toBe(1200);
    expect(canvasW).toBeGreaterThan(canvasH);
  });

  it("portrait mode produces taller-than-wide canvas", () => {
    const canvasH = basePx;
    const canvasW = Math.round(basePx / paperRatio);
    expect(canvasW).toBe(1200);
    expect(canvasH).toBe(1800);
    expect(canvasH).toBeGreaterThan(canvasW);
  });

  it("canvas ratio matches paper ratio (3:2)", () => {
    const canvasW = basePx;
    const canvasH = Math.round(basePx / paperRatio);
    expect(canvasW / canvasH).toBeCloseTo(1.5, 2);
  });
});

describe("removed 1x2 mode", () => {
  it("1x2 is not in FRAME_INFO (cells would be portrait on 10x15 paper)", () => {
    expect(FRAME_INFO["1x2"]).toBeUndefined();
  });
});
