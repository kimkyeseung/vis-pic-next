"use client";

import { useLanguage } from "@/i18n/LanguageContext";
import type { MessageKey } from "@/i18n/translations";

/**
 * 서비스 화면 공통 네비게이션: "이전"(좌하단, 회색) / "다음"(우하단, 크게).
 * 각 화면의 콘텐츠는 중앙 정렬을 유지하고, 이 버튼들은 화면 모서리에 절대배치된다.
 * (부모 <section>은 relative여야 함)
 */
export function ServiceNav({
  onPrev,
  onNext,
  prevKey = "common.prev",
  nextDisabled = false,
}: {
  onPrev: () => void;
  onNext: () => void;
  /** 이전 버튼 라벨 키 (예: 재촬영은 "select.reshoot") */
  prevKey?: MessageKey;
  nextDisabled?: boolean;
}) {
  const { t } = useLanguage();
  return (
    <>
      <button
        className="service-button nav-button absolute bottom-8 left-8 z-20 portrait:bottom-5 portrait:left-5"
        style={{ background: "rgba(255,255,255,0.1)", color: "#fff" }}
        onClick={onPrev}
      >
        &#9664; {t(prevKey)}
      </button>
      <button
        className="service-button nav-button nav-next-lg absolute bottom-8 right-8 z-20 portrait:bottom-5 portrait:right-5"
        onClick={onNext}
        style={nextDisabled ? { opacity: 0.5, pointerEvents: "none" } : {}}
      >
        {t("common.next")} &#9654;
      </button>
    </>
  );
}
