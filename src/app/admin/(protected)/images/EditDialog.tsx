"use client";

import { useEffect, useState } from "react";

interface Image {
  id: number;
  name: string;
  filename: string;
  priority: number;
  deviceIds: string[];
  imageType: number;
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
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-700 p-4">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg bg-gray-700 px-4 py-2 text-gray-200 hover:bg-gray-600 disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {saving ? "저장중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
