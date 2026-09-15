"use client";

/** 인화 설정 페이지 좌측 4번 카드 — 프린터 이름 선택/입력 + Tauri 프린터 목록 조회. */
export function PrinterCard({
  printerName,
  setPrinterName,
  printerList,
  setPrinterList,
}: {
  printerName: string;
  setPrinterName: (v: string) => void;
  printerList: string[];
  setPrinterList: (list: string[]) => void;
}) {
  return (
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
  );
}
