"use client";

import { useEffect, useRef, useState } from "react";
import {
  BACKGROUND_IMAGE_TYPE,
  FRAME_IMAGE_TYPE,
  DEFAULT_EFFECT_DURATION,
  EFFECT_DURATION_RANGE,
  EFFECT_VIDEO_EXTENSIONS,
  EFFECT_TRIGGER_GESTURES,
  DEFAULT_EFFECT_GESTURE,
} from "@/constants/images";

interface Image {
  id: number;
  name: string;
  filename: string;
  priority: number;
  deviceIds: string[];
  imageType: number;
  effectFilename?: string | null;
  effectDuration?: number | null;
  effectGesture?: string | null;
  focalX?: number;
  focalY?: number;
}

interface DeviceOption {
  deviceId: string;
  name: string;
}

interface EditDialogProps {
  image: Image;
  imageBaseUrl: string;
  devices: DeviceOption[];
  onClose: () => void;
  onSaved: () => void;
}

const isVideo = (filename: string) =>
  filename.endsWith(".mp4") || filename.endsWith(".webm");

export default function EditDialog({
  image,
  imageBaseUrl,
  devices,
  onClose,
  onSaved,
}: EditDialogProps) {
  const [name, setName] = useState(image.name);
  const [priority, setPriority] = useState(String(image.priority));
  const [imageType, setImageType] = useState(String(image.imageType));
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>(
    image.deviceIds ?? []
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ── 프레임(인쇄 배경) 전용: 포컬(인화지 배치 기준점) ──
  const isFrame = image.imageType === FRAME_IMAGE_TYPE;
  const [focalX, setFocalX] = useState(typeof image.focalX === "number" ? image.focalX : 0.5);
  const [focalY, setFocalY] = useState(typeof image.focalY === "number" ? image.focalY : 0.5);

  const handleDelete = async () => {
    if (!confirm("이 이미지를 삭제하시겠습니까? 되돌릴 수 없습니다.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/images/${image.id}/`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      onSaved(); // 목록 새로고침 + 닫힘
    } catch (error) {
      console.error("Failed to delete image:", error);
      alert("삭제에 실패했습니다.");
      setDeleting(false);
    }
  };

  // ── 배경 이펙트 영상(동작 트리거 시 재생) ──
  const isBackground = image.imageType === BACKGROUND_IMAGE_TYPE;
  const [effectFilename, setEffectFilename] = useState<string | null>(image.effectFilename ?? null);
  const [effectDuration, setEffectDuration] = useState<string>(
    String(image.effectDuration ?? DEFAULT_EFFECT_DURATION)
  );
  const [effectGesture, setEffectGesture] = useState<string>(image.effectGesture || DEFAULT_EFFECT_GESTURE);
  const [effectBusy, setEffectBusy] = useState(false);
  const effectInputRef = useRef<HTMLInputElement>(null);

  const handleEffectUpload = async (file: File) => {
    setEffectBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("duration", effectDuration);
      const res = await fetch(`/api/admin/images/${image.id}/effect/`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.effectFilename) throw new Error(data.error || "upload failed");
      setEffectFilename(data.effectFilename);
    } catch (error) {
      console.error("Failed to upload effect video:", error);
      alert(error instanceof Error ? error.message : "이펙트 영상 업로드에 실패했습니다.");
    } finally {
      setEffectBusy(false);
      if (effectInputRef.current) effectInputRef.current.value = "";
    }
  };

  const handleEffectRemove = async () => {
    setEffectBusy(true);
    try {
      const res = await fetch(`/api/admin/images/${image.id}/effect/`, { method: "DELETE" });
      if (!res.ok) throw new Error("remove failed");
      setEffectFilename(null);
    } catch (error) {
      console.error("Failed to remove effect video:", error);
      alert("이펙트 영상 제거에 실패했습니다.");
    } finally {
      setEffectBusy(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggleDevice = (deviceId: string) => {
    setSelectedDeviceIds((prev) =>
      prev.includes(deviceId)
        ? prev.filter((d) => d !== deviceId)
        : [...prev, deviceId]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/images/${image.id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.slice(0, 32),
          priority: parseInt(priority) || 0,
          imageType: parseInt(imageType),
          deviceIds: selectedDeviceIds,
          // 배경 이펙트 최대 재생 시간(초)·트리거 제스처. 배경일 때만 전송.
          ...(isBackground ? { effectDuration: parseInt(effectDuration) || DEFAULT_EFFECT_DURATION, effectGesture } : {}),
          // 프레임 포컬(인화지 배치 기준점). 프레임일 때만 전송.
          ...(isFrame ? { focalX, focalY } : {}),
        }),
      });
      if (!res.ok) throw new Error("update failed");
      onSaved();
    } catch (error) {
      console.error("Failed to update image:", error);
      alert("저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-gray-800 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-700 p-5">
          <h3 className="text-lg font-bold text-white">이미지 편집</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <div className="mx-auto h-32 overflow-hidden rounded-lg bg-gray-700">
            {isVideo(image.filename) ? (
              <video
                src={`${imageBaseUrl}/${image.filename}`}
                className="h-full w-full object-contain"
                muted
                loop
                autoPlay
                playsInline
              />
            ) : (
              <img
                src={`${imageBaseUrl}/${image.filename}`}
                alt={image.name}
                className="h-full w-full object-contain"
              />
            )}
          </div>
          <p className="truncate text-center text-xs text-gray-400">
            {image.filename}
          </p>

          <div>
            <label className="mb-2 block text-gray-300">이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={32}
              className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2.5 text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-gray-300">이미지 타입</label>
            <select
              value={imageType}
              onChange={(e) => setImageType(e.target.value)}
              className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2.5 text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="1">배경 (Background)</option>
              <option value="2">프레임 (Frame)</option>
              <option value="3">스티커 (Sticker)</option>
            </select>
            <p className="mt-1 text-sm text-gray-500">
              잘못된 탭에 올린 이미지를 여기서 옮길 수 있습니다.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-gray-300">우선순위</label>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2.5 text-white focus:border-blue-500 focus:outline-none"
            />
            <p className="mt-1 text-sm text-gray-500">숫자가 클수록 먼저 표시됩니다.</p>
          </div>

          <div>
            <label className="mb-2 block text-gray-300">적용 장치</label>
            {devices.length === 0 ? (
              <p className="text-sm text-gray-500">
                등록된 장치가 없어 모든 장치에 적용됩니다.
              </p>
            ) : (
              <div className="space-y-2 rounded-lg border border-gray-600 bg-gray-700 p-3">
                {devices.map((d) => (
                  <label
                    key={d.deviceId}
                    className="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 hover:bg-gray-600"
                  >
                    <input
                      type="checkbox"
                      checked={selectedDeviceIds.includes(d.deviceId)}
                      onChange={() => toggleDevice(d.deviceId)}
                      className="h-4 w-4 accent-blue-500"
                    />
                    <span className="text-white">
                      {d.name}
                      <span className="ml-2 text-xs text-gray-400">{d.deviceId}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
            <p className="mt-1 text-sm text-gray-500">
              {selectedDeviceIds.length === 0
                ? "선택하지 않으면 모든 장치에 적용됩니다."
                : `${selectedDeviceIds.length}개 장치에만 적용됩니다.`}
            </p>
          </div>

          {/* 프레임(인쇄 배경) 전용: 인화지에 꽉 차게 잘릴 때의 기준점(포컬) */}
          {isFrame && (
            <div className="space-y-3 rounded-lg border border-gray-700 bg-gray-900/40 p-4">
              <label className="block font-medium text-gray-200">인화지 배치 위치(포컬)</label>
              <p className="text-sm text-gray-500">
                이미지가 인화지 비율에 맞게 꽉 차게 잘릴 때의 기준점입니다.
              </p>
              <div className="h-28 w-full overflow-hidden rounded bg-gray-700">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${imageBaseUrl}/${image.filename}`}
                  alt="focal preview"
                  className="h-full w-full object-cover"
                  style={{ objectPosition: `${focalX * 100}% ${focalY * 100}%` }}
                />
              </div>
              <div className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-xs text-gray-500">가로 위치</span>
                <input
                  type="range" min={0} max={100} step={1}
                  value={Math.round(focalX * 100)}
                  onChange={(e) => setFocalX(parseInt(e.target.value) / 100)}
                  className="flex-1 accent-blue-500"
                />
                <span className="w-9 text-right text-xs text-gray-400">{Math.round(focalX * 100)}%</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-xs text-gray-500">세로 위치</span>
                <input
                  type="range" min={0} max={100} step={1}
                  value={Math.round(focalY * 100)}
                  onChange={(e) => setFocalY(parseInt(e.target.value) / 100)}
                  className="flex-1 accent-blue-500"
                />
                <span className="w-9 text-right text-xs text-gray-400">{Math.round(focalY * 100)}%</span>
              </div>
              <p className="text-xs text-gray-500">저장 시 반영됩니다.</p>
            </div>
          )}

          {/* 배경 전용: 동작(V사인) 트리거 시 촬영 화면에 재생되는 이펙트 영상 */}
          {isBackground && (
            <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-4">
              <label className="mb-1 block font-medium text-gray-200">동작 트리거 이펙트 영상</label>
              <p className="mb-3 text-sm text-gray-500">
                촬영 화면에서 아래에서 지정한 <span className="text-gray-300">제스처</span>를 취하면
                이 배경 위에 스크린 블렌드로 재생됩니다. ({EFFECT_VIDEO_EXTENSIONS.join(", ")})
              </p>

              {effectFilename ? (
                <div className="mb-3 flex items-center gap-3">
                  <video
                    src={`${imageBaseUrl}/${effectFilename}`}
                    className="h-20 w-32 rounded-lg bg-black object-contain"
                    muted
                    loop
                    autoPlay
                    playsInline
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-gray-400">{effectFilename}</p>
                    <button
                      type="button"
                      onClick={handleEffectRemove}
                      disabled={effectBusy}
                      className="mt-2 rounded bg-red-600/90 px-3 py-1 text-sm text-white hover:bg-red-500 disabled:opacity-50"
                    >
                      이펙트 제거
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mb-3 text-sm text-gray-500">설정된 이펙트 영상이 없습니다.</p>
              )}

              <input
                ref={effectInputRef}
                type="file"
                accept={EFFECT_VIDEO_EXTENSIONS.map((e) => `.${e}`).join(",")}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleEffectUpload(f);
                }}
                disabled={effectBusy}
                className="block w-full text-sm text-gray-300 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-white hover:file:bg-blue-500 disabled:opacity-50"
              />
              {effectBusy && <p className="mt-2 text-sm text-blue-400">처리 중…</p>}

              <div className="mt-4">
                <label className="mb-1 block text-gray-300">트리거 제스처</label>
                <select
                  value={effectGesture}
                  onChange={(e) => setEffectGesture(e.target.value)}
                  className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2.5 text-white focus:border-blue-500 focus:outline-none"
                >
                  {EFFECT_TRIGGER_GESTURES.map((g) => (
                    <option key={g.value} value={g.value}>{g.label}</option>
                  ))}
                </select>
                <p className="mt-1 text-sm text-gray-500">
                  이 제스처를 취하면 영상이 재생됩니다. (손바닥은 촬영 트리거라 제외)
                </p>
              </div>

              <div className="mt-4">
                <label className="mb-1 block text-gray-300">최대 재생 시간(초)</label>
                <input
                  type="number"
                  min={EFFECT_DURATION_RANGE.min}
                  max={EFFECT_DURATION_RANGE.max}
                  value={effectDuration}
                  onChange={(e) => setEffectDuration(e.target.value)}
                  className="w-32 rounded-lg border border-gray-600 bg-gray-700 px-4 py-2.5 text-white focus:border-blue-500 focus:outline-none"
                />
                <p className="mt-1 text-sm text-gray-500">
                  이 시간이 지나면 재생을 멈춥니다. 영상이 더 짧으면 끝날 때 종료됩니다. (저장 시 반영)
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-gray-700 p-4">
          <div>
            {isFrame && (
              <button
                onClick={handleDelete}
                disabled={saving || deleting}
                className="rounded-lg bg-red-700/80 px-4 py-2 text-white hover:bg-red-600 disabled:opacity-50"
              >
                {deleting ? "삭제중…" : "이미지 삭제"}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={saving || deleting}
              className="rounded-lg bg-gray-700 px-4 py-2 text-gray-200 hover:bg-gray-600 disabled:opacity-50"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={saving || deleting}
              className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? "저장중…" : "저장"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
