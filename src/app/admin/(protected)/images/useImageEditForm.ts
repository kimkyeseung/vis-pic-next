"use client";

import { useState } from "react";

interface ImageBase {
  id: number;
  name: string;
  deviceIds: string[];
  imageType: number;
}

/**
 * 이미지 편집 다이얼로그의 공통 폼(이름·타입·적용 장치)과 저장/삭제 API 호출을 담당한다.
 * 프레임 전용 포컬 필드나 배경 전용 이펙트 필드는 이 훅이 모른다 — `handleSave`가 받는
 * `extraFields`로 호출부(EditDialog)가 필요한 값만 얹어서 PATCH 본문에 병합한다.
 */
export function useImageEditForm(image: ImageBase, onSaved: () => void) {
  const [name, setName] = useState(image.name);
  const [imageType, setImageType] = useState(String(image.imageType));
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>(
    image.deviceIds ?? []
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const toggleDevice = (deviceId: string) => {
    setSelectedDeviceIds((prev) =>
      prev.includes(deviceId)
        ? prev.filter((d) => d !== deviceId)
        : [...prev, deviceId]
    );
  };

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

  const handleSave = async (extraFields: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/images/${image.id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.slice(0, 32),
          imageType: parseInt(imageType),
          deviceIds: selectedDeviceIds,
          ...extraFields,
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

  return {
    name, setName,
    imageType, setImageType,
    selectedDeviceIds, toggleDevice,
    saving, deleting,
    handleDelete, handleSave,
  };
}
