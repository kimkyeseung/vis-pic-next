import type { CameraResolutionId } from "@/constants/camera";

export type Orientation = "landscape" | "portrait";

export interface Sticker {
  id: string;
  emoji?: string; // 이모지 스티커
  src?: string;   // 이미지 스티커 URL
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

export type BgRemovalMode = "mediapipe" | "chromakey" | "off";

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
