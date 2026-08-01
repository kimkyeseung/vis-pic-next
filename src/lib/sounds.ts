// 촬영 효과음.
// - 카운트다운 비프: Web Audio API(OscillatorNode)로 실시간 합성. 원본 counting.wav
//   (≈370Hz, ~350ms 비프, 1초 주기)를 대체하므로 1.2MB 파일이 필요 없다.
// - 셔터(찰칵): 광대역 클릭 노이즈라 합성으로 자연스럽게 내기 어려워 녹음 파일 사용.
const SOUND_BASE = "/static/sounds";

const COUNTING_FREQ = 370; // Hz — 원본 counting.wav 분석값
const COUNTING_MS = 300; // 비프 길이 (원본 삐 구간 ~350ms)

function makeAudio(file: string): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;
  const audio = new Audio(`${SOUND_BASE}/${file}`);
  audio.preload = "auto";
  return audio;
}

export interface SoundPlayer {
  /** 카운트다운 1틱: 짧은 비프를 한 번 재생 (최대 maxMs로 상한). */
  playCountingTick: (maxMs?: number) => void;
  /** 셔터(찰칵) 재생. 진행 중인 카운트다운 비프는 중단한다. */
  playShutter: () => void;
  dispose: () => void;
}

export function createSoundPlayer(): SoundPlayer {
  const shutter = makeAudio("shutter.wav");

  const AudioCtx =
    typeof window !== "undefined"
      ? window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;
  let ctx: AudioContext | null = null;
  let currentOsc: OscillatorNode | null = null;

  const getCtx = (): AudioContext | null => {
    if (!AudioCtx) return null;
    if (!ctx) ctx = new AudioCtx();
    // 사용자 제스처 전이라 suspended면 재개 시도
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  };

  const stopBeep = () => {
    if (currentOsc) {
      try {
        currentOsc.stop();
      } catch {
        /* 이미 멈춤 */
      }
      currentOsc = null;
    }
  };

  return {
    playCountingTick(maxMs = 1000) {
      const c = getCtx();
      if (!c) return;
      stopBeep();
      const dur = Math.min(COUNTING_MS, maxMs) / 1000;
      const now = c.currentTime;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "triangle"; // 사인보다 배음이 있어 원본 비프에 더 가깝다
      osc.frequency.value = COUNTING_FREQ;
      // 짧은 attack → 유지 → decay 엔벨로프 (클릭 노이즈 방지)
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.5, now + 0.01);
      gain.gain.setValueAtTime(0.5, now + Math.max(0.02, dur - 0.05));
      gain.gain.linearRampToValueAtTime(0.0001, now + dur);
      osc.connect(gain).connect(c.destination);
      osc.start(now);
      osc.stop(now + dur);
      currentOsc = osc;
      osc.onended = () => {
        if (currentOsc === osc) currentOsc = null;
      };
    },
    playShutter() {
      stopBeep();
      if (!shutter) return;
      try {
        shutter.currentTime = 0;
        // play()는 Promise 반환 — 실패(형식 미지원·자동재생 차단 등) 시 unhandled rejection이
        // 뜨지 않도록 반드시 catch 한다.
        shutter.play().catch(() => {});
      } catch {
        /* 무시 */
      }
    },
    dispose() {
      stopBeep();
      shutter?.pause();
      if (ctx) {
        void ctx.close();
        ctx = null;
      }
    },
  };
}
