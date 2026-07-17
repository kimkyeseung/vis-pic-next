import type { FrameInfoEntry, FallbackBackground } from "@/types";

export const FRAME_INFO: Record<string, FrameInfoEntry> = {
  "1x1": { label: "1컷", cols: 1, rows: 1, count: 1, orientation: "landscape" },
  "2x1": { label: "2컷", cols: 1, rows: 2, count: 2, orientation: "portrait" },
  "2x2": { label: "4컷", cols: 2, rows: 2, count: 4, orientation: "landscape" },
  "2x3": { label: "6컷", cols: 3, rows: 2, count: 6, orientation: "landscape" },
  "2x4": { label: "8컷", cols: 2, rows: 4, count: 8, orientation: "portrait" },
  "4x1": { label: "4컷", cols: 1, rows: 4, count: 4, orientation: "portrait" },
};

export const ALL_MODES = Object.keys(FRAME_INFO);

export const FALLBACK_BACKGROUNDS: FallbackBackground[] = [
  { id: -1, gradient: "linear-gradient(135deg, #ff6b9d 0%, #c44fd5 100%)", name: "Pink Purple" },
  { id: -2, gradient: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)", name: "Blue Cyan" },
  { id: -3, gradient: "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)", name: "Green Mint" },
  { id: -4, gradient: "linear-gradient(135deg, #fa709a 0%, #fee140 100%)", name: "Pink Yellow" },
  { id: -5, gradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", name: "Indigo Purple" },
  { id: -6, gradient: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)", name: "Pink Red" },
];
