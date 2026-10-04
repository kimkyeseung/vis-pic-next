"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FRAME_INFO } from "@/constants/frames";
import type { FrameInfoEntry } from "@/types";

interface PrintBgImage {
  id: number;
  name: string;
  filename: string;
  focalX: number;
  focalY: number;
}

/**
 * 인화 설정 페이지의 데이터 계층 — 전역/지점 설정 로드·저장, 용지 크기, 촬영 모드 목록(커스텀
 * NxM 모드 추가/삭제 포함), 프린터, 인쇄 배경(프레임) 이미지 목록을 전부 담당한다. 캔버스
 * 미리보기 그리기는 이 훅이 반환하는 값을 입력으로 받는 `usePrintLayoutPreview`가 따로 맡는다.
 */
export function usePrintSettingsForm(deviceId: string | undefined) {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  // 로드 시점의 실효값(전역←지점). 저장 시 변경된 필드만 지점에 저장하는 기준.
  const baselineRef = useRef<Record<string, string>>({});

  const [paperWidth, setPaperWidth] = useState("10");
  const [paperHeight, setPaperHeight] = useState("15");
  const [modes, setModes] = useState<string[]>([]);
  const [previewMode, setPreviewMode] = useState<string | null>(null);

  const [customModeInfo, setCustomModeInfo] = useState<Record<string, FrameInfoEntry>>({});
  const [customModeInput, setCustomModeInput] = useState("");
  const [customModeError, setCustomModeError] = useState("");

  const effectiveModeInfo = useMemo(
    () => ({ ...FRAME_INFO, ...customModeInfo }),
    [customModeInfo]
  );

  const [imageBaseUrl, setImageBaseUrl] = useState("");
  const [printerName, setPrinterName] = useState("");
  const [printerList, setPrinterList] = useState<string[]>([]);

  // 프레임(인쇄 배경) 이미지 (imageType=2) — 미리보기 표시에만 사용.
  // 업로드/삭제/포컬 등 관리는 [이미지 관리 → 프레임] 탭으로 일원화되었다.
  const [printBgImages, setPrintBgImages] = useState<PrintBgImage[]>([]);

  const loadImageBaseUrl = async () => {
    try {
      const res = await fetch("/api/images/url/");
      if (!res.ok) return;
      const data = await res.json();
      if (data.baseUrl) setImageBaseUrl(data.baseUrl);
    } catch {
      // use default
    }
  };

  const loadPrintBgImages = async () => {
    try {
      const res = await fetch("/api/image/list/2/");
      if (!res.ok) return;
      const data = await res.json();
      const imgs = (data.images || []).map((img: PrintBgImage & Record<string, unknown>) => ({
        ...img,
        focalX: typeof img.focalX === "number" ? img.focalX : 0.5,
        focalY: typeof img.focalY === "number" ? img.focalY : 0.5,
      }));
      setPrintBgImages(imgs);
    } catch {
      // ignore
    }
  };

  const loadSettings = async () => {
    setLoading(true);
    try {
      // 전역 기본값 ← 선택 지점 오버라이드 병합(이 지점의 실효값)
      const [g, d] = (await Promise.all([
        fetch("/api/setting/").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
        deviceId
          ? fetch(`/api/device/${deviceId}/settings/`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
          : Promise.resolve({}),
      ])) as [{ settings?: Record<string, string> }, { settings?: Record<string, string> }];
      const s: Record<string, string> = { ...(g.settings || {}), ...(d.settings || {}) };
      baselineRef.current = s;
      setSettings(s);

      setPaperWidth(s.PICTURE_WIDTH || "10");
      setPaperHeight(s.PICTURE_HEIGHT || "15");
      setPrinterName(s.PRINTER_NAME || "");

      const rawModes = (s.CAPTURE_MODES || "1x1,2x2")
        .split(",")
        .map((m: string) => m.trim())
        .filter(Boolean);

      const custom: Record<string, FrameInfoEntry> = {};
      const modeList = rawModes.filter((m: string) => {
        if (FRAME_INFO[m]) return true;
        const match = /^(\d+)x(\d+)$/i.exec(m);
        if (!match) return false;
        const rows = parseInt(match[1], 10);
        const cols = parseInt(match[2], 10);
        if (rows < 1 || cols < 1 || rows > 10 || cols > 10) return false;
        const count = rows * cols;
        custom[m] = { label: `${count}컷`, cols, rows, count, orientation: cols >= rows ? "landscape" : "portrait" };
        return true;
      });
      if (Object.keys(custom).length > 0) setCustomModeInfo(custom);
      setModes(modeList);
      if (modeList.length > 0) setPreviewMode(modeList[0]);
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      await Promise.all([loadSettings(), loadImageBaseUrl(), loadPrintBgImages()]);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  const handleSave = async () => {
    if (!deviceId) { setMessage("먼저 상단에서 지점을 선택하세요."); return; }
    // 빈 목록을 저장하면 읽는 쪽이 기본 모드(1x1,2x2)로 대체해 의도와 다르게 동작한다.
    if (modes.length === 0) { setMessage("촬영 모드를 1개 이상 추가한 뒤 저장하세요. (저장 실패)"); return; }
    const pw = parseFloat(paperWidth);
    const ph = parseFloat(paperHeight);
    if (!(pw > 0) || !(ph > 0)) { setMessage("인화지 가로·세로 크기를 0보다 큰 값으로 입력하세요. (저장 실패)"); return; }
    setSaving(true);
    setMessage("");
    try {
      const intended: Record<string, string> = {
        ...settings,
        PICTURE_WIDTH: paperWidth,
        PICTURE_HEIGHT: paperHeight,
        CAPTURE_MODES: modes.join(","),
        PRINTER_NAME: printerName,
      };
      // 변경된 필드만 이 지점 설정으로 저장(바꾸지 않은 값은 전역 기본값을 따르도록)
      const payload: Record<string, string> = {};
      for (const [k, v] of Object.entries(intended)) {
        if (typeof v === "string" && v !== baselineRef.current[k]) payload[k] = v;
      }
      if (Object.keys(payload).length === 0) {
        setMessage("변경사항이 없습니다.");
        setTimeout(() => setMessage(""), 2000);
        setSaving(false);
        return;
      }

      const res = await fetch(`/api/device/${deviceId}/settings/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setSettings(intended);
        for (const k of Object.keys(payload)) baselineRef.current[k] = payload[k];
        setMessage("설정이 저장되었습니다.");
        setTimeout(() => setMessage(""), 3000);
      } else {
        setMessage("저장에 실패했습니다.");
      }
    } catch {
      setMessage("서버 연결에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleAddCustomMode = () => {
    const raw = customModeInput.trim().toLowerCase();
    if (!raw) return;

    const match = /^(\d+)x(\d+)$/.exec(raw);
    if (!match) {
      setCustomModeError("NxM 형식으로 입력하세요. 예: 2x3, 4x1");
      return;
    }
    const rows = parseInt(match[1], 10);
    const cols = parseInt(match[2], 10);
    if (rows < 1 || cols < 1 || rows > 10 || cols > 10) {
      setCustomModeError("행/열은 1~10 사이여야 합니다.");
      return;
    }
    if (modes.includes(raw)) {
      setCustomModeError("이미 추가된 모드입니다.");
      return;
    }

    if (!FRAME_INFO[raw]) {
      const count = rows * cols;
      setCustomModeInfo((prev) => ({
        ...prev,
        [raw]: { label: `${count}컷`, cols, rows, count, orientation: cols >= rows ? "landscape" : "portrait" },
      }));
    }

    const next = [...modes, raw];
    setModes(next);
    if (!previewMode) setPreviewMode(raw);
    setCustomModeInput("");
    setCustomModeError("");
  };

  const removeMode = (mode: string) => {
    if (modes.length <= 1) return; // 최소 1개 유지(빈 목록은 기본 모드로 대체됨)
    const next = modes.filter((m) => m !== mode);
    setModes(next);
    if (previewMode === mode) setPreviewMode(next[0] || null);
    if (!FRAME_INFO[mode]) {
      setCustomModeInfo((prev) => {
        const updated = { ...prev };
        delete updated[mode];
        return updated;
      });
    }
  };

  const resolveUrl = useCallback((filename: string) => {
    return `${imageBaseUrl}/${filename.split("/").pop()}`;
  }, [imageBaseUrl]);

  // 커스텀 모드 입력칸 변경 — 소문자로 정규화 + 이전 검증 에러 메시지를 지운다(재입력 시 즉시 클리어).
  const updateCustomModeInput = useCallback((raw: string) => {
    setCustomModeInput(raw.toLowerCase());
    setCustomModeError("");
  }, []);

  return {
    settings, setSettings,
    loading, saving, message,
    paperWidth, setPaperWidth,
    paperHeight, setPaperHeight,
    modes, previewMode, setPreviewMode,
    customModeInfo, customModeInput, updateCustomModeInput, customModeError,
    effectiveModeInfo,
    imageBaseUrl,
    printerName, setPrinterName,
    printerList, setPrinterList,
    printBgImages,
    handleSave,
    handleAddCustomMode,
    removeMode,
    resolveUrl,
  };
}
