"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DeviceConfig, Sticker } from "@/types";
import { parseButtonImageOptions } from "@/lib/deviceConfig";
import { FRAME_INFO } from "@/constants/frames";
import { LanguageProvider, useLanguage } from "@/i18n/LanguageContext";
import type { Locale } from "@/i18n/translations";

import { StartSection } from "@/components/service/StartSection";
import { PaymentSection } from "@/components/service/PaymentSection";
import { FrameSection } from "@/components/service/FrameSection";
import { BackgroundSection } from "@/components/service/BackgroundSection";
import { CameraSection } from "@/components/service/CameraSection";
import { SelectSection } from "@/components/service/SelectSection";
import { PrintBgSection } from "@/components/service/PrintBgSection";
import { CompleteSection } from "@/components/service/CompleteSection";

// ── 미리보기 스텝 정의 ─────────────────────────────────────────
export type PreviewStep =
  | "start" | "payment" | "frame" | "background"
  | "camera" | "select" | "printbg" | "complete";

export const PREVIEW_STEPS: { id: PreviewStep; label: string }[] = [
  { id: "start", label: "대기" },
  { id: "payment", label: "결제" },
  { id: "frame", label: "프레임" },
  { id: "background", label: "배경" },
  { id: "camera", label: "촬영*" },
  { id: "select", label: "선택" },
  { id: "printbg", label: "인쇄배경" },
  { id: "complete", label: "완료" },
];

// ── 목업 데이터 ────────────────────────────────────────────────
const PALETTE = ["#6c6fb4", "#e08aa0", "#63b0c0", "#c0a35e", "#7bb07b", "#9a7bc0"];
function swatch(i: number): string {
  const c = PALETTE[i % PALETTE.length];
  // 실제 촬영본과 동일한 가로 4:3 비율 목업
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='480'>` +
    `<rect width='100%' height='100%' fill='${c}'/>` +
    `<text x='50%' y='50%' font-size='160' fill='rgba(255,255,255,0.85)' ` +
    `text-anchor='middle' dominant-baseline='middle' font-family='sans-serif'>${i + 1}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
const MOCK_PHOTOS = Array.from({ length: 6 }, (_, i) => swatch(i));

// 프레임 선택(인쇄배경) 목업 — 가로형 프레임(테두리+중앙) 모양의 data URI
const FRAME_COLORS = ["#6c6fb4", "#e0a020", "#3aa0d0", "#e05a5a"];
function mockFrame(i: number) {
  const c = FRAME_COLORS[i % FRAME_COLORS.length];
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='480'>` +
    `<rect width='640' height='480' fill='${c}'/>` +
    `<rect x='36' y='36' width='568' height='408' fill='#222'/>` +
    `<text x='598' y='240' font-size='22' fill='rgba(0,0,0,0.55)' text-anchor='middle' ` +
    `font-family='sans-serif' transform='rotate(90 598 240)'>AR-PIC</text></svg>`;
  return { id: 900 + i, name: `mock-frame-${i}`, filename: `data:image/svg+xml,${encodeURIComponent(svg)}` };
}
const MOCK_FRAMES = Array.from({ length: 4 }, (_, i) => mockFrame(i));

// 완료 화면 결과물 목업 — 선택한 프레임의 인화지 방향(가로/세로)에 맞춘 비율로 생성
function mockComposite(mode: string): string {
  const landscape = FRAME_INFO[mode]?.orientation === "landscape";
  const w = landscape ? 720 : 480;
  const h = landscape ? 480 : 720;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>` +
    `<rect width='100%' height='100%' fill='#6c6fb4'/>` +
    `<text x='50%' y='50%' font-size='120' fill='rgba(255,255,255,0.85)' ` +
    `text-anchor='middle' dominant-baseline='middle' font-family='sans-serif'>${landscape ? "가로" : "세로"}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function makeConfig(paymentEnabled: boolean): DeviceConfig {
  return {
    deviceId: "preview",
    deviceName: "미리보기",
    paymentEnabled,
    paymentAmount: 5000,
    paymentTiers: [
      { qty: 1, price: 5000 },
      { qty: 2, price: 10000 },
      { qty: 4, price: 20000 },
    ],
    paymentTerminalMode: "manual",
    captureSeconds: 3,
    captureCount: 4,
    cameraResolution: "fhd",
    chromakeyRgb: "0,255,0",
    chromakeySimilarity: 50,
    chromakeySmoothness: 50,
    chromakeySpill: 0,
    chromakeyChoke: 0,
    chromakeyLumaIndependent: false,
    chromakeyYuvRgb: "0,255,0",
    chromakeyYuvSimilarity: 30,
    chromakeyYuvSmoothness: 10,
    chromakeyYuvSpill: 0,
    chromakeyYuvOpacity: 100,
    chromakeyYuvContrast: 0,
    chromakeyYuvBrightness: 0,
    chromakeyYuvGamma: 0,
    captureModes: ["1x1", "2x1", "2x2"],
    bgRemovalMode: "mediapipe",
    idleTimeoutSeconds: 30,
    cameraAutoTimerSeconds: 60,
    printAutoTimerSeconds: 30,
    segmentThreshold: 15,
    segmentFeather: 35,
    segmentMaskBlur: 100,
    segmentEdgeShift: 0,
    segmentTemporal: 0,
    segmentRoi: true,
    segmentRoiMargin: 22,
    segmentProcessScale: "auto",
    segmentHandRescue: 50,
    themeTextColor: "#ffffff",
    themePrimaryColor: "#6c6fb4",
    themeBgColor: "#2a2a2a",
    btnGlowEnabled: true,
    btnGlowColor: "#6c6fb4",
    btnGlowSize: 28,
    btnCaptureTextColor: "#2a2a2a",
    btnNextTextColor: "#ffffff",
    btnPaymentTextColor: "#ffffff",
    btnImageOptions: parseButtonImageOptions({}),
  };
}

// LanguageProvider 내부에서 선택 언어를 반영한다(컨트롤은 프로바이더 밖에 있으므로).
function LangController({ lang }: { lang: Locale }) {
  const { setLang } = useLanguage();
  useEffect(() => { setLang(lang); }, [lang, setLang]);
  return null;
}

const noop = () => {};

/**
 * 실제 서비스 Section 컴포넌트를 목업 데이터로 렌더하는 미리보기 스테이지(1920×1080 / 1080×1920 → 부모 크기에 맞춰 축소).
 * 관리자 "화면 미리보기"와 "테마 관리 미리보기"가 함께 쓴다. 테마(배경화면·버튼 이미지·색상)는
 * 호출부가 themeStyle/themeAttrs로 넘긴다 — 실제 서비스와 같은 buildServiceTheme 결과를 넘기면 실제 화면과 같아진다.
 * 부모는 크기가 정해진 박스여야 한다(스테이지가 그 안에 맞춰 축소된다).
 */
export function ServicePreviewStage({
  step,
  orientation,
  lang = "ko",
  themeStyle,
  themeAttrs = {},
  logoUrl = null,
  gesturePreviewOn = false,
  selectedFrame,
  onSelectFrame,
}: {
  step: PreviewStep;
  orientation: "landscape" | "portrait";
  lang?: Locale;
  themeStyle: React.CSSProperties;
  themeAttrs?: Record<string, string>;
  logoUrl?: string | null;
  gesturePreviewOn?: boolean;
  selectedFrame: string;
  onSelectFrame: (frame: string) => void;
}) {
  // 인터랙션용 목업 상태
  const [selectedBackground, setSelectedBackground] = useState<number | null>(-1);
  const [selectedPrintBg, setSelectedPrintBg] = useState<number | null>(null);
  const [printQuantity, setPrintQuantity] = useState(1);
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const slots = FRAME_INFO[selectedFrame]?.count ?? 4;
  const [photoSel, setPhotoSel] = useState({ frame: selectedFrame, photos: Array.from({ length: slots }, (_, i) => i) });
  // 프레임이 바뀌면 선택 사진 수도 슬롯 수에 맞춰 초기화한다(렌더 중 상태 조정 — effect 없이).
  if (photoSel.frame !== selectedFrame) {
    setPhotoSel({ frame: selectedFrame, photos: Array.from({ length: slots }, (_, i) => i) });
  }
  const selectedPhotos = photoSel.photos;
  const setSelectedPhotos = (updater: number[] | ((prev: number[]) => number[])) =>
    setPhotoSel((prev) => ({ ...prev, photos: typeof updater === "function" ? updater(prev.photos) : updater }));

  const config = useMemo(() => makeConfig(step === "payment"), [step]);

  // ── 스테이지 스케일 계산 (1920×1080 or 1080×1920 → 컨테이너에 맞춤) ──
  const stageW = orientation === "portrait" ? 1080 : 1920;
  const stageH = orientation === "portrait" ? 1920 : 1080;
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const compute = () => {
      const cw = el.clientWidth - 24;
      const ch = el.clientHeight - 24;
      setScale(Math.max(0.1, Math.min(cw / stageW, ch / stageH)));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [stageW, stageH]);

  const stageStyle: React.CSSProperties = {
    background: "#2a2a2a",
    ...themeStyle,
    width: stageW,
    height: stageH,
    transform: `scale(${scale})`,
    transformOrigin: "top left",
  };

  const renderStep = () => {
    switch (step) {
      case "start":
        return (
          <StartSection
            onNext={noop}
            showLanguage
            monitors={[]}
            syncEnabled={false}
            selectedMonitorIndex={null}
            onSyncEnabledChange={noop}
            onMonitorIndexChange={noop}
          />
        );
      case "payment":
        return (
          <PaymentSection
            config={config}
            orderId={null}
            setOrderId={noop}
            printQuantity={printQuantity}
            setPrintQuantity={setPrintQuantity}
            onNext={noop}
            onPrev={noop}
          />
        );
      case "frame":
        return (
          <FrameSection
            captureModes={config.captureModes}
            selectedFrame={selectedFrame}
            onSelect={onSelectFrame}
            onNext={noop}
            onPrev={noop}
          />
        );
      case "background":
        return (
          <BackgroundSection
            backgroundImages={[]}
            selectedBackground={selectedBackground}
            imageBaseUrl=""
            onSelect={setSelectedBackground}
            onNext={noop}
            onPrev={noop}
          />
        );
      case "camera":
        return (
          <CameraSection
            config={config}
            photos={[]}
            maxPhotos={slots * config.captureCount}
            minPhotos={slots}
            selectedBackground={selectedBackground}
            backgroundImages={[]}
            imageBaseUrl=""
            stickers={stickers}
            syncEnabled={false}
            mockCamera
            previewForceGestureHint={gesturePreviewOn}
            onCapture={noop}
            onNext={noop}
            onPrev={noop}
            onStickersChange={setStickers}
            onBackgroundSelect={setSelectedBackground}
          />
        );
      case "select":
        return (
          <SelectSection
            photos={MOCK_PHOTOS.slice(0, Math.max(slots, 4))}
            requiredCount={slots}
            selectedPhotos={selectedPhotos}
            setSelectedPhotos={setSelectedPhotos}
            selectedFrame={selectedFrame}
            printSettings={{}}
            imageBaseUrl=""
            selectedBackground={selectedBackground}
            backgroundImages={[]}
            printBgImages={MOCK_FRAMES}
            onNext={noop}
            onPrev={noop}
          />
        );
      case "printbg":
        return (
          <PrintBgSection
            printBgImages={MOCK_FRAMES}
            selectedPrintBg={selectedPrintBg}
            imageBaseUrl=""
            onSelect={setSelectedPrintBg}
            onNext={noop}
            onPrev={noop}
          />
        );
      case "complete":
        return (
          <CompleteSection
            photos={MOCK_PHOTOS.slice(0, slots)}
            selectedPhotos={selectedPhotos}
            selectedFrame={selectedFrame}
            selectedBackground={selectedBackground}
            backgroundImages={[]}
            imageBaseUrl=""
            compositeImage={mockComposite(selectedFrame)}
            setCompositeImage={noop}
            intermediateFrames={[]}
            printSettings={{}}
            selectedPrintBg={null}
            printBgImages={[]}
            preparedPhotoUrl="https://example.com/preview-photo"
            preparedGifUrl="https://example.com/preview-gif"
            preparedExpiryDate="2026-07-31"
            printQuantity={printQuantity}
            onPrev={noop}
            onRestart={noop}
          />
        );
    }
  };

  return (
    <div ref={containerRef} className="w-full h-full overflow-hidden bg-gray-950 flex items-center justify-center">
      <div style={{ width: stageW * scale, height: stageH * scale }}>
        <LanguageProvider>
          <LangController lang={lang} />
          <div
            className={`service-theme relative overflow-hidden shadow-2xl ${orientation === "portrait" ? "force-portrait" : ""}`}
            {...themeAttrs}
            style={stageStyle}
          >
            {/* 좌측 상단 로고 — 첫(대기) 화면 제외. 서비스(service/page.tsx)와 같은 위치·크기. 미설정 시 기본 AR-pic. */}
            {step !== "start" && (
              <div className="absolute top-16 left-16 z-20 pointer-events-none select-none">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoUrl}
                    alt="logo"
                    className="h-16 portrait:h-12 w-auto max-w-[40vw] object-contain"
                    style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.4))" }}
                  />
                ) : (
                  <span
                    className="text-3xl portrait:text-2xl font-extrabold tracking-wide text-white"
                    style={{ textShadow: "0 2px 8px rgba(0,0,0,0.4)" }}
                  >
                    AR-pic
                  </span>
                )}
              </div>
            )}
            {renderStep()}
          </div>
        </LanguageProvider>
      </div>
    </div>
  );
}
