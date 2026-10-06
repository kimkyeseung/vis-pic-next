"use client";

import { useState } from "react";
import { useAdmin } from "@/app/admin/AdminContext";
import { ThemePreviewModal } from "./ThemePreviewModal";
import { PageWallpaperCard } from "./PageWallpaperCard";
import {
  OVERLAY_NAME_CAMERA,
  WALLPAPER_NAME_LANDSCAPE,
  WALLPAPER_NAME_PORTRAIT,
  WALLPAPER_NAME_SUB_LANDSCAPE,
  WALLPAPER_NAME_SUB_PORTRAIT,
} from "@/constants/images";
import { useThemeSettings } from "./useThemeSettings";
import { AssetUploader, AssetUploaderRow } from "./AssetUploader";
import { ButtonThemeRow } from "./ButtonThemeRow";
import { ColorRow } from "./ColorRow";
import { ButtonGlowPreview } from "./ButtonGlowPreview";

export default function ThemeSettingPage() {
  const { selectedDevice } = useAdmin();
  const deviceId = selectedDevice?.deviceId ?? null;
  const t = useThemeSettings(deviceId);
  const [previewOpen, setPreviewOpen] = useState(false);

  if (t.loading) return <div className="text-gray-400">로딩중...</div>;
  if (!selectedDevice) return <div className="p-8 bg-gray-800 rounded-xl text-center text-gray-400">상단에서 지점을 선택하세요.</div>;

  return (
    <div className="max-w-3xl space-y-4">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">테마 관리</h2>
          <p className="mt-1 text-sm text-gray-500">
            <span className="text-white font-medium">{selectedDevice.name}</span> 지점 테마입니다. (배경화면·로고·버튼 이미지·색상)
          </p>
        </div>
        <button
          onClick={() => setPreviewOpen(true)}
          className="shrink-0 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors"
        >
          미리보기
        </button>
      </div>

      {/* 배경화면 · 첫(대기) 화면 — 가로/세로 두 장을 한 카드에 묶는다. */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 divide-y divide-gray-700">
        <div className="px-6 pt-5 pb-1">
          <h3 className="text-white font-semibold text-base">배경화면 · 첫(대기) 화면</h3>
          <p className="text-gray-500 text-xs mt-1">
            대기(첫) 화면에만 깔리는 배경입니다. 화면 방향에 맞춰 가로/세로 이미지가 자동으로 선택되고, 한쪽만 올리면 그 이미지가 양쪽에 쓰입니다. 둘 다 미설정 시 아래 &apos;배경 단색&apos;이 사용됩니다. (jpg/png/webp/gif, 최대 50MB)
          </p>
        </div>

        <AssetUploaderRow
          title="가로 화면용"
          description="가로(landscape) 키오스크의 첫 화면 배경."
          asset={t.wallpaperLs}
          onUpload={t.uploadAsset(t.WALLPAPER_TYPE, WALLPAPER_NAME_LANDSCAPE, t.wallpaperLs, t.setWallpaperLs, t.setWallpaperLsBusy)}
          onRemove={t.removeAsset(t.wallpaperLs, t.setWallpaperLs, t.setWallpaperLsBusy)}
          busy={t.wallpaperLsBusy}
          previewClass="w-64 aspect-video"
          imageFit="cover"
          emptyLabel="기본 배경 (#2a2a2a)"
        />

        <AssetUploaderRow
          title="세로 화면용"
          description="세로(portrait) 키오스크의 첫 화면 배경."
          asset={t.wallpaperPt}
          onUpload={t.uploadAsset(t.WALLPAPER_TYPE, WALLPAPER_NAME_PORTRAIT, t.wallpaperPt, t.setWallpaperPt, t.setWallpaperPtBusy)}
          onRemove={t.removeAsset(t.wallpaperPt, t.setWallpaperPt, t.setWallpaperPtBusy)}
          busy={t.wallpaperPtBusy}
          previewClass="w-40 aspect-[9/16]"
          imageFit="cover"
          emptyLabel="기본 배경 (#2a2a2a)"
        />
      </div>

      {/* 배경화면 · 나머지 화면 — 첫 화면을 제외한 모든 단계(배경 단색이 쓰이던 자리). */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 divide-y divide-gray-700">
        <div className="px-6 pt-5 pb-1">
          <h3 className="text-white font-semibold text-base">배경화면 · 나머지 화면 (공통)</h3>
          <p className="text-gray-500 text-xs mt-1">
            첫(대기) 화면을 제외한 모든 서비스 화면(촬영·선택·편집·결제·완료 등)에 공통으로 깔리는 배경입니다. 아래 &apos;화면별 배경화면&apos;을 지정한 화면은 그 이미지가 우선합니다. 화면 방향에 맞춰 가로/세로 이미지가 자동으로 선택되고, 한쪽만 올리면 그 이미지가 양쪽에 쓰입니다. 둘 다 미설정 시 아래 &apos;배경 단색&apos;이 사용됩니다. (jpg/png/webp/gif, 최대 50MB)
          </p>
        </div>

        <AssetUploaderRow
          title="가로 화면용"
          description="가로(landscape) 키오스크의 나머지 화면 배경."
          asset={t.wallpaperSubLs}
          onUpload={t.uploadAsset(t.WALLPAPER_TYPE, WALLPAPER_NAME_SUB_LANDSCAPE, t.wallpaperSubLs, t.setWallpaperSubLs, t.setWallpaperSubLsBusy)}
          onRemove={t.removeAsset(t.wallpaperSubLs, t.setWallpaperSubLs, t.setWallpaperSubLsBusy)}
          busy={t.wallpaperSubLsBusy}
          previewClass="w-64 aspect-video"
          imageFit="cover"
          emptyLabel="배경 단색 사용"
        />

        <AssetUploaderRow
          title="세로 화면용"
          description="세로(portrait) 키오스크의 나머지 화면 배경."
          asset={t.wallpaperSubPt}
          onUpload={t.uploadAsset(t.WALLPAPER_TYPE, WALLPAPER_NAME_SUB_PORTRAIT, t.wallpaperSubPt, t.setWallpaperSubPt, t.setWallpaperSubPtBusy)}
          onRemove={t.removeAsset(t.wallpaperSubPt, t.setWallpaperSubPt, t.setWallpaperSubPtBusy)}
          busy={t.wallpaperSubPtBusy}
          previewClass="w-40 aspect-[9/16]"
          imageFit="cover"
          emptyLabel="배경 단색 사용"
        />
      </div>

      <PageWallpaperCard t={t} />

      <AssetUploader
        title="촬영 화면 안내 오버레이"
        description="촬영 화면의 카메라 미리보기(4:3) 위에 겹쳐 보이는 안내 이미지입니다(예: '손바닥을 펴면 촬영돼요'). 화면에만 보이고 촬영된 사진에는 들어가지 않으며, 카운트다운이 시작되면 사라집니다. 투명 배경 PNG를 권장하며 1600×1200px(4:3) 크기로 만들면 화면에 딱 맞습니다."
        asset={t.namedAssets[OVERLAY_NAME_CAMERA] ?? null}
        onUpload={t.uploadNamed(OVERLAY_NAME_CAMERA)}
        onRemove={t.removeNamed(OVERLAY_NAME_CAMERA)}
        busy={!!t.namedBusy[OVERLAY_NAME_CAMERA]}
        previewClass="w-64 aspect-[4/3] bg-[repeating-conic-gradient(#3a3a3a_0%_25%,#2a2a2a_0%_50%)] bg-[length:16px_16px]"
        imageFit="contain"
        emptyLabel="오버레이 없음"
      />

      <AssetUploader
        title="로고"
        description="첫(대기) 화면을 제외한 서비스 화면 좌측 상단에 표시되는 로고입니다. 배경 위에 얹히므로 투명 배경 PNG를 권장합니다. 미설정 시 기본 로고(AR-pic)가 사용됩니다."
        asset={t.logo}
        onUpload={t.uploadAsset(t.LOGO_TYPE, "logo", t.logo, t.setLogo, t.setLogoBusy)}
        onRemove={t.removeAsset(t.logo, t.setLogo, t.setLogoBusy)}
        busy={t.logoBusy}
        previewClass="w-64 h-28 p-3"
        imageFit="contain"
        emptyLabel="기본 로고 (AR-pic)"
      />

      {/* 버튼 이미지 · 텍스트 색상 (촬영하기/다음으로/결제하기 통합) */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 divide-y divide-gray-700">
        <div className="px-6 pt-5 pb-1">
          <h3 className="text-white font-semibold text-base">버튼 이미지 · 텍스트 색상</h3>
          <p className="text-gray-500 text-xs mt-1">
            촬영·다음·결제·인쇄·처음으로 버튼의 배경 이미지와 글자 색상입니다. 이미지를 올리면 버튼이 화면 방향별 고정 크기(아래 안내)로 바뀌고, 이미지는 그 크기에 꽉 채워집니다 — 가로·세로용을 각 크기로 따로 만들면 가장 깔끔하고, 한쪽만 올리면 그 이미지가 양쪽에 쓰입니다. 이미지를 올린 버튼은 단색 배경·그림자 없이 이미지만 보이므로(투명 PNG는 투명 그대로) 버튼 모양까지 이미지에 담아 제작하세요. 미설정 시 기본 단색 버튼이 사용됩니다. (텍스트 숨김 옵션은 아래 &apos;설정 저장&apos;을 눌러야 반영됩니다)
          </p>
        </div>

        <ButtonThemeRow
          title="촬영하기"
          description="촬영 화면의 '촬영하기' 버튼."
          landscape={t.buttonSlot("capture").landscape}
          portrait={t.buttonSlot("capture").portrait}
          onUpload={t.uploadButton("capture")}
          onRemove={t.removeButton("capture")}
          busy={t.buttonSlot("capture").busy}
          textColor={t.captureTextColor}
          onTextColorChange={t.setCaptureTextColor}
          options={t.buttonImageOptions.capture}
          onOptionChange={(k, v) => t.setButtonImageOption("capture", k, v)}
        />

        <ButtonThemeRow
          title="다음으로"
          description="각 단계 화면의 '다음으로' 버튼."
          landscape={t.buttonSlot("next").landscape}
          portrait={t.buttonSlot("next").portrait}
          onUpload={t.uploadButton("next")}
          onRemove={t.removeButton("next")}
          busy={t.buttonSlot("next").busy}
          textColor={t.nextTextColor}
          onTextColorChange={t.setNextTextColor}
          options={t.buttonImageOptions.next}
          onOptionChange={(k, v) => t.setButtonImageOption("next", k, v)}
        />

        <ButtonThemeRow
          title="결제하기"
          description="결제 화면의 '결제하기' 버튼."
          landscape={t.buttonSlot("payment").landscape}
          portrait={t.buttonSlot("payment").portrait}
          onUpload={t.uploadButton("payment")}
          onRemove={t.removeButton("payment")}
          busy={t.buttonSlot("payment").busy}
          textColor={t.paymentTextColor}
          onTextColorChange={t.setPaymentTextColor}
          options={t.buttonImageOptions.payment}
          onOptionChange={(k, v) => t.setButtonImageOption("payment", k, v)}
        />

        <ButtonThemeRow
          title="인쇄하기"
          description="완료 화면의 '인쇄하기' 버튼."
          landscape={t.buttonSlot("print").landscape}
          portrait={t.buttonSlot("print").portrait}
          onUpload={t.uploadButton("print")}
          onRemove={t.removeButton("print")}
          busy={t.buttonSlot("print").busy}
          textColor={t.printTextColor}
          onTextColorChange={t.setPrintTextColor}
          options={t.buttonImageOptions.print}
          onOptionChange={(k, v) => t.setButtonImageOption("print", k, v)}
        />

        <ButtonThemeRow
          title="처음으로 돌아가기"
          description="완료 화면(인쇄 후)의 '처음으로 돌아가기' 버튼."
          landscape={t.buttonSlot("restart").landscape}
          portrait={t.buttonSlot("restart").portrait}
          onUpload={t.uploadButton("restart")}
          onRemove={t.removeButton("restart")}
          busy={t.buttonSlot("restart").busy}
          textColor={t.restartTextColor}
          onTextColorChange={t.setRestartTextColor}
          options={t.buttonImageOptions.restart}
          onOptionChange={(k, v) => t.setButtonImageOption("restart", k, v)}
        />
      </div>

      {/* 색상 — 배경 단색 · 강조(Primary) · 글자 색상을 한 카드에 묶는다. */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 divide-y divide-gray-700">
        <div className="px-6 pt-5 pb-6">
          <h3 className="text-white font-semibold text-base mb-1">배경 단색</h3>
          <p className="text-gray-500 text-xs mb-4">
            배경화면 이미지를 올리지 않은 화면에 쓰이는 단색입니다. 위의 &apos;첫(대기) 화면&apos;·&apos;나머지 화면&apos; 배경화면을 설정하면 해당 화면은 이미지가 우선 적용됩니다.
          </p>
          <ColorRow color={t.bgColor} onChange={t.setBgColor}>
            <span
              className="w-24 h-10 rounded-lg border border-gray-600 ml-2"
              style={{ background: t.bgColor }}
            />
          </ColorRow>
        </div>

        <div className="px-6 pt-5 pb-6">
          <h3 className="text-white font-semibold text-base mb-1">강조(Primary) 색상</h3>
          <p className="text-gray-500 text-xs mb-4">
            선택 강조(카드 테두리·체크 표시)와 주요 버튼에 쓰이는 포인트 색상입니다.
          </p>
          <ColorRow color={t.primaryColor} onChange={t.setPrimaryColor}>
            <div className="flex items-center gap-3 ml-2">
              <span
                className="w-24 h-10 rounded-lg flex items-center justify-center text-white text-sm font-bold"
                style={{ background: t.primaryColor }}
              >
                버튼
              </span>
              <span
                className="w-16 h-10 rounded-lg bg-[#2a2a2a] border-[3px]"
                style={{ borderColor: t.primaryColor }}
              />
            </div>
          </ColorRow>
        </div>

        <div className="px-6 pt-5 pb-6">
          <h3 className="text-white font-semibold text-base mb-1">글자 색상</h3>
          <p className="text-gray-500 text-xs mb-4">
            서비스 화면 텍스트의 기본 색상입니다. 배경화면 위에서 글자가 잘 보이도록 조정하세요.
          </p>
          <ColorRow color={t.textColor} onChange={t.setTextColor}>
            <div
              className="px-4 py-2 rounded-lg text-sm border border-gray-600 ml-2"
              style={{ background: t.bgColor, color: t.textColor }}
            >
              미리보기 텍스트
            </div>
          </ColorRow>
        </div>
      </div>

      {/* 버튼 글로우 */}
      <div className="bg-gray-800 rounded-xl border border-gray-700">
        <div className="px-6 pt-5 pb-6">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-white font-semibold text-base">버튼 글로우</h3>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-gray-400 text-sm">{t.glowEnabled ? "켜짐" : "꺼짐"}</span>
              <div
                className={`relative w-11 h-6 rounded-full transition-colors ${t.glowEnabled ? "bg-blue-500" : "bg-gray-600"}`}
                onClick={() => t.setGlowEnabled((v) => !v)}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${t.glowEnabled ? "translate-x-6" : "translate-x-1"}`} />
              </div>
            </label>
          </div>
          <p className="text-gray-500 text-xs mb-4">
            서비스 화면 버튼을 누를 때(터치) 외곽에 나타나는 글로우 효과입니다.
          </p>
          {t.glowEnabled && (
            <div className="space-y-4">
              <ColorRow color={t.glowColor} onChange={t.setGlowColor}>
                <span className="text-gray-400 text-xs ml-2">글로우 색상</span>
              </ColorRow>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-400 text-sm">세기 (번짐)</span>
                  <span className="text-gray-300 text-sm font-mono">{t.glowSize}px</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={60}
                  value={t.glowSize}
                  onChange={(e) => t.setGlowSize(parseInt(e.target.value, 10) || 0)}
                  className="w-full accent-blue-500"
                />
              </div>
            </div>
          )}
          <div className="mt-5">
            <ButtonGlowPreview t={t} />
          </div>
        </div>
      </div>

      {t.message && (
        <div className={`p-4 rounded-lg ${t.message.includes("실패") ? "bg-red-900/50 border border-red-500 text-red-300" : "bg-green-900/50 border border-green-500 text-green-300"}`}>
          {t.message}
        </div>
      )}

      <div className="sticky bottom-0 py-4 bg-[#2a2a2a]">
        <button
          onClick={t.handleSaveColors}
          disabled={t.saving}
          className="px-8 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {t.saving ? "저장 중..." : "설정 저장"}
        </button>
        <button
          onClick={() => setPreviewOpen(true)}
          className="ml-3 px-5 py-3 bg-gray-700 text-gray-200 rounded-lg font-semibold hover:bg-gray-600 transition-colors"
        >
          미리보기
        </button>
        <span className="ml-3 text-gray-500 text-xs">이미지는 업로드 즉시 반영됩니다. 색상·버튼 옵션은 저장해야 반영됩니다(미리보기엔 저장 전 값도 보입니다).</span>
      </div>

      {previewOpen && <ThemePreviewModal t={t} onClose={() => setPreviewOpen(false)} />}
    </div>
  );
}
