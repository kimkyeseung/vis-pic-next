"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DeviceConfig } from "@/types";
import { FRAME_INFO } from "@/constants/frames";
import { LanguageProvider, useLanguage } from "@/i18n/LanguageContext";
import { LOCALES, type Locale } from "@/i18n/translations";

import { StartSection } from "@/components/service/StartSection";
import { PaymentSection } from "@/components/service/PaymentSection";
import { FrameSection } from "@/components/service/FrameSection";
import { BackgroundSection } from "@/components/service/BackgroundSection";
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
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='480' height='640'>` +
    `<rect width='100%' height='100%' fill='${c}'/>` +
    `<text x='50%' y='50%' font-size='160' fill='rgba(255,255,255,0.85)' ` +
    `text-anchor='middle' dominant-baseline='middle' font-family='sans-serif'>${i + 1}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
const MOCK_PHOTOS = Array.from({ length: 6 }, (_, i) => swatch(i));

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
    chromakeyRgb: "0,255,0",
    captureModes: ["1x1", "2x1", "2x2", "2x3", "2x4", "4x1"],
    bgRemovalMode: "mediapipe",
    idleTimeoutSeconds: 30,
    cameraAutoTimerSeconds: 60,
    printAutoTimerSeconds: 30,
    segmentThreshold: 15,
    segmentFeather: 35,
    themeTextColor: "#ffffff",
    themePrimaryColor: "#6c6fb4",
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
    ...(wallpaper
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
            logoUrl={null}
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
            backgroundImages={[]}
            selectedBackground={selectedBackground}
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
        return <CameraPlaceholder />;
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
            onNext={noop}
            onPrev={noop}
          />
        );
      case "printbg":
        return (
          <PrintBgSection
            printBgImages={[]}
            selectedPrintBg={selectedPrintBg}
            imageBaseUrl=""
            selectedFrame={selectedFrame}
            photos={MOCK_PHOTOS.slice(0, slots)}
            selectedPhotos={selectedPhotos}
            printSettings={{}}
            selectedBackground={selectedBackground}
            backgroundImages={[]}
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
            compositeImage={MOCK_PHOTOS[0]}
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
          * 촬영 화면은 카메라·AI가 필요해 레이아웃만 보여주는 플레이스홀더입니다. 세로 방향은
          치수만 바뀌며, <code>portrait:</code> 전용 스타일은 실제 브라우저 창이 세로일 때만 완전히 적용됩니다.
        </p>
      </div>

      {/* 스테이지 */}
      <div ref={containerRef} className="flex-1 overflow-hidden bg-gray-950 flex items-center justify-center">
        <div style={{ width: stageW * scale, height: stageH * scale }}>
          <LanguageProvider>
            <LangController lang={lang} />
            <div className="service-theme relative overflow-hidden shadow-2xl" style={stageStyle}>
              {renderStep()}
            </div>
          </LanguageProvider>
        </div>
      </div>
    </div>
  );
}

// 촬영 화면 정적 플레이스홀더 (실제 CameraSection은 카메라/MediaPipe 필요)
function CameraPlaceholder() {
  const { t } = useLanguage();
  return (
    <section className="w-full h-full flex portrait:flex-col relative z-10">
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="camera-preview w-full h-full max-h-[80vh] flex flex-col items-center justify-center bg-black/40">
          <span className="text-8xl opacity-30">📷</span>
          <p className="mt-4 text-white/60 text-2xl">카메라 프리뷰 (미리보기 플레이스홀더)</p>
        </div>
      </div>
      <div className="w-80 shrink-0 p-6 flex flex-col gap-6 border-l border-white/10 bg-black/20 portrait:w-full portrait:border-l-0 portrait:border-t">
        <h3 className="text-white text-2xl font-bold text-center">{t("camera.shoot")}</h3>
        <button className="service-button nav-next-lg w-full">{t("camera.shoot")}</button>
        <div className="grid grid-cols-3 gap-2">
          {MOCK_PHOTOS.slice(0, 6).map((p, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={p} alt="" className="aspect-video w-full rounded-lg object-cover" />
          ))}
        </div>
      </div>
    </section>
  );
}
