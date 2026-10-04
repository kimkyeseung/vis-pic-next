"use client";

import { useState } from "react";

interface ImageBase {
  id: number;
  name: string;
  imageType: number;
}

/**
 * 이미지 편집 다이얼로그의 공통 폼(이름·타입)과 저장/삭제 API 호출을 담당한다.
 * 지점별 노출(어느 지점에 어떤 순서로)은 이미지 관리의 노출 목록(ImageBankPanel)에서만 바꾼다 —
 * 여기서 deviceIds를 보내면 그 이미지의 지점 연결이 통째로 교체돼 노출 순서가 초기화된다.
 * 프레임 전용 포컬 필드나 배경 전용 이펙트 필드는 이 훅이 모른다 — `handleSave`가 받는
 * `extraFields`로 호출부(EditDialog)가 필요한 값만 얹어서 PATCH 본문에 병합한다.
 */
export function useImageEditForm(image: ImageBase, onSaved: () => void) {
  const [name, setName] = useState(image.name);
  const [imageType, setImageType] = useState(String(image.imageType));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
    saving, deleting,
    handleDelete, handleSave,
  };
}
