"use client";

import { useEffect, useState } from "react";
import { useDebug } from "./DebugContext";

// 어떤 단계(step) 화면이든 상관없이 항상 같은 자리에 뜨는 공통 레이아웃 가이드.
// 실제 DOM을 측정하던 이전 DebugGridOverlay와 달리, 화면마다 달라지는 내부 구조는
// 무시하고 고정 픽셀 밴드로 타이틀·본문·버튼 3개 영역 + 영역 사이 간격 + 페이지 상하좌우
// 여백을 표시한다. 스케일된 키오스크 스테이지(transform: scale) 안에 그려지므로 여기 값은
// 모두 "디자인 좌표"(가로 1920×1080 / 세로 1080×1920) 기준이고, 실제 화면 배율과 함께
// 자동으로 스케일된다.
//
// titleH/buttonH는 실제 7개 단계 화면(payment/frame/background/camera/select/printbg/complete)의
// <h2> 하단·버튼 상단을 4개 언어(ko/en/ja/zh) 모두에서 getBoundingClientRect로 측정해 정했다 —
// PAGE_PADDING 기준선부터 실 콘텐츠 끝까지의 거리에 여유 소폭만 더한 값.
// 타이틀 텍스트가 언어에 따라 2줄인 경우(예: 영어 payment.selectQuantity, 일본어 frame.title)가
// 가장 크므로 그 값을 기준으로 잡았다 — 1줄 화면에서는 밴드 하단에 약간의 여유가 남는다.
// 실제 버튼 위치는 모든 단계·언어에서 페이지 하단으로부터 정확히 동일(가로 181 / 세로 189 design px)했다.
const BANDS = {
  landscape: { titleH: 190, buttonH: 120 },
  portrait: { titleH: 380, buttonH: 130 },
} as const;

const GAP = 32; // 타이틀↔본문, 본문↔버튼 사이 간격
const PAGE_PADDING = 64; // 페이지 상하좌우 여백 — 콘텐츠 영역(초록)과 구분되는 색으로 표시

const CONTENT_BORDER = "1px dashed rgba(0,255,0,0.9)";
const CONTENT_HATCH =
  "repeating-linear-gradient(45deg, rgba(0,255,0,0.15) 0, rgba(0,255,0,0.15) 1px, transparent 1px, transparent 9px)";

// 페이지 여백은 콘텐츠 밴드(초록)와 헷갈리지 않도록 주황 계열을 쓴다.
const PADDING_BORDER = "1px dashed rgba(255,165,0,0.9)";
const PADDING_HATCH =
  "repeating-linear-gradient(45deg, rgba(255,165,0,0.15) 0, rgba(255,165,0,0.15) 1px, transparent 1px, transparent 9px)";

const contentBandStyle = {
  position: "absolute",
  borderTop: CONTENT_BORDER,
  borderBottom: CONTENT_BORDER,
  backgroundImage: CONTENT_HATCH,
} as const;

const paddingStripStyle = {
  position: "absolute",
  border: PADDING_BORDER,
  backgroundImage: PADDING_HATCH,
} as const;

export function DebugLayoutGuide() {
  const { debug } = useDebug();
  const [portrait, setPortrait] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(orientation: portrait)");
    const update = () => setPortrait(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  if (!debug) return null;

  const { titleH, buttonH } = portrait ? BANDS.portrait : BANDS.landscape;

  return (
    <div className="pointer-events-none fixed inset-0 z-[9998]">
      {/* 페이지 상하좌우 패딩 */}
      <div style={{ ...paddingStripStyle, left: 0, right: 0, top: 0, height: PAGE_PADDING }} />
      <div style={{ ...paddingStripStyle, left: 0, right: 0, bottom: 0, height: PAGE_PADDING }} />
      <div style={{ ...paddingStripStyle, top: PAGE_PADDING, bottom: PAGE_PADDING, left: 0, width: PAGE_PADDING }} />
      <div style={{ ...paddingStripStyle, top: PAGE_PADDING, bottom: PAGE_PADDING, right: 0, width: PAGE_PADDING }} />

      {/* 타이틀 영역 */}
      <div
        style={{
          ...contentBandStyle,
          left: PAGE_PADDING,
          right: PAGE_PADDING,
          top: PAGE_PADDING,
          height: titleH,
        }}
      />
      {/* 본문 영역 — 타이틀·버튼 영역과 GAP만큼 떨어뜨려 그린다 */}
      <div
        style={{
          ...contentBandStyle,
          left: PAGE_PADDING,
          right: PAGE_PADDING,
          top: PAGE_PADDING + titleH + GAP,
          bottom: PAGE_PADDING + buttonH + GAP,
        }}
      />
      {/* 버튼 영역 */}
      <div
        style={{
          ...contentBandStyle,
          left: PAGE_PADDING,
          right: PAGE_PADDING,
          bottom: PAGE_PADDING,
          height: buttonH,
        }}
      />
    </div>
  );
}
