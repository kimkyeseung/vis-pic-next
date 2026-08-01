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
  nextKey = "common.next",
  nextDisabled = false,
}: {
  onPrev: () => void;
  onNext: () => void;
  /** 이전 버튼 라벨 키 (예: 재촬영은 "select.reshoot") */
  prevKey?: MessageKey;
  /** 다음 버튼 라벨 키 (예: 완료 화면은 "complete.print") */
  nextKey?: MessageKey;
  nextDisabled?: boolean;
}) {
  const { t } = useLanguage();
  // 버튼을 절대배치 래퍼로 감싼다 — .service-button 자체가 position:relative(언레이어드)라
  // 버튼에 직접 Tailwind absolute를 걸면 무시된다.
  return (
    <>
      <div className="absolute bottom-16 left-16 z-20 portrait:bottom-10 portrait:left-10">
        <button
          className="service-button nav-button"
          style={{ background: "rgba(255,255,255,0.1)", color: "#fff" }}
          onClick={onPrev}
        >
          &#9664; {t(prevKey)}
        </button>
      </div>
      <div className="absolute bottom-16 right-16 z-20 portrait:bottom-10 portrait:right-10">
        <button
          className="service-button nav-button nav-next-lg"
          onClick={onNext}
          style={nextDisabled ? { opacity: 0.5, pointerEvents: "none" } : {}}
        >
          {t(nextKey)} &#9654;
        </button>
      </div>
    </>
  );
}
