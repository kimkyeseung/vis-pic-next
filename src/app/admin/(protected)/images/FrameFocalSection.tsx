"use client";

/** 프레임(인쇄 배경) 전용: 인화지에 꽉 차게 잘릴 때의 기준점(포컬) 조정 UI. */
export function FrameFocalSection({
  imageBaseUrl,
  filename,
  focalX,
  setFocalX,
  focalY,
  setFocalY,
}: {
  imageBaseUrl: string;
  filename: string;
  focalX: number;
  setFocalX: (v: number) => void;
  focalY: number;
  setFocalY: (v: number) => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-gray-700 bg-gray-900/40 p-4">
      <label className="block font-medium text-gray-200">인화지 배치 위치(포컬)</label>
      <p className="text-sm text-gray-500">
        이미지가 인화지 비율에 맞게 꽉 차게 잘릴 때의 기준점입니다.
      </p>
      <div className="h-28 w-full overflow-hidden rounded bg-gray-700">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${imageBaseUrl}/${filename}`}
          alt="focal preview"
          className="h-full w-full object-cover"
          style={{ objectPosition: `${focalX * 100}% ${focalY * 100}%` }}
        />
      </div>
      <div className="flex items-center gap-3">
        <span className="w-16 shrink-0 text-xs text-gray-500">가로 위치</span>
        <input
          type="range" min={0} max={100} step={1}
          value={Math.round(focalX * 100)}
          onChange={(e) => setFocalX(parseInt(e.target.value) / 100)}
          className="flex-1 accent-blue-500"
        />
        <span className="w-9 text-right text-xs text-gray-400">{Math.round(focalX * 100)}%</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="w-16 shrink-0 text-xs text-gray-500">세로 위치</span>
        <input
          type="range" min={0} max={100} step={1}
          value={Math.round(focalY * 100)}
          onChange={(e) => setFocalY(parseInt(e.target.value) / 100)}
          className="flex-1 accent-blue-500"
        />
        <span className="w-9 text-right text-xs text-gray-400">{Math.round(focalY * 100)}%</span>
      </div>
      <p className="text-xs text-gray-500">저장 시 반영됩니다.</p>
    </div>
  );
}
