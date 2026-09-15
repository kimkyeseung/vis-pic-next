"use client";

import { QRCodeSVG } from "qrcode.react";
import { useLanguage } from "@/i18n/LanguageContext";

// QR 다운로드 카드 더블클릭 디버깅용. 브라우저에서만 새 창이 열린다 —
// Tauri(WebView2)는 window.open 새 창을 차단하며, 키오스크에서
// 브라우저가 열리면 안 되므로 의도된 동작이다.
function openDebugUrl(url: string) {
  window.open(url, "_blank");
}

/** 완료 화면의 QR 다운로드 카드 1개(사진 또는 GIF). matchHeight면 카드가 프레임 높이에
 * stretch되고 QR이 남은 세로 공간에 맞춰 반응형으로 축소된다(라벨은 고정, QR 박스만 늘고 줆). */
export function QRDownloadCard({
  url,
  emoji,
  label,
  matchHeight,
}: {
  url: string;
  emoji: string;
  label: string;
  matchHeight: boolean;
}) {
  const { t } = useLanguage();

  // 정사각형 QR 박스(흰 배경 + 패딩 + QR) 자체 — 두 분기(matchHeight/기본)가 같은 정사각형
  // 로직을 공유하게 한다. 실제 크기 제약(가용 공간에 맞출지, 고정 220px로 둘지 등)은 호출부가
  // sizeClass로 넘긴다. aspect-square라 폭·높이 중 어느 쪽으로 제약을 걸어도 항상 정사각형을
  // 유지하며, w-full h-full인 QR이 패딩을 제외한 안쪽을 정확히 채운다.
  const renderQRBox = (sizeClass: string) => (
    <div className={`bg-white p-4 rounded-xl cursor-pointer aspect-square ${sizeClass}`} onDoubleClick={() => openDebugUrl(url)}>
      <QRCodeSVG value={url} size={220} className="w-full h-full" />
    </div>
  );

  return (
    // 세로(portrait)에선 카드를 좌우로 꽉 채우고(flex-1) QR·라벨을 키운다(시안 대응).
    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20 text-center flex flex-col items-center min-w-0 portrait:flex-1">
      <div className="text-4xl portrait:text-5xl mb-2 shrink-0">{emoji}</div>
      <p className="text-white text-2xl portrait:text-3xl font-semibold mb-4 portrait:mb-6 shrink-0">{label}</p>
      {matchHeight ? (
        // 남은 세로 공간 안에서 정사각형을 유지(폭·높이 둘 다 auto + max-h/max-w)해야
        // 박스 여백이 상하좌우 고르게 보인다 — h-full처럼 한쪽을 고정하면 남는 공간만큼
        // 박스가 직사각형이 되어 QR 주변 패딩이 불균일해진다.
        <div className="flex-1 min-h-0 w-full flex items-center justify-center">
          {renderQRBox("max-h-full max-w-full")}
        </div>
      ) : (
        // 가로: 고정 220px 정사각형. 세로: 카드 폭에 맞춰 확대(상한 300px) 정사각형.
        renderQRBox("w-[220px] portrait:w-full portrait:max-w-[300px]")
      )}
      <p className="text-gray-400 text-sm portrait:text-lg mt-3 shrink-0">{t("complete.qrScan")}</p>
    </div>
  );
}
