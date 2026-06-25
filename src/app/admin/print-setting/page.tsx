"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useAdmin } from "../AdminContext";
import { FRAME_INFO, ALL_MODES } from "@/constants/frames";
import { roundRect } from "@/lib/canvas";

export default function PrintSettingPage() {
  const { selectedDevice } = useAdmin();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [paperWidth, setPaperWidth] = useState("10");
  const [paperHeight, setPaperHeight] = useState("15");
  const [modes, setModes] = useState<string[]>([]);
  const [previewMode, setPreviewMode] = useState<string | null>(null);

  const [bgFile, setBgFile] = useState<File | null>(null);
  const [bgPreviewUrl, setBgPreviewUrl] = useState<string | null>(null);
  const [existingBgUrl, setExistingBgUrl] = useState<string | null>(null);
  const [imageBaseUrl, setImageBaseUrl] = useState("/static/images");

  useEffect(() => {
    loadSettings();
    loadImageBaseUrl();
  }, [selectedDevice]);

  const loadImageBaseUrl = async () => {
    try {
      const res = await fetch("/api/images/url");
      if (!res.ok) return;
      const data = await res.json();
      if (data.baseUrl) setImageBaseUrl(data.baseUrl);
    } catch {
      // use default
    }
  };

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/setting");
      if (!res.ok) return;
      const data = await res.json();
      const s: Record<string, string> = data.settings || {};
      setSettings(s);

      setPaperWidth(s.PICTURE_WIDTH || "10");
      setPaperHeight(s.PICTURE_HEIGHT || "15");

      const modeList = (s.CAPTURE_MODES || "1x1,2x2")
        .split(",")
        .map((m: string) => m.trim())
        .filter((m: string) => FRAME_INFO[m]);
      setModes(modeList);
      if (modeList.length > 0) setPreviewMode(modeList[0]);

      if (s.PRINT_BACKGROUND) {
        setExistingBgUrl(s.PRINT_BACKGROUND);
      }
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      const updatedSettings: Record<string, string> = {
        ...settings,
        PICTURE_WIDTH: paperWidth,
        PICTURE_HEIGHT: paperHeight,
        CAPTURE_MODES: modes.join(","),
      };

      if (bgFile) {
        const formData = new FormData();
        formData.append("file", bgFile);
        formData.append("name", "인화 배경");
        formData.append("imageType", "2");
        formData.append("priority", "0");

        const uploadRes = await fetch("/api/admin/images/upload", {
          method: "POST",
          body: formData,
        });

        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          updatedSettings.PRINT_BACKGROUND = uploadData.image.filename;
          setExistingBgUrl(uploadData.image.filename);
          setBgFile(null);
          setBgPreviewUrl(uploadData.image.url || null);
        }
      }

      const res = await fetch("/api/setting", {
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

  const addMode = (mode: string) => {
    if (!modes.includes(mode)) {
      const next = [...modes, mode];
      setModes(next);
      if (!previewMode) setPreviewMode(mode);
    }
  };

  const removeMode = (mode: string) => {
    const next = modes.filter((m) => m !== mode);
    setModes(next);
    if (previewMode === mode) setPreviewMode(next[0] || null);
  };

  const handleBgFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBgFile(file);
    const url = URL.createObjectURL(file);
    setBgPreviewUrl(url);
  };

  const removeBg = () => {
    setBgFile(null);
    setBgPreviewUrl(null);
    setExistingBgUrl(null);
    setSettings((prev) => {
      const next = { ...prev };
      delete next.PRINT_BACKGROUND;
      return next;
    });
  };

  const resolveUrl = (value: string) => {
    if (value.startsWith("http://") || value.startsWith("https://")) return value;
    if (value.startsWith("/")) return value;
    return `${imageBaseUrl}/${value.split("/").pop()}`;
  };

  const getPaperDimensions = useCallback((mode: string | null) => {
    const w = parseFloat(paperWidth) || 10;
    const h = parseFloat(paperHeight) || 15;
    const longer = Math.max(w, h);
    const shorter = Math.min(w, h);
    const orient = mode && FRAME_INFO[mode] ? FRAME_INFO[mode].orientation : "portrait";
    if (orient === "landscape") return { pw: longer, ph: shorter };
    return { pw: shorter, ph: longer };
  }, [paperWidth, paperHeight]);

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
      drawSlots(ctx, ox, oy, drawW, drawH);
      drawLabels(ctx, ox, oy, drawW, drawH, pw, ph);
    };

    ctx.save();
    roundRect(ctx, ox, oy, drawW, drawH, 6);
    ctx.clip();

    const bgUrl = bgPreviewUrl || (existingBgUrl ? resolveUrl(existingBgUrl) : null);
    if (bgUrl) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => { ctx.drawImage(img, ox, oy, drawW, drawH); ctx.restore(); finishDraw(); };
      img.onerror = () => { ctx.restore(); finishDraw(); };
      img.src = bgUrl;
      return;
    }

    ctx.restore();
    finishDraw();
  }, [paperWidth, paperHeight, previewMode, bgPreviewUrl, existingBgUrl, imageBaseUrl, getPaperDimensions]);

  const drawSlots = (
    ctx: CanvasRenderingContext2D,
    ox: number, oy: number,
    drawW: number, drawH: number,
  ) => {
    if (!previewMode || !FRAME_INFO[previewMode]) return;
    const frame = FRAME_INFO[previewMode];

    const padding = Math.min(drawW, drawH) * 0.04;
    const allocW = (drawW - padding * (frame.cols + 1)) / frame.cols;
    const allocH = (drawH - padding * (frame.rows + 1)) / frame.rows;

    const photoRatio = 4 / 3;
    let cellW: number, cellH: number;
    if (allocW / allocH > photoRatio) {
      cellH = allocH;
      cellW = cellH * photoRatio;
    } else {
      cellW = allocW;
      cellH = cellW / photoRatio;
    }

    for (let i = 0; i < frame.count; i++) {
      const col = i % frame.cols;
      const row = Math.floor(i / frame.cols);
      const ax = ox + padding + col * (allocW + padding);
      const ay = oy + padding + row * (allocH + padding);
      const x = ax + (allocW - cellW) / 2;
      const y = ay + (allocH - cellH) / 2;

      ctx.fillStyle = "rgba(200, 200, 200, 0.3)";
      roundRect(ctx, x, y, cellW, cellH, 4);
      ctx.fill();

      ctx.strokeStyle = "rgba(150, 150, 150, 0.6)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      roundRect(ctx, x, y, cellW, cellH, 4);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "rgba(120, 120, 120, 0.8)";
      ctx.font = `${Math.min(cellW, cellH) * 0.18}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${i + 1}`, x + cellW / 2, y + cellH / 2);
    }
  };

  const drawLabels = (
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
  };

  useEffect(() => {
    drawPreview();
  }, [drawPreview]);

  const availableModes = ALL_MODES.filter((m) => !modes.includes(m));

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
                  const info = FRAME_INFO[mode];
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
                      {/* Mini grid preview */}
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

                      <div className="flex-1 min-w-0">
                        <span className="text-white font-medium">{mode}</span>
                        <span className="text-gray-400 text-sm ml-2">{info.label}</span>
                        <span className={`ml-2 px-1.5 py-0.5 text-xs rounded ${
                          info.orientation === "landscape"
                            ? "bg-amber-600/30 text-amber-300"
                            : "bg-indigo-600/30 text-indigo-300"
                        }`}>
                          {info.orientation === "landscape" ? "가로 인쇄" : "세로 인쇄"}
                        </span>
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

            {availableModes.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {availableModes.map((mode) => (
                  <button
                    key={mode}
                    onClick={() => addMode(mode)}
                    className="px-3 py-2 bg-gray-700 text-gray-300 text-sm rounded-lg hover:bg-gray-600 hover:text-white transition-colors border border-gray-600 border-dashed"
                  >
                    + {mode} ({FRAME_INFO[mode].label})
                  </button>
                ))}
              </div>
            )}

            {/* Layout settings for selected mode */}
            {previewMode && (
              <div className="mt-4 pt-4 border-t border-gray-700">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  {previewMode} 레이아웃 설정 (cm)
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { suffix: "WIDTH", label: "사진 가로" },
                    { suffix: "HEIGHT", label: "사진 세로" },
                    { suffix: "HGAP", label: "가로 간격" },
                    { suffix: "VGAP", label: "세로 간격" },
                    { suffix: "MARGIN_TOP", label: "상단 여백" },
                    { suffix: "MARGIN_LEFT", label: "좌측 여백" },
                    { suffix: "MARGIN_BOTTOM", label: "하단 여백" },
                    { suffix: "MARGIN_RIGHT", label: "우측 여백" },
                  ].map(({ suffix, label }) => {
                    const key = `MODE_${previewMode.replace("x", "_")}_${suffix}`;
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
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Background Image */}
          <div className="p-6 bg-gray-800 rounded-xl border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-sm">3</span>
              인쇄 배경 이미지
            </h3>

            <div className="space-y-4">
              <label className="flex items-center gap-3 px-4 py-3 bg-gray-700 border border-gray-600 border-dashed rounded-lg cursor-pointer hover:border-blue-500 transition-colors">
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-gray-400 text-sm">
                  {bgFile ? bgFile.name : "이미지 파일 선택..."}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleBgFileChange}
                  className="hidden"
                />
              </label>

              {(bgPreviewUrl || existingBgUrl) && (
                <div className="relative group">
                  <img
                    src={bgPreviewUrl || (existingBgUrl ? resolveUrl(existingBgUrl) : "")}
                    alt="배경 미리보기"
                    className="w-full max-h-48 object-cover rounded-lg border border-gray-600"
                  />
                  <button
                    onClick={removeBg}
                    className="absolute top-2 right-2 p-1.5 bg-red-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Preview */}
        <div className="space-y-4">
          <div className="p-6 bg-gray-800 rounded-xl border border-gray-700 sticky top-6">
            <h3 className="text-lg font-semibold text-white mb-4">인화 미리보기</h3>
            <div className="bg-gray-900 rounded-lg p-4">
              <canvas
                ref={canvasRef}
                width={360}
                height={360}
                className="w-full rounded"
              />
            </div>

            <div className="mt-4 space-y-2 text-sm">
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
                  {previewMode && FRAME_INFO[previewMode]
                    ? FRAME_INFO[previewMode].orientation === "landscape" ? "가로" : "세로"
                    : "-"}
                </span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>선택 모드</span>
                <span className="text-white">
                  {previewMode ? `${previewMode} (${FRAME_INFO[previewMode]?.label})` : "없음"}
                </span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>배경</span>
                <span className="text-white">
                  {bgPreviewUrl || existingBgUrl ? "설정됨" : "없음"}
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

      <div className="sticky bottom-0 py-4 bg-gray-900/80 backdrop-blur-sm">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-8 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {saving ? "저장 중..." : "설정 저장"}
        </button>
      </div>
    </div>
  );
}

