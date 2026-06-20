"use client";

import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  const handleStart = () => {
    router.push("/service?device=test");
  };

  return (
    <main
      className="w-full h-screen flex flex-col items-center justify-center cursor-pointer"
      style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)" }}
      onClick={handleStart}
    >
      <div className="text-center animate-slide-up">
        <h1 className="text-6xl font-bold mb-6 tracking-wider text-white">AR-pic</h1>
        <p className="text-xl text-gray-400 mb-16">AI 포토부스</p>
      </div>

      <button
        className="btn btn-primary text-2xl px-16 py-6 rounded-3xl shadow-2xl animate-pulse-slow"
        onClick={handleStart}
      >
        👆 화면을 터치해주세요
      </button>

      <div className="absolute bottom-12 text-gray-500 text-sm text-center animate-fade-in">
        <p>화면 아무 곳이나 터치하여 시작하세요</p>
        <p className="mt-2 animate-pulse-slow">● 대기중 ●</p>
      </div>
    </main>
  );
}
