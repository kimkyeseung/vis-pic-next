"use client";

/** 인화 설정 페이지 좌측 3번 카드 — 인쇄 배경(프레임) 이미지는 [이미지 관리] 탭으로 관리를 안내하는 정적 카드. */
export function PrintBgInfoCard({ printBgCount }: { printBgCount: number }) {
  return (
    <div className="p-6 bg-gray-800 rounded-xl border border-gray-700">
      <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
        <span className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-sm">3</span>
        인쇄 배경(프레임) 이미지
      </h3>
      <p className="text-gray-400 text-sm">
        프레임 이미지 추가·삭제·배치 위치(포컬)·지점별 노출은{" "}
        <span className="text-blue-400 font-medium">이미지 관리 → 프레임</span> 탭에서 관리합니다.
        {printBgCount > 0
          ? ` (현재 ${printBgCount}장 등록됨 — 아래 미리보기에 첫 이미지가 표시됩니다)`
          : " 등록된 이미지가 없으면 인화 직전 선택 단계를 건너뜁니다."}
      </p>
    </div>
  );
}
