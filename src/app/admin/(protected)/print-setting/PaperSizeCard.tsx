"use client";

/** 인화 설정 페이지 좌측 1번 카드 — 인화지 가로/세로 크기 입력. */
export function PaperSizeCard({
  paperWidth,
  setPaperWidth,
  paperHeight,
  setPaperHeight,
}: {
  paperWidth: string;
  setPaperWidth: (v: string) => void;
  paperHeight: string;
  setPaperHeight: (v: string) => void;
}) {
  return (
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
  );
}
