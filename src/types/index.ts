import type { CameraResolutionId } from "@/constants/camera";

export type Orientation = "landscape" | "portrait";

export interface Sticker {
  id: string;
  src: string;    // 이미지 스티커 URL
  x: number;      // 0-1, canvas 너비 비율
  y: number;      // 0-1, canvas 높이 비율
  scale: number;
}

export interface MonitorInfo {
  index: number;
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
}

export type Step = "start" | "payment" | "frame" | "background" | "camera" | "select" | "printbg" | "complete";

export type BgRemovalMode = "mediapipe" | "chromakey" | "chromakey-yuv" | "off";

export type PaymentTerminalMode = "manual" | "payapp_lite";

export interface FrameInfoEntry {
  label: string;
  cols: number;
  rows: number;
  count: number;
  orientation: Orientation;
}

/** 결제 티어: 인쇄 매수(qty)별 개별 가격(price). */
export type PaymentTier = { qty: number; price: number };

export interface DeviceConfig {
  deviceId: string;
  deviceName: string;
  paymentEnabled: boolean;
  /** 1장당 가격. 결제 화면 매수 티어 가격 = paymentAmount × 수량(1/2/4 고정). */
  paymentAmount: number;
  /** 인쇄 매수별 가격 티어(1/2/4장). 결제 화면 카드 = 이 목록, 총액 = 선택 티어 가격. */
  paymentTiers: PaymentTier[];
  paymentTerminalMode: PaymentTerminalMode;
  captureSeconds: number;
  captureCount: number;
  /** 촬영 카메라 해상도(화질) 티어 id. 미설정 시 "fhd". */
  cameraResolution: CameraResolutionId;
  chromakeyRgb: string;
  /** 크로마키 감도(색상 허용 거리, 1-100). 높을수록 키 색과 더 먼 색까지 제거. 기본 50. */
  chromakeySimilarity: number;
  /** 크로마키 경계 부드러움(0-100). 낮을수록 경계가 또렷하게 잘리고, 높을수록 부드럽게 번진다. 기본 50. */
  chromakeySmoothness: number;
  /** 크로마키 스필 제거(0-100). 인물 테두리에 남는 키 색 번짐(초록/파랑기)을 눌러 제거. 기본 0(끔). */
  chromakeySpill: number;
  /** 크로마키 경계 침식(0-100). 인물 마스크 경계를 안쪽으로 깎아 가장자리 프린지를 제거. 기본 0(끔). */
  chromakeyChoke: number;
  /** 밝기 무시 키잉. 켜면 밝기 차이를 무시하고 색만 비교해 그늘/얼룩진 그린스크린도 고르게 제거. 기본 false. */
  chromakeyLumaIndependent: boolean;
  /** OBS 방식(YUV) 크로마키 색상. bgRemovalMode가 "chromakey-yuv"일 때 사용. */
  chromakeyYuvRgb: string;
  /** OBS 방식 크로마키 감도(1-100). 높을수록 키 색과 더 먼 색까지 제거. 기본 50. */
  chromakeyYuvSimilarity: number;
  /** OBS 방식 크로마키 경계 부드러움(0-100). 기본 50. */
  chromakeyYuvSmoothness: number;
  /** OBS 방식 크로마키 스필 제거(0-100). 기본 0(끔). */
  chromakeyYuvSpill: number;
  /** OBS 방식 크로마키 결과 전체 투명도 배율(0-100). 100=원본 그대로. */
  chromakeyYuvOpacity: number;
  /** OBS 방식 크로마키 결과 대비 보정(-100~100). 0=변화 없음. */
  chromakeyYuvContrast: number;
  /** OBS 방식 크로마키 결과 명암(밝기) 보정(-100~100). 0=변화 없음. */
  chromakeyYuvBrightness: number;
  /** OBS 방식 크로마키 결과 감마 보정(-100~100). 0=변화 없음. */
  chromakeyYuvGamma: number;
  captureModes: string[];
  bgRemovalMode: BgRemovalMode;
  idleTimeoutSeconds: number;
  cameraAutoTimerSeconds: number;
  printAutoTimerSeconds: number;
  /** AI 배경제거 경계 침식 정도 (0-100%). 높을수록 인물 가장자리를 안쪽으로 더 깎아낸다. */
  segmentThreshold: number;
  /** AI 배경제거 경계 부드러움 (0-100%). 낮을수록 경계가 더 또렷하게 잘린다. */
  segmentFeather: number;
  /** 테마 글자 색상 (서비스 화면). 미설정 시 #ffffff. */
  themeTextColor: string;
  /** 테마 강조(primary) 색상 — 선택 강조·주요 버튼. 미설정 시 #6c6fb4. */
  themePrimaryColor: string;
  /** 테마 배경 단색 — 첫 화면을 제외한 나머지 서비스 화면 배경. 미설정 시 #2a2a2a. */
  themeBgColor: string;
  /** 버튼 탭 시 외곽 글로우 효과 사용 여부. */
  btnGlowEnabled: boolean;
  /** 버튼 글로우 색상. */
  btnGlowColor: string;
  /** 버튼 글로우 세기(번짐 px). */
  btnGlowSize: number;
  /** '촬영하기' 버튼 텍스트 색상. 미설정 시 #2a2a2a(어두운 글자, 기본 흰 버튼 배경 기준). */
  btnCaptureTextColor: string;
  /** '다음으로' 버튼 텍스트 색상. 미설정 시 #ffffff. */
  btnNextTextColor: string;
  /** '결제하기' 버튼 텍스트 색상. 미설정 시 #ffffff. */
  btnPaymentTextColor: string;
}

export interface BGImage {
  id: number;
  name: string;
  filename: string;
  active?: boolean;
  focalX?: number;
  focalY?: number;
  /** 배경 전용: 동작(제스처) 트리거 시 재생되는 이펙트 영상 파일명. 없으면 null/undefined. */
  effectFilename?: string | null;
  /** 이펙트 영상 최대 재생 시간(초). 미지정이면 기본값 사용. */
  effectDuration?: number | null;
  /** 이펙트를 발동시키는 제스처(MediaPipe 카테고리). 미지정이면 기본값(Victory). */
  effectGesture?: string | null;
  /** 이펙트 재생 모드(dissolve|transition|chromakey). 미지정이면 dissolve. */
  effectMode?: string | null;
  /** dissolve 모드 블렌드 방식(CSS mix-blend-mode). 미지정이면 screen. */
  effectBlendMode?: string | null;
  /** transition 모드 전환 효과(fade|cut). 미지정이면 fade. */
  effectTransition?: string | null;
  /** transition 모드 크로스페이드 지속 시간(ms). 미지정이면 기본값. */
  effectTransitionMs?: number | null;
  /** chromakey 모드 키 색상(R,G,B). 미지정이면 "0,255,0". */
  effectChromaColor?: string | null;
  /** chromakey 모드 감도(1-100). 미지정이면 50. */
  effectChromaSimilarity?: number | null;
  /** chromakey 모드 경계 부드러움(0-100). 미지정이면 50. */
  effectChromaSmoothness?: number | null;
}

export interface FallbackBackground {
  id: number;
  gradient: string;
  name: string;
}

export interface Device {
  id: number;
  deviceId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  /** 이 장치에 실행 비밀번호가 설정돼 있는지 여부. 해시 자체는 클라이언트로 내려보내지 않는다. */
  hasPassword?: boolean;
  createdAt: string;
}

export interface DeviceSetting {
  id: number;
  name: string;
  value: string;
  description: string | null;
}

export interface DeviceWithSettings extends Device {
  settings: DeviceSetting[];
}
