export type Orientation = "landscape" | "portrait";

export type Step = "start" | "payment" | "frame" | "background" | "camera" | "select" | "complete";

export type BgRemovalMode = "mediapipe" | "chromakey" | "off";

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
  captureSeconds: number;
  captureCount: number;
  chromakeyRgb: string;
  captureModes: string[];
  bgRemovalMode: BgRemovalMode;
  idleTimeoutSeconds: number;
  cameraAutoTimerSeconds: number;
}

export interface BGImage {
  id: number;
  name: string;
  filename: string;
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
