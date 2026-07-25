// MediaPipe/TFLite(WASM)는 정상 동작 중에도 stderr로 INFO·경고 로그를 내보내는데
// tasks-vision가 이를 console.error/warn/info로 라우팅한다. Next.js 개발 오버레이는
// console.error를 전체화면 에러 창으로 띄워 카메라 화면을 가리므로, 이 알려진 노이즈만
// 걸러낸다. 실제 예외는 throw로 전달되므로 영향 없음.
//
// 예: "INFO: Created TensorFlow Lite XNNPACK delegate for CPU.",
//     "W0000 00:00:...", "I0000 00:00:..." (glog 포맷)
const NOISE = /^(INFO:|WARNING:|W\d{4}\b|I\d{4}\b)|TensorFlow Lite XNNPACK|Created TensorFlow Lite/;

let patched = false;

export function suppressMediapipeLogs() {
  if (patched || typeof window === "undefined") return;
  patched = true;
  (["error", "warn", "info", "log"] as const).forEach((method) => {
    const orig = console[method].bind(console);
    console[method] = (...args: unknown[]) => {
      const first = args[0];
      if (typeof first === "string" && NOISE.test(first)) return;
      orig(...args);
    };
  });
}
