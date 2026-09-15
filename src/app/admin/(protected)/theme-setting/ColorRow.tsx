"use client";

import { useState } from "react";
import { HexColorPicker } from "react-colorful";

/** 색상 선택 행 (스와치 + 팝오버 피커 + hex 입력). 테마 관리 페이지 전역에서 재사용. */
export function ColorRow({
  color,
  onChange,
  children,
}: {
  color: string;
  onChange: (c: string) => void;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-11 h-11 rounded-lg border border-gray-600"
          style={{ background: color }}
          aria-label="색상 선택"
        />
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute top-full left-0 mt-2 z-20 p-3 bg-gray-800 border border-gray-600 rounded-xl shadow-xl">
              <HexColorPicker color={color} onChange={onChange} />
            </div>
          </>
        )}
      </div>
      <input
        type="text"
        value={color}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-2 w-32 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-blue-500"
        placeholder="#000000"
      />
      {children}
    </div>
  );
}
