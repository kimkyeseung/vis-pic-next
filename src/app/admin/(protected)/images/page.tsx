"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ImageBankPanel from "./ImageBankPanel";
import { useAdmin } from "@/app/admin/AdminContext";
import { BACKGROUND_IMAGE_TYPE, MAX_ACTIVE_BACKGROUNDS, FRAME_IMAGE_TYPE, MAX_ACTIVE_FRAMES, STICKER_IMAGE_TYPE, MAX_ACTIVE_STICKERS } from "@/constants/images";

// 이미지 관리 탭 — 모두 지점별 노출 목록(뱅크) UI를 쓴다. 배경화면·로고·버튼 이미지는 테마 관리에서 다룬다.
// 편집(이름·타입·포컬·이펙트)과 삭제는 노출 목록의 편집 버튼(EditDialog)에서 한다.
const TABS = [
  { type: BACKGROUND_IMAGE_TYPE, label: "배경", noun: "배경", apiSlug: "backgrounds", maxActive: MAX_ACTIVE_BACKGROUNDS },
  { type: FRAME_IMAGE_TYPE, label: "프레임", noun: "프레임", apiSlug: "frames", maxActive: MAX_ACTIVE_FRAMES },
  { type: STICKER_IMAGE_TYPE, label: "스티커", noun: "스티커", apiSlug: "stickers", maxActive: MAX_ACTIVE_STICKERS },
] as const;

export default function ImagesPage() {
  const [selectedType, setSelectedType] = useState<number>(BACKGROUND_IMAGE_TYPE);
  const [imageBaseUrl, setImageBaseUrl] = useState<string>("");
  const { selectedDevice } = useAdmin();

  // 업로드 페이지에서 ?type= 으로 돌아올 때 마지막 탭을 복원한다(스티커 업로드 후 배경 탭 리셋 방지).
  // URL은 SSR 시점에 없으므로 하이드레이션 불일치를 피하려 마운트 후 한 번만 반영한다.
  useEffect(() => {
    const t = Number(new URLSearchParams(window.location.search).get("type"));
    if (TABS.some((tab) => tab.type === t)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedType(t);
    }
  }, []);

  // 탭 전환을 URL에 반영해 새로고침·업로드 왕복에도 탭이 유지되게 한다.
  const selectType = (id: number) => {
    setSelectedType(id);
    const url = new URL(window.location.href);
    url.searchParams.set("type", String(id));
    window.history.replaceState(null, "", url);
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/images/url/");
        if (!res.ok) return;
        const data = await res.json();
        if (data.baseUrl) setImageBaseUrl(data.baseUrl);
      } catch {
        // use default
      }
    })();
  }, []);

  const tab = TABS.find((t) => t.type === selectedType) ?? TABS[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">이미지 관리</h2>
        <Link
          href={`/admin/images/upload?type=${selectedType}`}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
        >
          + 이미지 업로드
        </Link>
      </div>

      <div className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.type}
            onClick={() => selectType(t.type)}
            className={`px-4 py-2 rounded-lg transition-colors ${
              selectedType === t.type
                ? "bg-blue-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ImageBankPanel
        deviceId={selectedDevice?.deviceId ?? null}
        deviceName={selectedDevice?.name ?? null}
        imageBaseUrl={imageBaseUrl}
        imageType={tab.type}
        maxActive={tab.maxActive}
        apiSlug={tab.apiSlug}
        noun={tab.noun}
      />
    </div>
  );
}
