"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useAdmin } from "../../AdminContext";
import { FRAME_INFO } from "@/constants/frames";
import type { FrameInfoEntry } from "@/types";
import { roundRect } from "@/lib/canvas";
import {
  computePrintLayout,
  modeSettingPrefix,
  getPaperDimensions as paperDimensionsFor,
  type PrintLayout,
} from "@/lib/printLayout";

interface PrintBgImage {
  id: number;
  name: string;
  filename: string;
}

export default function PrintSettingPage() {
  const { selectedDevice } = useAdmin();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bigCanvasRef = useRef<HTMLCanvasElement>(null);
  const [showBigPreview, setShowBigPreview] = useState(false);

  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

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

  const [imageBaseUrl, setImageBaseUrl] = useState("/static/images");
  const [printerName, setPrinterName] = useState("");
  const [printerList, setPrinterList] = useState<string[]>([]);

  // Print background images (imageType=4)
  const [printBgImages, setPrintBgImages] = useState<PrintBgImage[]>([]);
  const [bgUploading, setBgUploading] = useState(false);
  const [bgUploadError, setBgUploadError] = useState("");

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
      const res = await fetch("/api/image/list/4/");
      if (!res.ok) return;
      const data = await res.json();
      setPrintBgImages(data.images || []);
    } catch {
      // ignore
    }
  };

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/setting/");
      if (!res.ok) return;
      const data = await res.json();
      const s: Record<string, string> = data.settings || {};
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
  }, [selectedDevice]);

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      const updatedSettings: Record<string, string> = {
        ...settings,
        PICTURE_WIDTH: paperWidth,
        PICTURE_HEIGHT: paperHeight,
        CAPTURE_MODES: modes.join(","),
        PRINTER_NAME: printerName,
      };

      const res = await fetch("/api/setting/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedSettings),
      });

      if (res.ok) {
        setSettings(updatedSettings);
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

  const handleBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setBgUploading(true);
    setBgUploadError("");

    try {
      // Try presigned upload first (Vercel / large files)
      const presignRes = await fetch("/api/admin/images/presign/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type }),
      });

      if (presignRes.ok) {
        const { signedUrl, filename: storedFilename } = await presignRes.json();
        await fetch(signedUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
        const regRes = await fetch("/api/admin/images/register/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: storedFilename, name: file.name, imageType: 4, priority: 0 }),
        });
        if (regRes.ok) {
          await loadPrintBgImages();
          return;
        }
      }

      // Fallback: direct upload
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", file.name);
      formData.append("imageType", "4");
      formData.append("priority", "0");
      const uploadRes = await fetch("/api/admin/images/upload/", { method: "POST", body: formData });
      if (uploadRes.ok) {
        await loadPrintBgImages();
      } else {
        setBgUploadError("업로드에 실패했습니다.");
      }
    } catch {
      setBgUploadError("업로드 중 오류가 발생했습니다.");
    } finally {
      setBgUploading(false);
    }
  };

  const handleBgDelete = async (id: number) => {
    if (!confirm("이 배경 이미지를 삭제하시겠습니까?")) return;
    try {
      const res = await fetch(`/api/admin/images/${id}/`, { method: "DELETE" });
      if (res.ok) {
        setPrintBgImages((prev) => prev.filter((img) => img.id !== id));
      } else {
        alert("삭제에 실패했습니다.");
      }
    } catch {
      alert("삭제 중 오류가 발생했습니다.");
    }
  };

  const resolveUrl = useCallback((filename: string) => {
    return `${imageBaseUrl}/${filename.split("/").pop()}`;
  }, [imageBaseUrl]);

  const getPaperDimensions = useCallback((mode: string | null) => {
    const w = parseFloat(paperWidth) || 10;
    const h = parseFloat(paperHeight) || 15;
    const orient = mode && effectiveModeInfo[mode] ? effectiveModeInfo[mode].orientation : "portrait";
    return paperDimensionsFor(w, h, orient);
  }, [paperWidth, paperHeight, effectiveModeInfo]);

  const getPreviewLayout = useCallback((): PrintLayout | null => {
    if (!previewMode || !effectiveModeInfo[previewMode]) return null;
    const { pw, ph } = getPaperDimensions(previewMode);
    return computePrintLayout({
      frame: effectiveModeInfo[previewMode],
      mode: previewMode,
      paperW: pw,
      paperH: ph,
      settings,
    });
  }, [previewMode, settings, getPaperDimensions, effectiveModeInfo]);

  const overflowModes = useMemo(() => {
    const set = new Set<string>();
    for (const mode of modes) {
      if (!effectiveModeInfo[mode]) continue;
      const { pw, ph } = getPaperDimensions(mode);
      const layout = computePrintLayout({
        frame: effectiveModeInfo[mode],
        mode,
        paperW: pw,
        paperH: ph,
        settings,
      });
      if (layout.overflow) set.add(mode);
    }
    return set;
  }, [modes, effectiveModeInfo, settings, getPaperDimensions]);

  const drawSlots = useCallback((
    ctx: CanvasRenderingContext2D,
    ox: number, oy: number,
    drawW: number,
  ) => {
    if (!previewMode || !effectiveModeInfo[previewMode]) return;
    const layout = getPreviewLayout();
    if (!layout) return;

    const { pw } = getPaperDimensions(previewMode);
    const scale = drawW / pw;

    layout.slots.forEach((slot, i) => {
      const x = ox + slot.x * scale;
      const y = oy + slot.y * scale;
      const cellW = slot.w * scale;
      const cellH = slot.h * scale;

      ctx.fillStyle = "rgba(200, 200, 200, 0.3)";
      roundRect(ctx, x, y, cellW, cellH, 4);
      ctx.fill();

      ctx.strokeStyle = layout.overflow ? "rgba(239, 68, 68, 0.9)" : "rgba(150, 150, 150, 0.6)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      roundRect(ctx, x, y, cellW, cellH, 4);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = layout.overflow ? "rgba(239, 68, 68, 0.9)" : "rgba(120, 120, 120, 0.8)";
      ctx.font = `${Math.min(cellW, cellH) * 0.18}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${i + 1}`, x + cellW / 2, y + cellH / 2);
    });

    if (layout.overflow) {
      ctx.fillStyle = "rgba(239, 68, 68, 0.95)";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText("⚠ 인화지를 벗어납니다", ox + drawW / 2, oy + 6);
    }
  }, [previewMode, getPreviewLayout, getPaperDimensions, effectiveModeInfo]);

  const drawLabels = useCallback((
    ctx: CanvasRenderingContext2D,
    ox: number, oy: number,
    drawW: number, drawH: number,
    pw: number, ph: number,
  ) => {
    const fontSize = 11;
    ctx.font = `${fontSize}px sans-serif`;
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(`${pw}cm`, ox + drawW / 2, oy + drawH + 8);

    ctx.save();
    ctx.translate(ox - 8, oy + drawH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(`${ph}cm`, 0, 0);
    ctx.restore();
  }, []);

  const drawPreview = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { pw, ph } = getPaperDimensions(previewMode);

    const maxW = canvas.width;
    const maxH = canvas.height;
    const scale = Math.min(maxW / pw, maxH / ph) * 0.85;
    const drawW = pw * scale;
    const drawH = ph * scale;
    const ox = (maxW - drawW) / 2;
    const oy = (maxH - drawH) / 2;

    ctx.clearRect(0, 0, maxW, maxH);
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, maxW, maxH);

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.3)";
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, ox, oy, drawW, drawH, 6);
    ctx.fill();
    ctx.restore();

    const finishDraw = () => {
      drawSlots(ctx, ox, oy, drawW);
      drawLabels(ctx, ox, oy, drawW, drawH, pw, ph);
    };

    ctx.save();
    roundRect(ctx, ox, oy, drawW, drawH, 6);
    ctx.clip();

    // Show first print bg image in preview if available
    const firstBg = printBgImages[0];
    if (firstBg) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => { ctx.drawImage(img, ox, oy, drawW, drawH); ctx.restore(); finishDraw(); };
      img.onerror = () => { ctx.restore(); finishDraw(); };
      img.src = resolveUrl(firstBg.filename);
      return;
    }

    ctx.restore();
    finishDraw();
  }, [previewMode, printBgImages, getPaperDimensions, resolveUrl, drawSlots, drawLabels]);

  useEffect(() => {
    drawPreview();
  }, [drawPreview]);

  const drawBigPreview = useCallback(() => {
    const canvas = bigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { pw, ph } = getPaperDimensions(previewMode);

    const maxW = canvas.width;
    const maxH = canvas.height;
    const scale = Math.min(maxW / pw, maxH / ph) * 0.88;
    const drawW = pw * scale;
    const drawH = ph * scale;
    const ox = (maxW - drawW) / 2;
    const oy = (maxH - drawH) / 2;

    ctx.clearRect(0, 0, maxW, maxH);
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, maxW, maxH);

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.3)";
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, ox, oy, drawW, drawH, 6);
    ctx.fill();
    ctx.restore();

    const finishDraw = () => {
      drawSlots(ctx, ox, oy, drawW);
      drawLabels(ctx, ox, oy, drawW, drawH, pw, ph);
    };

    ctx.save();
    roundRect(ctx, ox, oy, drawW, drawH, 6);
    ctx.clip();

    const firstBg = printBgImages[0];
    if (firstBg) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => { ctx.drawImage(img, ox, oy, drawW, drawH); ctx.restore(); finishDraw(); };
      img.onerror = () => { ctx.restore(); finishDraw(); };
      img.src = resolveUrl(firstBg.filename);
      return;
    }

    ctx.restore();
    finishDraw();
  }, [previewMode, printBgImages, getPaperDimensions, resolveUrl, drawSlots, drawLabels]);

  useEffect(() => {
    if (showBigPreview) drawBigPreview();
  }, [showBigPreview, drawBigPreview]);


  if (loading) return <div className="text-gray-400">로딩중...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">인화 설정</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
        {/* Left: Settings */}
        <div className="space-y-6">
          {/* Paper Size */}
          <div className="p-6 bg-gray-800 rounded-xl border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-sm">1</span>
              인화지 크기
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-400 text-sm mb-1">가로 (cm)</label>
                <input
                  type="number"
                  value={paperWidth}
                  onChange={(e) => setPaperWidth(e.target.value)}
                  min="1"
                  step="0.1"
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white text-lg focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-gray-400 text-sm mb-1">세로 (cm)</label>
                <input
                  type="number"
                  value={paperHeight}
                  onChange={(e) => setPaperHeight(e.target.value)}
                  min="1"
                  step="0.1"
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white text-lg focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>
            <p className="text-gray-500 text-xs mt-2">
              인화지: {paperWidth}cm x {paperHeight}cm (촬영 모드에 따라 방향 자동 전환)
            </p>
          </div>

          {/* Shooting Modes */}
          <div className="p-6 bg-gray-800 rounded-xl border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-sm">2</span>
              촬영 모드
            </h3>

            {modes.length === 0 ? (
              <p className="text-gray-500 text-sm py-2">등록된 모드가 없습니다.</p>
            ) : (
              <div className="space-y-2 mb-4">
                {modes.map((mode) => {
                  const info = effectiveModeInfo[mode];
                  const isSelected = previewMode === mode;
                  return (
                    <div
                      key={mode}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
                        isSelected
                          ? "bg-blue-600/20 border-blue-500"
                          : "bg-gray-700/50 border-gray-600 hover:border-gray-500"
                      }`}
                      onClick={() => setPreviewMode(mode)}
                    >
                      <div
                        className="w-10 h-10 grid gap-0.5 p-1 bg-gray-800 rounded flex-shrink-0"
                        style={{
                          gridTemplateColumns: `repeat(${info.cols}, 1fr)`,
                          gridTemplateRows: `repeat(${info.rows}, 1fr)`,
                        }}
                      >
                        {Array.from({ length: info.count }).map((_, i) => (
                          <div key={i} className="bg-gray-500 rounded-sm" />
                        ))}
                      </div>

                      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                        <span className="text-white font-medium">{mode}</span>
                        <span className="text-gray-400 text-sm">{info.label}</span>
                        <span className={`px-1.5 py-0.5 text-xs rounded ${
                          info.orientation === "landscape"
                            ? "bg-amber-600/30 text-amber-300"
                            : "bg-indigo-600/30 text-indigo-300"
                        }`}>
                          {info.orientation === "landscape" ? "가로 인쇄" : "세로 인쇄"}
                        </span>
                        {overflowModes.has(mode) && (
                          <span className="px-1.5 py-0.5 text-xs rounded bg-red-600/30 text-red-300 font-semibold">
                            ⚠ 범위 초과
                          </span>
                        )}
                      </div>

                      <button
                        onClick={(e) => { e.stopPropagation(); removeMode(mode); }}
                        className="px-3 py-1 bg-red-600/80 text-white text-sm rounded-lg hover:bg-red-500 transition-colors flex-shrink-0"
                      >
                        삭제
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-gray-700">
              <p className="text-xs text-gray-500 mb-2">
                행×열 형식으로 입력 (예: <code className="text-gray-400">2x3</code> = 2행 3열, 6컷)
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customModeInput}
                  onChange={(e) => {
                    setCustomModeInput(e.target.value.toLowerCase());
                    setCustomModeError("");
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddCustomMode(); }}
                  placeholder="예: 2x3, 4x1, 3x2"
                  className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 placeholder-gray-500"
                />
                <button
                  onClick={handleAddCustomMode}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                >
                  + 추가
                </button>
              </div>
              {customModeError && (
                <p className="text-red-400 text-xs mt-1">{customModeError}</p>
              )}
            </div>

            {previewMode && (() => {
              const prefix = modeSettingPrefix(previewMode);
              const inputClass = "w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
              return (
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                    {previewMode} 레이아웃 설정 (cm)
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { suffix: "WIDTH", label: "사진 가로 크기" },
                      { suffix: "HEIGHT", label: "사진 세로 크기" },
                      { suffix: "HGAP", label: "사진 간 가로 간격" },
                      { suffix: "VGAP", label: "사진 간 세로 간격" },
                    ].map(({ suffix, label }) => {
                      const key = prefix + suffix;
                      return (
                        <div key={suffix}>
                          <label className="block text-gray-500 text-xs mb-1">{label}</label>
                          <input
                            type="number"
                            value={settings[key] || ""}
                            onChange={(e) => setSettings((prev) => ({ ...prev, [key]: e.target.value }))}
                            placeholder="0"
                            step="0.1"
                            min="0"
                            className={inputClass}
                          />
                        </div>
                      );
                    })}
                  </div>

                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-5 mb-1">
                    여백 설정
                  </p>
                  <p className="text-gray-500 text-xs mb-1">
                    ※ 상단/하단 또는 좌측/우측 여백은 동시에 설정할 수 없습니다.
                  </p>
                  <p className="text-gray-500 text-xs mb-3">
                    ※ 값을 비우면 자동 중앙 정렬됩니다.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { suffix: "MARGIN_TOP", label: "상단 여백", opposite: "MARGIN_BOTTOM" },
                      { suffix: "MARGIN_BOTTOM", label: "하단 여백", opposite: "MARGIN_TOP" },
                      { suffix: "MARGIN_LEFT", label: "좌측 여백", opposite: "MARGIN_RIGHT" },
                      { suffix: "MARGIN_RIGHT", label: "우측 여백", opposite: "MARGIN_LEFT" },
                    ].map(({ suffix, label, opposite }) => {
                      const key = prefix + suffix;
                      const disabled = (settings[prefix + opposite] ?? "").trim() !== "";
                      return (
                        <div key={suffix}>
                          <label className="block text-gray-500 text-xs mb-1">{label}</label>
                          <input
                            type="number"
                            value={settings[key] || ""}
                            onChange={(e) => setSettings((prev) => ({ ...prev, [key]: e.target.value }))}
                            placeholder={disabled ? "반대쪽 여백 사용 중" : "자동 (중앙 정렬)"}
                            step="0.1"
                            min="0"
                            disabled={disabled}
                            className={inputClass}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Print Background Images */}
          <div className="p-6 bg-gray-800 rounded-xl border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-sm">3</span>
              인쇄 배경 이미지
            </h3>
            <p className="text-gray-500 text-xs mb-4">
              사용자가 인화 직전에 선택할 배경 이미지 목록입니다. 여러 장 등록 가능하며, 이미지가 없으면 선택 단계를 건너뜁니다.
            </p>

            {/* Upload button */}
            <label className={`inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg cursor-pointer hover:bg-blue-700 transition-colors mb-4 ${bgUploading ? "opacity-50 pointer-events-none" : ""}`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {bgUploading ? "업로드 중..." : "이미지 추가"}
              <input
                type="file"
                accept="image/*"
                onChange={handleBgUpload}
                disabled={bgUploading}
                className="hidden"
              />
            </label>

            {bgUploadError && (
              <p className="text-red-400 text-sm mb-3">{bgUploadError}</p>
            )}

            {printBgImages.length === 0 ? (
              <div className="py-8 text-center text-gray-500 text-sm border border-dashed border-gray-600 rounded-lg">
                등록된 인쇄 배경 이미지가 없습니다
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {printBgImages.map((img) => (
                  <div key={img.id} className="relative group rounded-lg overflow-hidden border border-gray-600">
                    <img
                      src={resolveUrl(img.filename)}
                      alt={img.name}
                      className="w-full h-28 object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.3"; }}
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <button
                        onClick={() => handleBgDelete(img.id)}
                        className="px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-500 transition-colors"
                      >
                        삭제
                      </button>
                    </div>
                    <p className="text-gray-400 text-xs truncate px-2 py-1 bg-gray-900/80">{img.name}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Printer */}
          <div className="p-6 bg-gray-800 rounded-xl border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-sm">4</span>
              프린터 설정
            </h3>
            <div className="space-y-3">
              <div className="flex gap-2">
                {printerList.length > 0 ? (
                  <select
                    value={printerName}
                    onChange={(e) => setPrinterName(e.target.value)}
                    className="flex-1 px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="">기본 프린터</option>
                    {printerList.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={printerName}
                    onChange={(e) => setPrinterName(e.target.value)}
                    placeholder="프린터 이름 (비워두면 기본 프린터 사용)"
                    className="flex-1 px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500 placeholder-gray-500"
                  />
                )}
                <button
                  onClick={async () => {
                    const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
                    if (!isTauri) { alert("Tauri 앱에서만 사용 가능합니다."); return; }
                    try {
                      const { invoke } = await import("@tauri-apps/api/core");
                      const list = await invoke<string[]>("get_printers");
                      setPrinterList(list);
                    } catch { alert("프린터 목록을 가져오지 못했습니다."); }
                  }}
                  className="px-4 py-3 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 hover:text-white transition-colors border border-gray-600 text-sm whitespace-nowrap"
                >
                  목록 조회
                </button>
              </div>
              <p className="text-gray-500 text-xs">
                비워두면 Windows 기본 프린터로 출력됩니다.
              </p>
            </div>
          </div>
        </div>

        {/* Right: Preview */}
        <div className="space-y-4">
          <div className="p-6 bg-gray-800 rounded-xl border border-gray-700 sticky top-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">인화 미리보기</h3>
              <button
                onClick={() => setShowBigPreview(true)}
                title="크게 보기"
                className="w-8 h-8 flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-full transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  <line x1="11" y1="8" x2="11" y2="14" />
                  <line x1="8" y1="11" x2="14" y2="11" />
                </svg>
              </button>
            </div>
            <div className="bg-gray-900 rounded-lg p-4">
              <canvas
                ref={canvasRef}
                width={360}
                height={360}
                className="w-full rounded"
              />
            </div>

            {getPreviewLayout()?.overflow && (
              <div className="mt-3 p-3 bg-red-900/40 border border-red-500/60 rounded-lg text-red-300 text-sm">
                ⚠ 현재 설정으로는 사진이 인화지를 벗어납니다. 사진 크기·간격·여백을 확인하세요.
              </div>
            )}

            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between text-gray-400">
                <span>배치</span>
                <span className="text-white">
                  {getPreviewLayout()?.fromSettings ? "설정값 기반" : "자동 (설정 없음)"}
                </span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>인화지</span>
                <span className="text-white">
                  {(() => {
                    const { pw, ph } = getPaperDimensions(previewMode);
                    return `${pw}cm x ${ph}cm`;
                  })()}
                </span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>인쇄 방향</span>
                <span className="text-white">
                  {previewMode && effectiveModeInfo[previewMode]
                    ? effectiveModeInfo[previewMode].orientation === "landscape" ? "가로" : "세로"
                    : "-"}
                </span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>선택 모드</span>
                <span className="text-white">
                  {previewMode ? `${previewMode} (${effectiveModeInfo[previewMode]?.label})` : "없음"}
                </span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>인쇄 배경</span>
                <span className="text-white">
                  {printBgImages.length > 0 ? `${printBgImages.length}장 등록됨` : "없음"}
                </span>
              </div>
            </div>

            {modes.length > 1 && (
              <div className="mt-4 pt-4 border-t border-gray-700">
                <span className="text-gray-500 text-xs block mb-2">모드 전환</span>
                <div className="flex flex-wrap gap-1">
                  {modes.map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setPreviewMode(mode)}
                      className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                        previewMode === mode
                          ? "bg-blue-600 text-white"
                          : "bg-gray-700 text-gray-400 hover:text-white"
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Save bar */}
      {message && (
        <div className={`p-4 rounded-lg ${message.includes("실패") ? "bg-red-900/50 border border-red-500 text-red-300" : "bg-green-900/50 border border-green-500 text-green-300"}`}>
          {message}
        </div>
      )}

      <div className="sticky bottom-0 py-4 bg-gray-900 border-t border-gray-700 flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving || overflowModes.size > 0}
          className="px-8 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "저장 중..." : "설정 저장"}
        </button>
        {overflowModes.size > 0 && (
          <p className="text-red-400 text-sm">
            ⚠ {[...overflowModes].join(", ")} 모드가 인화지를 벗어납니다. 크기·간격·여백을 수정 후 저장하세요.
          </p>
        )}
      </div>

      {/* Big Preview Modal */}
      {showBigPreview && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowBigPreview(false)}
        >
          <div
            className="relative bg-gray-900 rounded-2xl border border-gray-700 shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 flex-shrink-0">
              <h3 className="text-lg font-semibold text-white">
                인화 미리보기 — {previewMode ?? "모드 없음"}
              </h3>
              <button
                onClick={() => setShowBigPreview(false)}
                className="w-8 h-8 flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-lg transition-colors text-sm"
              >
                ✕
              </button>
            </div>
            <div className="p-6 overflow-auto flex-1">
              <div className="bg-[#1a1a2e] rounded-xl overflow-hidden">
                <canvas
                  ref={bigCanvasRef}
                  width={1080}
                  height={1080}
                  className="w-full rounded-xl"
                />
              </div>
              {getPreviewLayout()?.overflow && (
                <div className="mt-4 p-3 bg-red-900/40 border border-red-500/60 rounded-lg text-red-300 text-sm">
                  ⚠ 현재 설정으로는 사진이 인화지를 벗어납니다. 사진 크기·간격·여백을 확인하세요.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
