"use client";

import { useState, useEffect, useRef } from "react";
import type { DeviceConfig } from "@/types";

export function PaymentSection({
  config,
  orderId,
  setOrderId,
  onNext,
  onPrev,
}: {
  config: DeviceConfig;
  orderId: string | null;
  setOrderId: (id: string | null) => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  const [status, setStatus] = useState<"idle" | "requesting" | "waiting" | "completed" | "error">(
    orderId ? "waiting" : "idle"
  );
  const [errorMsg, setErrorMsg] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isManual = config.paymentTerminalMode === "manual";

  const startPolling = (oid: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > 150) {
        if (pollRef.current) clearInterval(pollRef.current);
        setStatus("error");
        setErrorMsg("결제 시간이 초과되었습니다");
        return;
      }
      try {
        const res = await fetch(`/api/payments/status/${oid}`);
        const data = await res.json();
        if (data.paymentStatus === "paid") {
          if (pollRef.current) clearInterval(pollRef.current);
          setStatus("completed");
          setTimeout(onNext, 800);
        }
      } catch {
        // keep polling
      }
    }, 2000);
  };

  useEffect(() => {
    if (orderId) startPolling(orderId);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  // orderId는 마운트 시점에만 읽어 폴링 재개 여부를 결정하므로 deps 생략
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestPayment = async () => {
    setStatus("requesting");
    setErrorMsg("");
    try {
      const res = await fetch("/api/payments/request/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: config.deviceId, amount: config.paymentAmount }),
      });
      const data = await res.json();
      if (data.orderId) {
        setOrderId(data.orderId);
        setStatus("waiting");
        startPolling(data.orderId);
      } else {
        setErrorMsg(data.error || "결제 요청 실패");
        setStatus("error");
      }
    } catch {
      setErrorMsg("서버에 연결할 수 없습니다");
      setStatus("error");
    }
  };

  const confirmManualPayment = () => {
    setStatus("completed");
    setTimeout(onNext, 800);
  };

  const devBypass = () => {
    setStatus("completed");
    setTimeout(onNext, 500);
  };

  return (
    <section className="w-full h-full flex flex-col items-center justify-center relative z-10">
      <div className="text-center animate-fadeInDown">
        <h2 className="text-4xl font-extrabold text-white mb-16" style={{ textShadow: "0 2px 15px rgba(0,0,0,0.5)" }}>
          결제
        </h2>
      </div>

      <div className="bg-black/30 backdrop-blur-sm p-16 rounded-3xl border border-white/10 text-center animate-fadeInUp min-w-[500px]">
        {/* 수동 결제 모드 */}
        {status === "idle" && isManual && (
          <>
            <div className="text-6xl font-black text-white mb-4">
              {config.paymentAmount.toLocaleString()}원
            </div>
            <p className="text-gray-400 text-xl mb-12">결제 후 아래 버튼을 눌러주세요</p>
            <div className="flex gap-6 justify-center">
              <button className="service-button nav-button" onClick={confirmManualPayment}>
                결제 확인
              </button>
              <button className="service-button nav-button" style={{ background: "rgba(255,255,255,0.1)", color: "#fff" }} onClick={onPrev}>
                처음으로
              </button>
            </div>
          </>
        )}

        {/* PayApp Lite 모드 */}
        {status === "idle" && !isManual && (
          <>
            <div className="text-6xl font-black text-white mb-4">
              {config.paymentAmount.toLocaleString()}원
            </div>
            <p className="text-gray-400 text-xl mb-12">카드 결제를 진행해 주세요</p>
            <div className="flex gap-6 justify-center">
              <button className="service-button nav-button" onClick={requestPayment}>
                결제하기
              </button>
              <button className="service-button nav-button" style={{ background: "rgba(255,255,255,0.1)", color: "#fff" }} onClick={onPrev}>
                처음으로
              </button>
            </div>
          </>
        )}

        {status === "requesting" && (
          <div className="py-8">
            <div className="w-20 h-20 border-4 border-white/20 border-t-blue-500 rounded-full animate-spin mx-auto mb-8" />
            <p className="text-white text-2xl">결제 요청 중...</p>
          </div>
        )}

        {status === "waiting" && (
          <div className="py-8">
            <div className="w-20 h-20 border-4 border-white/20 border-t-green-500 rounded-full animate-spin mx-auto mb-8" />
            <p className="text-white text-2xl mb-4">결제 대기중</p>
            <p className="text-gray-400 text-lg mb-8">카드를 리더기에 대주세요</p>
            {process.env.NODE_ENV === "development" && (
              <button className="text-gray-500 text-sm underline" onClick={devBypass}>
                결제 건너뛰기 (개발 모드)
              </button>
            )}
          </div>
        )}

        {status === "completed" && (
          <div className="py-8">
            <div className="text-6xl mb-6">&#10003;</div>
            <p className="text-green-400 text-2xl font-bold">결제 완료!</p>
          </div>
        )}

        {status === "error" && (
          <>
            <p className="text-red-400 text-xl mb-6">{errorMsg}</p>
            <div className="flex gap-4 justify-center">
              {isManual ? (
                <button className="service-button nav-button" onClick={confirmManualPayment}>
                  결제 확인
                </button>
              ) : (
                <button className="service-button nav-button" onClick={requestPayment}>
                  다시 시도
                </button>
              )}
              <button className="service-button nav-button" style={{ background: "rgba(255,255,255,0.1)", color: "#fff" }} onClick={onPrev}>
                처음으로
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
