"use client";

import { useEffect, useState } from "react";
import { useDebug } from "./DebugContext";

// 디버그 모드에서 그리드 레이아웃을 시각화한다.
//  - 각 그리드 셀(그리드 아이템): 빨간 박스
//  - 각 그리드 행(row 트랙): 초록 박스 — 행 트랙은 DOM 요소가 아니라, grid-template-rows
//    실측값으로 위치를 계산해 절대배치 오버레이로 그린다.
// CSS로는 트랙을 못 감싸므로(요소가 아님) 이 컴포넌트가 유일한 그리드 디버그 시각화다.

type Box = {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: "row" | "cell";
  label?: string;
};

// 서비스 화면 안의 그리드 컨테이너(Tailwind `grid` + 인라인 grid-template)만 대상.
const GRID_SELECTOR = '.service-theme .grid, .service-theme [style*="grid-template"]';
const REFRESH_MS = 150;

function px(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function computeBoxes(): Box[] {
  const boxes: Box[] = [];
  const grids = document.querySelectorAll<HTMLElement>(GRID_SELECTOR);

  grids.forEach((grid) => {
    const cs = getComputedStyle(grid);
    if (cs.display !== "grid" && cs.display !== "inline-grid") return;

    const rect = grid.getBoundingClientRect();
    const contentX = rect.left + px(cs.borderLeftWidth) + px(cs.paddingLeft);
    const contentY = rect.top + px(cs.borderTopWidth) + px(cs.paddingTop);
    const contentW =
      rect.width - px(cs.borderLeftWidth) - px(cs.borderRightWidth) - px(cs.paddingLeft) - px(cs.paddingRight);

    // 행(row) 초록 박스 — grid-template-rows 실측 px 트랙 + row-gap으로 각 행 밴드 계산
    const rows = cs.gridTemplateRows
      .split(" ")
      .map(px)
      .filter((h) => h > 0);
    const rowGap = px(cs.rowGap);
    let y = contentY;
    rows.forEach((h, i) => {
      boxes.push({ x: contentX, y, w: Math.max(0, contentW), h, kind: "row", label: `r${i + 1}` });
      y += h + rowGap;
    });

    // 셀(그리드 아이템) 빨간 박스 — 배치된 직계 자식들(숨김·절대배치 제외)
    Array.from(grid.children).forEach((child) => {
      const c = child as HTMLElement;
      const ccs = getComputedStyle(c);
      if (ccs.display === "none" || ccs.position === "absolute" || ccs.position === "fixed") return;
      const cr = c.getBoundingClientRect();
      if (cr.width < 1 || cr.height < 1) return;
      boxes.push({ x: cr.left, y: cr.top, w: cr.width, h: cr.height, kind: "cell" });
    });
  });

  return boxes;
}

export function DebugGridOverlay() {
  const { debug } = useDebug();
  const [boxes, setBoxes] = useState<Box[]>([]);

  useEffect(() => {
    // debug=false면 아래에서 null을 렌더하므로 boxes를 비울 필요 없이 조기 종료(다시 켜지면 rAF가 갱신).
    if (!debug) return;
    // 단계 전환·리사이즈·애니메이션에도 따라가도록 rAF로 주기 갱신(과다 렌더 방지 위해 스로틀).
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - last < REFRESH_MS) return;
      last = t;
      setBoxes(computeBoxes());
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [debug]);

  if (!debug) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[9998]">
      {boxes.map((b, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: b.x,
            top: b.y,
            width: b.w,
            height: b.h,
            ...(b.kind === "row"
              ? {
                  outline: "1px dashed rgba(0,255,0,0.9)",
                  outlineOffset: "-1px",
                  background: "rgba(0,255,0,0.08)",
                }
              : { outline: "1.5px solid red", outlineOffset: "-1.5px" }),
          }}
        >
          {b.kind === "row" && (
            <span
              style={{
                position: "absolute",
                left: 3,
                top: 1,
                fontFamily: "monospace",
                fontSize: 9,
                lineHeight: "10px",
                color: "rgba(0,255,0,0.95)",
              }}
            >
              {b.label}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
