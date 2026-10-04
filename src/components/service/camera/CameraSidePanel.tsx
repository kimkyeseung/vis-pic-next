"use client";

import { useLanguage } from "@/i18n/LanguageContext";
import type { Sticker } from "@/types";

/**
 * 촬영 화면 우측(가로)·우하단(세로) 컬럼 — 스티커 뱅크, 촬영/제스처 안내, 남은 촬영 매수를 함께
 * 렌더링한다. 세 블록이 서로 다른 관심사처럼 보여도 한 파일로 묶어 둔 이유: 이 컬럼과 좌측
 * `BackgroundPickerPanel`의 시작/끝 줄을 픽셀 단위로 맞추는 레이아웃 주석(margin/padding 값)이
 * 세 블록에 걸쳐 있어, 따로 쪼개면 그 맞춤 관계가 파일 경계에 가려 깨지기 쉽다.
 */
export function CameraSidePanel({
  stickers,
  onStickersChange,
  dbStickerImages,
  addSticker,
  imageBaseUrl,
  showGestureHint,
  maxPhotos,
  photosCount,
}: {
  stickers: Sticker[];
  onStickersChange: (stickers: Sticker[]) => void;
  dbStickerImages: Array<{ id: number; filename: string; name: string }>;
  addSticker: (src: string) => void;
  imageBaseUrl: string;
  showGestureHint: boolean;
  maxPhotos: number;
  photosCount: number;
}) {
  const { t } = useLanguage();

  return (
    // 우측(가로)·우하단(세로): 스티커 패널.
    // overflow-auto였던 걸 제거 — "남은 촬영 횟수" 박스의 boxShadow 글로우가 우측 여백 없이
    // 이 컬럼 우측 끝(페이지 패딩선)에 딱 붙어 있어, overflow가 있으면 글로우가 그대로
    // 잘려 안 보였다. 스티커 그리드 자체는 이미 shrink-0(위)이라 컬럼 밖으로 안 넘치고,
    // 8개 초과 스크롤은 그리드 박스 자체의 overflow-y-auto로 별도 처리된다.
    <div className="flex flex-col min-h-0 pl-4" style={{ gridArea: "sticker" }}>
      <h3 className="text-white text-2xl font-bold text-center mb-4 shrink-0">{t("camera.stickerPrompt")}</h3>

      {/* 스티커 패널 (상시 노출) — shrink-0: 이 래퍼가 min-h-0라 부모(stickerCol)의
          flex-shrink 배분 대상이 되면, 안의 그리드(shrink-0, aspect-ratio 고정 높이)는
          더 줄어들지 못하고 래퍼 밖으로 그대로 넘쳐(overflow) 아래 안내 박스와 겹쳐 보였다.
          래퍼를 shrink-0으로 고정해 공간 부족분이 전부 안내 박스(flex-1) 쪽으로만 가게 한다. */}
      <div className="flex flex-col shrink-0 mb-2 portrait:mb-4">
        <div className="flex items-center justify-end mb-2 min-h-[22px]">
          {stickers.length > 0 && (
            <button
              className="text-xs text-white/40 hover:text-white/70 transition-colors"
              onClick={() => onStickersChange([])}
            >
              {t("camera.clearStickers")}
            </button>
          )}
        </div>

        {/* 스티커 영역은 항상 2줄 높이로 고정(스티커가 없거나 8개 초과여도 동일 크기).
            aspect-[1.9/1]: 4열 정사각 타일 2줄 높이에 맞춘 비율(폭에 따라 세로/가로 모두 2줄 유지).
            9개 이상이면 이 고정 높이 안에서 세로 스크롤.
            배경 제거 모드가 꺼져 배경 패널 없이 이 컬럼이 훨씬 넓어지는 경우, 폭에 비례해
            늘어난 aspect-ratio 높이가 아래 안내 박스를 침범해 겹쳐 보였다 — max-w로 폭 자체를
            막아 비율에서 나오는 높이도 함께 억제하고, mx-auto로 넓어진 컬럼 안에서 중앙 정렬한다.
            aspect-ratio로 계산한 박스 높이와 실제 타일 2줄 높이(패딩·gap 반영)가 정확히
            들어맞지 않아 하단에 여백이 살짝 남는다 — flex justify-center로 흡수한다.
            w-full 없이 mx-auto만 있으면 flex 자식의 기본 stretch 정렬이 auto-margin
            때문에 무효화돼 박스가 콘텐츠 크기로 줄어든다 — 스티커 로딩 전 "없음" 문구만
            있을 때 박스가 글자 폭(≈126px)까지 쪼그라들던 원인. w-full로 항상 그리드 폭
            그대로 유지한다. */}
        <div className="aspect-[1.9/1] w-full max-w-[480px] mx-auto shrink-0 overflow-y-auto bg-black/20 rounded-2xl p-2 flex flex-col justify-center">
          {dbStickerImages.length === 0 ? (
            <p className="flex h-full items-center justify-center text-center text-white/40 text-sm">
              {t("camera.noStickers")}
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-1.5">
              {dbStickerImages.map((img) => (
                <button
                  key={img.id}
                  className="aspect-square w-full rounded-xl overflow-hidden hover:ring-2 hover:ring-white/50 transition-all bg-white/5"
                  onClick={() => addSticker(`${imageBaseUrl}/${img.filename}`)}
                  title={img.name}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${imageBaseUrl}/${img.filename}`}
                    alt={img.name}
                    className="w-full h-full object-contain"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 손바닥 촬영 안내 — 스티커와 남은 촬영 횟수 사이 여백에 강조 표시.
          위아래 박스(스티커 패널·남은 촬영 횟수)와 같은 너비로 보이도록 w-full로 맞춘다.
          items-start로 스티커 패널 바로 아래에 붙여 사이 간격을 좁힌다(남는 세로 공간은 아래로).
          현재 배경에 동작 트리거 이펙트가 설정돼 있으면, 같은 박스를 절반으로 나눠 아래쪽에
          그 제스처 안내 문구를 추가한다(안내 문구 앞 이모지는 쓰지 않는다).
          min-h-0을 주지 않아 내용(특히 영·일·중 등 문구가 길어지는 언어)보다 작게 찌그러들지
          않게 한다 — 예전엔 min-h-0 때문에 공간이 부족하면 이 박스가 눌려 아래 "남은 촬영
          횟수" 박스와 겹쳐 보이는 버그가 있었다. */}
      <div className="flex-1 portrait:flex-0 flex items-start mb-2 portrait:mb-4">
        <div className="w-full rounded-2xl overflow-hidden border border-[var(--theme-primary,#6c6fb4)]/50 bg-[var(--theme-primary,#6c6fb4)]/10">
          {/* 세로 모드는 두 안내가 한 박스 안에 나란히 들어가 py-6이면 높이가 넘쳐 아래
              박스와 겹쳤다 — 세로에서만 py-3으로 줄인다(가로는 원래대로 유지). */}
          <div className="text-center px-6 py-6 portrait:py-3">
            {/* break-keep(word-break: keep-all)를 쓰지 않는다 — 한국어/영어는 공백 기준으로
                잘 줄바꿈되지만, 일본어·중국어 문구는 공백이 없어 keep-all이면 줄바꿈 지점을
                못 찾아 박스 밖으로 넘쳐 overflow-hidden에 잘려 보이는 문제가 있었다. */}
            {/* whitespace-pre-line: 번역문에 \n이 있으면 그 지점에서 줄바꿈. 한국어는 자동
                줄바꿈에 맡기면 좁은 화면에서 단어 중간이 끊겨 보일 수 있어 어절 경계에
                \n을 미리 넣어 항상 깔끔하게 2줄로 보이게 한다. */}
            <p className="text-white font-extrabold text-xl leading-snug whitespace-pre-line">
              {t("camera.palmHint")}
            </p>
          </div>
          {showGestureHint && (
            <div className="text-center px-6 py-6 portrait:py-3 border-t border-[var(--theme-primary,#6c6fb4)]/30">
              {/* 영어 번역문은 \n으로 2줄에 균형 있게 나뉘도록 강제한다 — 그냥 두면 자동
                  줄바꿈이 3줄로 떨어져(위 손바닥 안내는 2줄인데) 박스 높이가 들쭉날쭉해 보였다. */}
              <p className="text-white font-extrabold text-xl leading-snug whitespace-pre-line">
                {t("camera.effectHint")}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 남은 촬영 횟수 — 가로에서도 좌측 배경 선택 패널의 보이는 끝선과 맞도록 위로 올린다
          (mb-[212px]). 세로에선 별도로 높이를 줄이고(py-3) 위로 올린다(mb-[8.625rem]). */}
      <div
        className="shrink-0 w-full text-center border border-dashed border-white/30 rounded-xl py-3 mb-[212px] portrait:mb-[8.625rem]"
        style={{ boxShadow: "0 0 34px -10px var(--theme-primary, #6c6fb4)" }}
      >
        <span className="text-white font-bold text-3xl">
          {t("camera.remaining", { n: String(Math.max(0, maxPhotos - photosCount)) })}
        </span>
      </div>
    </div>
  );
}
