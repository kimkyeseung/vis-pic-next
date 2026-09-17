"use client";

import { useEffect } from "react";

/** 초기(모드 선택) 화면으로 돌아가는 운영자 단축키. 안내 문구에도 이 상수를 쓴다. */
export const HOME_SHORTCUT_LABEL = "Ctrl+Shift+H";

/**
 * 서비스/관리자 화면 어디서든 초기(모드 선택) 화면으로 빠져나오는 운영자용 단축키 —
 * Ctrl+Shift+H (macOS는 ⌘+Shift+H). 루트 레이아웃에 상주해 모든 화면에서 먹는다.
 *
 * 서비스 화면은 손님 앞 키오스크라 눈에 띄는 나가기 버튼을 둘 수 없어 단축키가 주 경로이고
 * (키보드 없는 기기를 위해 대기 화면 운영자 패널에도 같은 동작의 버튼을 둔다),
 * 관리자 화면은 사이드바 '초기화면' 버튼과 동일한 동작이다.
 *
 * SPA 이동(router.push)이 아니라 전체 새로고침으로 나가, 촬영 중이던 카메라 스트림·
 * MediaPipe 리소스가 확실히 해제된 상태로 초기 화면에 서게 한다.
 * (Ctrl+Shift+D 디버그 토글과 같은 결의 조합 — 손님이 우발적으로 누를 수 없다.)
 */
export default function HomeShortcut() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey) return;
      if (e.key !== "h" && e.key !== "H") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (window.location.pathname === "/") return; // 이미 초기 화면
      window.location.assign("/");
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);

  return null;
}
