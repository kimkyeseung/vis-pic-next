"use client";

import { useLanguage } from "@/i18n/LanguageContext";
import type { MessageKey } from "@/i18n/translations";
import { SERVICE_BIG_BUTTON_CLASS } from "./sectionLayout";

/**
 * 서비스 화면 공통 네비게이션: "다음" 버튼만 하단 중앙에 크게 배치한다.
 * (이전/재촬영 버튼은 제거됨 — 앞으로만 진행하는 흐름)
 * 각 화면의 콘텐츠는 중앙 정렬을 유지하고, 이 버튼은 화면 하단 중앙에 절대배치된다.
 * (부모 <section>은 relative여야 함)
 */
export function ServiceNav({
  onNext,
  nextKey = "common.next",
  nextDisabled = false,
}: {
  onNext: () => void;
  /** 다음 버튼 라벨 키 (예: 완료 화면은 "complete.print") */
  nextKey?: MessageKey;
  nextDisabled?: boolean;
  // 하위호환용 — 더 이상 렌더하지 않지만 호출부가 넘겨도 무시한다.
  onPrev?: () => void;
  prevKey?: MessageKey;
}) {
  const { t } = useLanguage();
  // 버튼을 절대배치 래퍼로 감싼다 — .service-button 자체가 position:relative(언레이어드)라
  // 버튼에 직접 Tailwind absolute를 걸면 무시된다.
  return (
    <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20">
      <button
        className={`service-button nav-next-lg ${SERVICE_BIG_BUTTON_CLASS}`}
        onClick={onNext}
        style={nextDisabled ? { opacity: 0.5, pointerEvents: "none" } : {}}
      >
        {t(nextKey)}
      </button>
    </div>
  );
}
