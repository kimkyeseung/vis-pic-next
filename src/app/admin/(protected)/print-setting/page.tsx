"use client";

import { useAdmin } from "../../AdminContext";
import { usePrintSettingsForm } from "./usePrintSettingsForm";
import { usePrintLayoutPreview } from "./usePrintLayoutPreview";
import { PaperSizeCard } from "./PaperSizeCard";
import { ShootingModesCard } from "./ShootingModesCard";
import { PrintBgInfoCard } from "./PrintBgInfoCard";
import { PrinterCard } from "./PrinterCard";
import { PreviewPanel } from "./PreviewPanel";
import { BigPreviewModal } from "./BigPreviewModal";

export default function PrintSettingPage() {
  const { selectedDevice } = useAdmin();

  const form = usePrintSettingsForm(selectedDevice?.deviceId);
  const {
    canvasRef, bigCanvasRef,
    showBigPreview, setShowBigPreview,
    getPaperDimensions, getPreviewLayout, overflowModes,
  } = usePrintLayoutPreview({
    paperWidth: form.paperWidth,
    paperHeight: form.paperHeight,
    modes: form.modes,
    previewMode: form.previewMode,
    effectiveModeInfo: form.effectiveModeInfo,
    settings: form.settings,
    printBgImages: form.printBgImages,
    resolveUrl: form.resolveUrl,
  });

  if (form.loading) return <div className="text-gray-400">로딩중...</div>;
  if (!selectedDevice) return <div className="p-8 bg-gray-800 rounded-xl text-center text-gray-400">상단에서 지점을 선택하세요.</div>;

  const previewLayout = getPreviewLayout();
  const paperDimensions = getPaperDimensions(form.previewMode);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">인화 설정</h2>
          <p className="mt-1 text-sm text-gray-500">
            <span className="text-white font-medium">{selectedDevice.name}</span> 지점 설정입니다.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
        {/* Left: Settings */}
        <div className="space-y-6">
          <PaperSizeCard
            paperWidth={form.paperWidth}
            setPaperWidth={form.setPaperWidth}
            paperHeight={form.paperHeight}
            setPaperHeight={form.setPaperHeight}
          />

          <ShootingModesCard
            modes={form.modes}
            effectiveModeInfo={form.effectiveModeInfo}
            previewMode={form.previewMode}
            setPreviewMode={form.setPreviewMode}
            overflowModes={overflowModes}
            removeMode={form.removeMode}
            customModeInput={form.customModeInput}
            updateCustomModeInput={form.updateCustomModeInput}
            customModeError={form.customModeError}
            handleAddCustomMode={form.handleAddCustomMode}
            settings={form.settings}
            setSettings={form.setSettings}
          />

          <PrintBgInfoCard printBgCount={form.printBgImages.length} />

          <PrinterCard
            printerName={form.printerName}
            setPrinterName={form.setPrinterName}
            printerList={form.printerList}
            setPrinterList={form.setPrinterList}
          />
        </div>

        {/* Right: Preview */}
        <PreviewPanel
          canvasRef={canvasRef}
          onOpenBigPreview={() => setShowBigPreview(true)}
          previewLayout={previewLayout}
          paperDimensions={paperDimensions}
          previewMode={form.previewMode}
          effectiveModeInfo={form.effectiveModeInfo}
          printBgCount={form.printBgImages.length}
          modes={form.modes}
          setPreviewMode={form.setPreviewMode}
        />
      </div>

      {/* Save bar */}
      {form.message && (
        <div className={`p-4 rounded-lg ${form.message.includes("실패") ? "bg-red-900/50 border border-red-500 text-red-300" : "bg-green-900/50 border border-green-500 text-green-300"}`}>
          {form.message}
        </div>
      )}

      <div className="sticky bottom-0 py-4 bg-gray-900 border-t border-gray-700 flex items-center gap-4">
        <button
          onClick={form.handleSave}
          disabled={form.saving || overflowModes.size > 0}
          className="px-8 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {form.saving ? "저장 중..." : "설정 저장"}
        </button>
        {overflowModes.size > 0 && (
          <p className="text-red-400 text-sm">
            ⚠ {[...overflowModes].join(", ")} 모드가 인화지를 벗어납니다. 크기·간격·여백을 수정 후 저장하세요.
          </p>
        )}
      </div>

      {/* Big Preview Modal */}
      {showBigPreview && (
        <BigPreviewModal
          previewMode={form.previewMode}
          bigCanvasRef={bigCanvasRef}
          overflow={!!previewLayout?.overflow}
          onClose={() => setShowBigPreview(false)}
        />
      )}
    </div>
  );
}
