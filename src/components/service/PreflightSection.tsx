"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { DeviceConfig } from "@/types";

/**
 * 대기 화면 진입 전 시스템 점검 단계.
 *
 * 등급:
 * - 차단(blocking): 실패 시 진입하지 않고 4초 간격 자동 재시도 — 서버/설정/카메라
 * - 경고(warning): 표시만 하고 진입 허용 — 배경 애셋, AI 모델
 *
 * 번들 정합성 검사는 클라이언트에 인라인된 빌드 시각과 서버(/api/health)의
 * 빌드 시각을 비교해, 불일치 시(구버전 번들·서비스워커 캐시) 캐시를 정리하고
 * 1회 강제 새로고침으로 자가 복구한다.
 */

type CheckStatus = "pending" | "ok" | "warn" | "fail";

interface CheckItem {
  id: string;
  label: string;
  blocking: boolean;
  status: CheckStatus;
  detail?: string;
}

const CHECK_TIMEOUT_MS = 5000;
const RETRY_INTERVAL_MS = 4000;
const RELOAD_FLAG = "preflight_bundle_reloaded";

function withTimeout<T>(p: Promise<T>, ms = CHECK_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("응답 시간 초과")), ms)),
  ]);
}

function loadImageOk(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

const STATUS_ICON: Record<CheckStatus, string> = {
  pending: "…",
  ok: "✓",
  warn: "!",
  fail: "✕",
};

const STATUS_COLOR: Record<CheckStatus, string> = {
  pending: "bg-white/10 text-white/50",
  ok: "bg-green-500/80 text-white",
  warn: "bg-yellow-500/80 text-black",
  fail: "bg-red-500/80 text-white",
};

export function PreflightSection({
  deviceId,
  config,
  onReady,
}: {
  deviceId: string;
  config: DeviceConfig;
  onReady: () => void;
}) {
  const [checks, setChecks] = useState<CheckItem[]>([
    { id: "server", label: "서버 연결", blocking: true, status: "pending" },
    { id: "bundle", label: "앱 버전 정합성", blocking: false, status: "pending" },
    { id: "settings", label: "장치 설정", blocking: true, status: "pending" },
    { id: "assets", label: "배경 이미지", blocking: false, status: "pending" },
    { id: "ai", label: "AI 배경제거 모델", blocking: false, status: "pending" },
    { id: "camera", label: "카메라 장치", blocking: true, status: "pending" },
  ]);
  const [attempt, setAttempt] = useState(0);
  const doneRef = useRef(false);
  const bgRemovalModeRef = useRef(config.bgRemovalMode);
  // 점검 재실행 없이 최신 설정값만 참조 — ref 갱신은 렌더 중이 아닌 effect에서
  useEffect(() => {
    bgRemovalModeRef.current = config.bgRemovalMode;
  }, [config.bgRemovalMode]);

  const setCheck = useCallback((id: string, status: CheckStatus, detail?: string) => {
    setChecks((prev) => prev.map((c) => (c.id === id ? { ...c, status, detail } : c)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const set = (id: string, status: CheckStatus, detail?: string) => {
      if (!cancelled) setCheck(id, status, detail);
    };

    async function runChecks(): Promise<boolean> {
      // ① 서버 연결 + ② 번들 정합성 (health 응답 하나로 처리)
      let serverOk = false;
      try {
        const res = await withTimeout(fetch("/api/health/"));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json().catch(() => ({}));
        serverOk = true;
        set("server", "ok");

        const clientBuild = process.env.NEXT_PUBLIC_BUILD_DATE || null;
        const serverBuild = data.buildDate || null;
        if (!clientBuild || !serverBuild) {
          set("bundle", "warn", "빌드 시각 정보 없음");
        } else if (clientBuild === serverBuild) {
          set("bundle", "ok");
          try { sessionStorage.removeItem(RELOAD_FLAG); } catch { /* 무시 */ }
        } else {
          // 구버전 번들/서비스워커 캐시 감지 → 캐시 정리 후 1회 강제 새로고침
          let alreadyReloaded = false;
          try { alreadyReloaded = sessionStorage.getItem(RELOAD_FLAG) === "1"; } catch { /* 무시 */ }
          if (!alreadyReloaded) {
            set("bundle", "fail", "구버전 감지 — 캐시 정리 후 재시작합니다");
            try { sessionStorage.setItem(RELOAD_FLAG, "1"); } catch { /* 무시 */ }
            try {
              if ("caches" in window) {
                const keys = await caches.keys();
                await Promise.all(keys.map((k) => caches.delete(k)));
              }
              const regs = await navigator.serviceWorker?.getRegistrations?.();
              if (regs) await Promise.all(regs.map((r) => r.unregister()));
            } catch { /* 정리 실패해도 새로고침은 시도 */ }
            window.location.reload();
            return false;
          }
          set("bundle", "warn", `클라이언트 ${clientBuild} ≠ 서버 ${serverBuild}`);
        }
      } catch (err) {
        set("server", "fail", (err as Error).message);
        set("bundle", "pending");
      }

      // ③ 장치 설정
      if (serverOk) {
        try {
          const res = await withTimeout(fetch(`/api/device/${deviceId}/settings/`));
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          set("settings", "ok");
        } catch (err) {
          set("settings", "fail", (err as Error).message);
        }
      } else {
        set("settings", "fail", "서버 연결 필요");
      }

      // ④ 배경 애셋 (경고 등급)
      if (serverOk) {
        try {
          const res = await withTimeout(fetch(`/api/image/list/1/?device_id=${deviceId}&check_files=1`));
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          const first = data.images?.[0];
          if (!first) {
            set("assets", "warn", "업로드된 배경 없음 (기본 그라디언트 사용)");
          } else {
            const isVideo = /\.(mp4|webm)$/.test(first.filename);
            const ok = isVideo || (await withTimeout(loadImageOk(`${data.baseUrl}/${first.filename}`)));
            set("assets", ok ? "ok" : "warn", ok ? undefined : "배경 이미지 로드 실패 (스토리지 확인 필요)");
          }
        } catch (err) {
          set("assets", "warn", (err as Error).message);
        }
      } else {
        set("assets", "warn", "서버 연결 필요");
      }

      // ⑤ AI 모델 (mediapipe 모드일 때만, 경고 등급)
      if (bgRemovalModeRef.current !== "mediapipe") {
        set("ai", "ok", "사용 안 함");
      } else {
        try {
          const [wasmRes, modelRes] = await Promise.all([
            withTimeout(fetch("/static/mediapipe/wasm/vision_wasm_internal.wasm", { method: "HEAD" })),
            withTimeout(fetch("/static/mediapipe/model/selfie_multiclass_256x256.tflite", { method: "HEAD" })),
          ]);
          if (wasmRes.ok && modelRes.ok) {
            set("ai", "ok");
          } else {
            set("ai", "warn", `모델 파일 누락 (wasm ${wasmRes.status}, model ${modelRes.status}) — 원본 카메라로 폴백`);
          }
        } catch (err) {
          set("ai", "warn", (err as Error).message);
        }
      }

      // ⑥ 카메라 장치
      try {
        const devices = await withTimeout(navigator.mediaDevices.enumerateDevices());
        const cams = devices.filter((d) => d.kind === "videoinput");
        if (cams.length > 0) {
          set("camera", "ok", `${cams.length}대 감지`);
        } else {
          set("camera", "fail", "연결된 카메라 없음");
        }
      } catch (err) {
        set("camera", "fail", (err as Error).message);
      }

      return true;
    }

    runChecks();
    return () => { cancelled = true; };
  }, [attempt, deviceId, setCheck]);

  // 차단 항목이 전부 통과하면 잠시 결과를 보여준 뒤 진입,
  // 실패가 있으면 자동 재시도
  useEffect(() => {
    if (doneRef.current) return;
    const settled = checks.every((c) => c.status !== "pending");
    if (!settled) return;

    const blockingFailed = checks.some((c) => c.blocking && c.status === "fail");
    if (blockingFailed) {
      const t = setTimeout(() => setAttempt((n) => n + 1), RETRY_INTERVAL_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      doneRef.current = true;
      onReady();
    }, 700);
    return () => clearTimeout(t);
  }, [checks, onReady]);

  const hasFailure = checks.some((c) => c.blocking && c.status === "fail");

  return (
    <section className="w-full h-full flex flex-col items-center justify-center relative z-10" data-testid="preflight">
      <h2 className="text-3xl font-extrabold text-white mb-2" style={{ textShadow: "0 2px 15px rgba(0,0,0,0.5)" }}>
        시스템 점검 중
      </h2>
      <p className="text-gray-500 text-sm mb-10">
        {hasFailure ? "문제가 해결되면 자동으로 시작됩니다 (자동 재시도 중)" : "잠시만 기다려주세요"}
      </p>

      <div className="bg-black/30 border border-white/10 rounded-2xl p-6 min-w-[420px] flex flex-col gap-3">
        {checks.map((c) => (
          <div key={c.id} className="flex items-start gap-3">
            <span className={`w-6 h-6 shrink-0 rounded-full text-sm font-bold flex items-center justify-center ${STATUS_COLOR[c.status]}`}>
              {STATUS_ICON[c.status]}
            </span>
            <div className="min-w-0">
              <span className="text-white/90 text-sm font-medium">{c.label}</span>
              {c.detail && (
                <p className="text-white/40 text-xs mt-0.5 break-all">{c.detail}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="text-gray-600 text-xs mt-8">빌드 {process.env.NEXT_PUBLIC_BUILD_DATE}</p>
    </section>
  );
}
