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

export interface DeviceConfig {
  deviceId: string;
  deviceName: string;
  paymentEnabled: boolean;
  paymentAmount: number;
  paymentTerminalMode: PaymentTerminalMode;
  captureSeconds: number;
  captureCount: number;
  chromakeyRgb: string;
  captureModes: string[];
  bgRemovalMode: BgRemovalMode;
  idleTimeoutSeconds: number;
  cameraAutoTimerSeconds: number;
  printAutoTimerSeconds: number;
  /** AI 배경제거 경계 침식 정도 (0-100%). 높을수록 인물 가장자리를 안쪽으로 더 깎아낸다. */
  segmentThreshold: number;
  /** AI 배경제거 경계 부드러움 (0-100%). 낮을수록 경계가 더 또렷하게 잘린다. */
  segmentFeather: number;
}

export interface BGImage {
  id: number;
  name: string;
  filename: string;
  focalX?: number;
  focalY?: number;
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
