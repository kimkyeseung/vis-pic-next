"use client";

import { useAdmin } from "@/app/admin/AdminContext";
import { WALLPAPER_NAME_LANDSCAPE, WALLPAPER_NAME_PORTRAIT, BUTTON_NAME_CAPTURE, BUTTON_NAME_NEXT, BUTTON_NAME_PAYMENT } from "@/constants/images";
import { useThemeSettings } from "./useThemeSettings";
import { AssetUploader } from "./AssetUploader";
import { ButtonThemeRow } from "./ButtonThemeRow";
import { ColorRow } from "./ColorRow";

export default function ThemeSettingPage() {
  const { selectedDevice } = useAdmin();
  const deviceId = selectedDevice?.deviceId ?? null;
  const t = useThemeSettings(deviceId);

  if (t.loading) return <div className="text-gray-400">로딩중...</div>;
  if (!selectedDevice) return <div className="p-8 bg-gray-800 rounded-xl text-center text-gray-400">상단에서 지점을 선택하세요.</div>;

  return (
    <div className="max-w-3xl space-y-4">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white">테마 관리</h2>
        <p className="mt-1 text-sm text-gray-500">
          <span className="text-white font-medium">{selectedDevice.name}</span> 지점 테마입니다. (배경화면·로고·버튼 이미지·색상)
        </p>
      </div>

      <AssetUploader
        title="배경화면 · 가로 화면용 (첫 화면 전용)"
        description="가로(landscape) 키오스크의 대기(첫) 화면에만 깔리는 배경입니다. 이후 단계 화면은 아래 '배경 단색'이 사용됩니다. 미설정 시 세로용 이미지가 있으면 그걸, 없으면 배경 단색이 사용됩니다. (jpg/png/webp/gif, 최대 50MB)"
        asset={t.wallpaperLs}
        onUpload={t.uploadAsset(t.WALLPAPER_TYPE, WALLPAPER_NAME_LANDSCAPE, t.wallpaperLs, t.setWallpaperLs, t.setWallpaperLsBusy)}
        onRemove={t.removeAsset(t.wallpaperLs, t.setWallpaperLs, t.setWallpaperLsBusy)}
        busy={t.wallpaperLsBusy}
        previewClass="w-64 aspect-video"
        imageFit="cover"
        emptyLabel="기본 배경 (#2a2a2a)"
      />

      <AssetUploader
        title="배경화면 · 세로 화면용 (첫 화면 전용)"
        description="세로(portrait) 키오스크의 대기(첫) 화면에만 깔리는 배경입니다. 화면 방향에 맞춰 가로/세로 이미지가 자동으로 선택됩니다. 미설정 시 가로용 이미지가 있으면 그걸, 없으면 배경 단색이 사용됩니다. (jpg/png/webp/gif, 최대 50MB)"
        asset={t.wallpaperPt}
        onUpload={t.uploadAsset(t.WALLPAPER_TYPE, WALLPAPER_NAME_PORTRAIT, t.wallpaperPt, t.setWallpaperPt, t.setWallpaperPtBusy)}
        onRemove={t.removeAsset(t.wallpaperPt, t.setWallpaperPt, t.setWallpaperPtBusy)}
        busy={t.wallpaperPtBusy}
        previewClass="w-40 aspect-[9/16]"
        imageFit="cover"
        emptyLabel="기본 배경 (#2a2a2a)"
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
            촬영·다음·결제 버튼의 배경 이미지와 글자 색상입니다. 이미지는 버튼 비율(가로로 넓은 사각형)에 맞춰 꽉 채워지므로(cover) 좌우로 넉넉한 이미지를 권장합니다. 미설정 시 기본 단색 버튼이 사용됩니다.
          </p>
        </div>

        <ButtonThemeRow
          title="촬영하기"
          description="촬영 화면의 '촬영하기' 버튼."
          asset={t.captureButtonImage}
          onUpload={t.uploadAsset(t.BUTTON_TYPE, BUTTON_NAME_CAPTURE, t.captureButtonImage, t.setCaptureButtonImage, t.setCaptureButtonImageBusy)}
          onRemove={t.removeAsset(t.captureButtonImage, t.setCaptureButtonImage, t.setCaptureButtonImageBusy)}
          busy={t.captureButtonImageBusy}
          textColor={t.captureTextColor}
          onTextColorChange={t.setCaptureTextColor}
        />

        <ButtonThemeRow
          title="다음으로"
          description="각 단계 화면의 '다음으로' 버튼."
          asset={t.nextButtonImage}
          onUpload={t.uploadAsset(t.BUTTON_TYPE, BUTTON_NAME_NEXT, t.nextButtonImage, t.setNextButtonImage, t.setNextButtonImageBusy)}
          onRemove={t.removeAsset(t.nextButtonImage, t.setNextButtonImage, t.setNextButtonImageBusy)}
          busy={t.nextButtonImageBusy}
          textColor={t.nextTextColor}
          onTextColorChange={t.setNextTextColor}
        />

        <ButtonThemeRow
          title="결제하기"
          description="결제 화면의 '결제하기' 버튼."
          asset={t.paymentButtonImage}
          onUpload={t.uploadAsset(t.BUTTON_TYPE, BUTTON_NAME_PAYMENT, t.paymentButtonImage, t.setPaymentButtonImage, t.setPaymentButtonImageBusy)}
          onRemove={t.removeAsset(t.paymentButtonImage, t.setPaymentButtonImage, t.setPaymentButtonImageBusy)}
          busy={t.paymentButtonImageBusy}
          textColor={t.paymentTextColor}
          onTextColorChange={t.setPaymentTextColor}
        />
      </div>

      {/* 배경 단색 */}
      <div className="bg-gray-800 rounded-xl border border-gray-700">
        <div className="px-6 pt-5 pb-6">
          <h3 className="text-white font-semibold text-base mb-1">배경 단색</h3>
          <p className="text-gray-500 text-xs mb-4">
            첫(대기) 화면을 제외한 나머지 서비스 화면 전체 배경으로 쓰이는 단색입니다. 배경화면 이미지를 설정하지 않으면 첫 화면에도 이 색이 사용됩니다.
          </p>
          <ColorRow color={t.bgColor} onChange={t.setBgColor}>
            <span
              className="w-24 h-10 rounded-lg border border-gray-600 ml-2"
              style={{ background: t.bgColor }}
            />
          </ColorRow>
        </div>
      </div>

      {/* Primary 컬러 */}
      <div className="bg-gray-800 rounded-xl border border-gray-700">
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
      </div>

      {/* 글자 색상 */}
      <div className="bg-gray-800 rounded-xl border border-gray-700">
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
              <div className="flex items-center gap-3 pt-1">
                <span className="text-gray-400 text-xs">미리보기</span>
                <span
                  className="px-6 py-3 rounded-xl text-white font-bold"
                  style={{ background: t.primaryColor, boxShadow: `0 0 ${t.glowSize}px 6px ${t.glowColor}` }}
                >
                  버튼
                </span>
              </div>
            </div>
          )}
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
          {t.saving ? "저장 중..." : "색상 저장"}
        </button>
        <span className="ml-3 text-gray-500 text-xs">배경화면·로고는 업로드 즉시 반영됩니다.</span>
      </div>
    </div>
  );
}
