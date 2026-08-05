"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// 서비스 화면 디버그 모드 — 손님에겐 안 보이는 운영자 전용 토글.
// 켜는 법: 좌상단 로고 5회 연속 탭(2초 내) 또는 Ctrl+Shift+D.
// 상태는 sessionStorage에 저장돼 단계 전환에도 유지되며, 대기화면 초기화 시 함께 사라진다.

const KEY = "photobooth_debug";

function persistDebug(on: boolean) {
  try {
    if (on) sessionStorage.setItem(KEY, "1");
    else sessionStorage.removeItem(KEY);
  } catch {
    // sessionStorage unavailable
  }
}

type DebugCtx = {
  debug: boolean;
  toggle: () => void;
  set: (on: boolean) => void;
};

const DebugContext = createContext<DebugCtx>({
  debug: false,
  toggle: () => {},
  set: () => {},
});

export function DebugProvider({ children }: { children: React.ReactNode }) {
  const [debug, setDebug] = useState(false);

  // sessionStorage 복원 — SSR 마크업(false)과 일치시키려 콜백에서 반영(effect 동기 setState 회피)
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (sessionStorage.getItem(KEY) === "1") setDebug(true);
      } catch {
        // ignore
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const set = useCallback((on: boolean) => {
    setDebug(on);
    persistDebug(on);
  }, []);

  const toggle = useCallback(() => {
    setDebug((prev) => {
      const next = !prev;
      persistDebug(next);
      return next;
    });
  }, []);

  // Ctrl+Shift+D (데스크톱/키보드 병행 토글)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  return <DebugContext.Provider value={{ debug, toggle, set }}>{children}</DebugContext.Provider>;
}

export function useDebug() {
  return useContext(DebugContext);
}

/**
 * 비밀 탭 핸들러 — 지정 시간(windowMs) 내 taps회 연속 탭되면 onTrigger 발동.
 * 로고처럼 눈에 띄지 않는 요소에 붙여 우발적 발동을 막는다.
 */
export function useSecretTap(onTrigger: () => void, taps = 5, windowMs = 2000) {
  const times = useRef<number[]>([]);
  return useCallback(() => {
    const now = Date.now();
    times.current = times.current.filter((t) => now - t < windowMs);
    times.current.push(now);
    if (times.current.length >= taps) {
      times.current = [];
      onTrigger();
    }
  }, [onTrigger, taps, windowMs]);
}
