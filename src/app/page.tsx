"use client";

import Link from "next/link";

export default function Home() {
  return (
    <main className="w-full h-screen flex flex-col items-center justify-center relative overflow-hidden">
      {/* 배경 패턴 */}
      <div className="pattern-overlay" />
      <div className="floating-elements">
        <div className="floating-element" />
        <div className="floating-element" />
        <div className="floating-element" />
        <div className="floating-element" />
      </div>

      <div className="main-container flex flex-col items-center relative z-10">
        <div style={{ marginTop: "150px" }} />

        {/* 로고 */}
        <div className="text-center mb-0 animate-fadeInUp">
          <h1
            className="text-6xl font-extrabold mb-5 tracking-widest text-white"
            style={{ textShadow: "0 2px 10px rgba(0,0,0,0.5)" }}
          >
            AR-pic
          </h1>
        </div>

        {/* 버튼들 */}
        <div className="flex gap-16 animate-fadeInUp" style={{ animationDelay: "0.3s" }}>
          <Link
            href="/service?device=test"
            className="service-button flex-col gap-3 w-52 min-h-44 p-6 text-xl rounded-2xl"
          >
            <span className="text-3xl opacity-80">📸</span>
            <span className="tracking-wide">서비스 화면</span>
          </Link>

          <Link
            href="/admin"
            className="service-button flex-col gap-3 w-52 min-h-44 p-6 text-xl rounded-2xl"
          >
            <span className="text-3xl opacity-80">⚙️</span>
            <span className="tracking-wide">관리자 화면</span>
          </Link>
        </div>

        <img
          src="/static/images/viswave_logo.png"
          className="mt-24 opacity-80"
          style={{ width: "200px" }}
          alt="Viswave"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      </div>

      {/* 하단 안내 */}
      <div
        className="absolute bottom-8 text-center text-gray-500 text-sm animate-fadeInUp"
        style={{ animationDelay: "0.6s" }}
      >
        <p>터치 또는 클릭하여 원하는 모드를 선택하세요</p>
      </div>
    </main>
  );
}
