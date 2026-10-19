"use client";

import { useEffect, useRef, useState } from "react";
import { FRAME_INFO } from "@/constants/frames";

/**
 * 완료 화면의 좌우(미리보기|QR) 배치에서, QR 카드 영역의 상·하단을 결과물 프레임과 정확히
 * 일치시키기 위한 반응형 측정값(`matchHeight`/`previewH`)과, 세로 결과물일 때 사진 쪽 높이
 * 상한을 낮추는 `photoMaxHClass`를 계산한다. 합성 이미지 생성(`useCompositeGeneration`)과는
 * 무관 — 오직 레이아웃 측정만 담당한다.
 */
export function useResultLayout({
  selectedFrame,
  compositeImage,
  printStatus,
}: {
  selectedFrame: string;
  compositeImage: string | null;
  printStatus: string;
}) {
  const isLandscapeResult = (FRAME_INFO[selectedFrame]?.orientation ?? "landscape") !== "portrait";
  const sectionRef = useRef<HTMLElement>(null);
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const [previewH, setPreviewH] = useState<number | null>(null);
  // 세로 레이아웃(상하 스택)이면 QR 높이 일치를 적용하지 않는다. 실제 세로 뷰포트뿐 아니라
  // 관리자 미리보기(.force-portrait 조상)도 세로로 간주한다(미디어쿼리로는 감지 못 함).
  const [stacked, setStacked] = useState(false);

  useEffect(() => {
    const el = previewBoxRef.current;
    if (!el) return;
    // offsetHeight는 CSS transform(미리보기 스테이지의 scale)의 영향을 받지 않는 레이아웃
    // 높이를 돌려준다. getBoundingClientRect().height는 축소된 높이라 미리보기에서 카드가
    // 과도하게 낮아져 QR이 비정상 축소됐다.
    const ro = new ResizeObserver(() => setPreviewH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [compositeImage, printStatus]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(orientation: portrait)");
    const update = () => setStacked(mq.matches || !!sectionRef.current?.closest(".force-portrait"));
    update();
    mq.addEventListener("change", update);
    // 미리보기에서 방향 토글 시 스테이지 크기가 바뀌므로 리사이즈로도 재평가한다.
    const ro = new ResizeObserver(update);
    if (sectionRef.current) ro.observe(sectionRef.current);
    return () => { mq.removeEventListener("change", update); ro.disconnect(); };
  }, []);

  const matchHeight = !stacked && previewH != null;
  // 세로 프레임(2컷 등)은 사진 쪽이 지나치게 길어 QR 영역과 비율이 안 맞으므로, 좌우
  // 배치일 때만 사진 쪽 상한을 더 낮춰 QR 카드와 비슷한 높이로 맞춘다.
  // 500px: 그 아래 다운로드 기한 표시(78px)와 인쇄 완료 문구까지 들어가도 하단 "처음으로" 버튼
  // (위쪽 끝 899px)과 겹치지 않는 높이 — 550px일 땐 인쇄 완료 문구가 버튼 뒤로 15px 들어갔다.
  const photoMaxHClass = !isLandscapeResult && !stacked ? "max-h-[500px]" : "max-h-[650px]";

  return { sectionRef, previewBoxRef, previewH, matchHeight, photoMaxHClass };
}
