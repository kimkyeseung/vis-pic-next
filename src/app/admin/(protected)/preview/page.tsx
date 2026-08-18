"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DeviceConfig, Sticker } from "@/types";
import { FRAME_INFO } from "@/constants/frames";
import { LanguageProvider, useLanguage } from "@/i18n/LanguageContext";
import { LOCALES, type Locale } from "@/i18n/translations";

import { StartSection } from "@/components/service/StartSection";
import { PaymentSection } from "@/components/service/PaymentSection";
import { FrameSection } from "@/components/service/FrameSection";
import { BackgroundSection } from "@/components/service/BackgroundSection";
import { CameraSection } from "@/components/service/CameraSection";
import { SelectSection } from "@/components/service/SelectSection";
import { PrintBgSection } from "@/components/service/PrintBgSection";
import { CompleteSection } from "@/components/service/CompleteSection";

// ── 미리보기 스텝 정의 ─────────────────────────────────────────
type PreviewStep =
  | "start" | "payment" | "frame" | "background"
  | "camera" | "select" | "printbg" | "complete";

const STEPS: { id: PreviewStep; label: string }[] = [
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
    captureModes: ["1x1", "2x1", "2x2"],
    bgRemovalMode: "mediapipe",
    idleTimeoutSeconds: 30,
    cameraAutoTimerSeconds: 60,
    printAutoTimerSeconds: 30,
    segmentThreshold: 15,
    segmentFeather: 35,
    themeTextColor: "#ffffff",
    themePrimaryColor: "#6c6fb4",
    themeBgColor: "#2a2a2a",
    btnGlowEnabled: true,
    btnGlowColor: "#6c6fb4",
    btnGlowSize: 28,
  };
}

// LanguageProvider 내부에서 선택 언어를 반영한다(컨트롤바는 프로바이더 밖에 있으므로).
function LangController({ lang }: { lang: Locale }) {
  const { setLang } = useLanguage();
  useEffect(() => { setLang(lang); }, [lang, setLang]);
  return null;
}

const noop = () => {};

export default function PreviewPage() {
  const [step, setStep] = useState<PreviewStep>("start");
  const [lang, setLang] = useState<Locale>("ko");
  const [orientation, setOrientation] = useState<"landscape" | "portrait">("landscape");
  const [themeText, setThemeText] = useState("#ffffff");
  const [themePrimary, setThemePrimary] = useState("#6c6fb4");
  const [wallpaper, setWallpaper] = useState(false);

  // 인터랙션용 목업 상태
  const [selectedFrame, setSelectedFrame] = useState<string>("2x2");
  const [selectedBackground, setSelectedBackground] = useState<number | null>(-1);
  const [selectedPrintBg, setSelectedPrintBg] = useState<number | null>(null);
  const [printQuantity, setPrintQuantity] = useState(1);
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const slots = FRAME_INFO[selectedFrame]?.count ?? 4;
  const [selectedPhotos, setSelectedPhotos] = useState<number[]>([0, 1, 2, 3]);
  // 프레임을 바꾸면 선택 사진 수도 슬롯 수에 맞춰 초기화한다.
  const selectFrame = (f: string) => {
    setSelectedFrame(f);
    const n = FRAME_INFO[f]?.count ?? 4;
    setSelectedPhotos(Array.from({ length: n }, (_, i) => i));
  };

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
    width: stageW,
    height: stageH,
    transform: `scale(${scale})`,
    transformOrigin: "top left",
    background: "#2a2a2a",
    ["--theme-text" as string]: themeText,
    ["--theme-primary" as string]: themePrimary,
    // 버튼 탭 글로우 미리보기 (강조색 사용)
    ["--btn-glow-color" as string]: themePrimary,
    ["--btn-glow-size" as string]: "28px",
    // 배경화면은 첫(대기) 화면에만 적용된다.
    ...(wallpaper && step === "start"
      ? {
          backgroundImage: "linear-gradient(135deg, #2b2440 0%, #46375f 50%, #6c6fb4 100%)",
        }
      : {}),
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
            onSelect={selectFrame}
            onNext={noop}
            onPrev={noop}
            printBgImages={MOCK_FRAMES}
            imageBaseUrl=""
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
    <div className="flex flex-col h-full -m-6">
      {/* 컨트롤 바 */}
      <div className="shrink-0 border-b border-gray-700 bg-gray-800 p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 uppercase w-14">단계</span>
          {STEPS.map((s) => (
            <button
              key={s.id}
              onClick={() => setStep(s.id)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                step === s.id ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-500 uppercase w-14">언어</span>
            {LOCALES.map(({ code, label }) => (
              <button
                key={code}
                onClick={() => setLang(code)}
                className={`px-2.5 py-1 rounded text-sm transition-colors ${
                  lang === code ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-500 uppercase">방향</span>
            <button
              onClick={() => setOrientation((o) => (o === "landscape" ? "portrait" : "landscape"))}
              className="px-3 py-1 rounded bg-gray-700 text-gray-200 text-sm hover:bg-gray-600"
            >
              {orientation === "landscape" ? "가로 1920×1080" : "세로 1080×1920"}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-500 uppercase">결과물</span>
            {/* 결과물(프레임) 방향 토글: 세로 2컷(2x1) ↔ 가로 4컷(2x2). 프레임/선택/완료 미리보기에 반영 */}
            <button
              onClick={() => selectFrame(FRAME_INFO[selectedFrame]?.orientation === "portrait" ? "2x2" : "2x1")}
              className="px-3 py-1 rounded bg-gray-700 text-gray-200 text-sm hover:bg-gray-600"
            >
              {FRAME_INFO[selectedFrame]?.orientation === "portrait" ? "세로 2컷" : "가로 4컷"}
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            글자색
            <input type="color" value={themeText} onChange={(e) => setThemeText(e.target.value)} className="h-7 w-9 rounded bg-transparent" />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            강조색
            <input type="color" value={themePrimary} onChange={(e) => setThemePrimary(e.target.value)} className="h-7 w-9 rounded bg-transparent" />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={wallpaper} onChange={(e) => setWallpaper(e.target.checked)} className="h-4 w-4 accent-blue-500" />
            배경화면
          </label>
          <button
            onClick={() => { setThemeText("#ffffff"); setThemePrimary("#6c6fb4"); setWallpaper(false); }}
            className="px-3 py-1 rounded bg-gray-700 text-gray-300 text-sm hover:bg-gray-600"
          >
            초기화
          </button>
        </div>
        <p className="text-xs text-gray-500">
          * 촬영 화면은 실제 <code>CameraSection</code>을 그대로 렌더합니다(라이브 카메라). 카메라를
          허용하지 않으면 중앙만 에러 박스로 표시되고 3단 레이아웃은 실제와 동일합니다. 세로 방향은
          스테이지에 <code>.force-portrait</code>를 부여해 <code>portrait:</code> 전용 스타일을 실제
          세로 화면과 동일하게 적용합니다.
        </p>
      </div>

      {/* 스테이지 */}
      <div ref={containerRef} className="flex-1 overflow-hidden bg-gray-950 flex items-center justify-center">
        <div style={{ width: stageW * scale, height: stageH * scale }}>
          <LanguageProvider>
            <LangController lang={lang} />
            <div className={`service-theme relative overflow-hidden shadow-2xl ${orientation === "portrait" ? "force-portrait" : ""}`} style={stageStyle}>
              {/* 좌측 상단 로고 — 첫(대기) 화면 제외. 미리보기는 기본 AR-pic로 표시. */}
              {step !== "start" && (
                <div className="absolute top-6 left-8 z-20 pointer-events-none select-none">
                  <span
                    className="text-3xl font-extrabold tracking-wide text-white"
                    style={{ textShadow: "0 2px 8px rgba(0,0,0,0.4)" }}
                  >
                    AR-pic
                  </span>
                </div>
              )}
              {renderStep()}
            </div>
          </LanguageProvider>
        </div>
      </div>
    </div>
  );
}
