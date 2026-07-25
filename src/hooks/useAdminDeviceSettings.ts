"use client";

import { useEffect, useRef, useState } from "react";
import { useAdmin } from "@/app/admin/AdminContext";

/**
 * 관리자 설정 페이지 공용 훅 — "헤더에서 선택한 지점" 기준으로 설정을 편집한다.
 * - 로드: 전역 기본값(Setting) ← 선택 지점 오버라이드(DeviceSetting)를 병합해 "이 지점의 실효값"을 보여준다.
 * - 저장: 실제로 바뀐 필드만 해당 지점(DeviceSetting)에 저장한다.
 *   (바꾸지 않은 값은 전역 기본값을 그대로 따르도록 남겨 지점 설정을 깔끔하게 유지)
 */
export function useAdminDeviceSettings() {
  const { selectedDevice } = useAdmin();
  const deviceId = selectedDevice?.deviceId ?? null;
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const baselineRef = useRef<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [g, d] = await Promise.all([
          fetch("/api/setting/").then((r) => r.json()).catch(() => ({})),
          deviceId
            ? fetch(`/api/device/${deviceId}/settings/`).then((r) => r.json()).catch(() => ({}))
            : Promise.resolve({}),
        ]);
        if (cancelled) return;
        const merged = { ...(g.settings || {}), ...(d.settings || {}) };
        baselineRef.current = merged;
        setSettings(merged);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [deviceId]);

  const update = (name: string, value: string) =>
    setSettings((prev) => ({ ...prev, [name]: value }));

  /** 이 페이지가 관리하는 필드 중 실제 변경된 것만 해당 지점에 저장 */
  const save = async (fieldNames: string[]) => {
    if (!deviceId) { setMessage("먼저 상단에서 지점을 선택하세요."); return; }
    setSaving(true);
    setMessage("");
    try {
      const payload: Record<string, string> = {};
      for (const name of fieldNames) {
        const val = settings[name];
        if (typeof val === "string" && val !== baselineRef.current[name]) payload[name] = val;
      }
      if (Object.keys(payload).length === 0) {
        setMessage("변경사항이 없습니다.");
        setTimeout(() => setMessage(""), 2000);
        return;
      }
      const res = await fetch(`/api/device/${deviceId}/settings/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        for (const k of Object.keys(payload)) baselineRef.current[k] = payload[k];
        setMessage("저장되었습니다.");
        setTimeout(() => setMessage(""), 3000);
      } else {
        setMessage("저장 실패");
      }
    } catch {
      setMessage("서버 연결 실패");
    } finally {
      setSaving(false);
    }
  };

  return { selectedDevice, deviceId, settings, update, save, loading, saving, message };
}
