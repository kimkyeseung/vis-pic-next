"use client";

import { useState, useEffect, useRef } from "react";
import type { DeviceConfig } from "@/types";
import { useLanguage } from "@/i18n/LanguageContext";
import type { MessageKey } from "@/i18n/translations";

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
  const { t } = useLanguage();
  const [status, setStatus] = useState<"idle" | "requesting" | "waiting" | "completed" | "error">(
    orderId ? "waiting" : "idle"
  );
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);
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
        setErrorKey("payment.timeout");
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
    setErrorKey(null);
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
        setErrorKey("payment.requestFailed");
        setStatus("error");
      }
    } catch {
      setErrorKey("payment.serverError");
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
          {t("payment.title")}
        </h2>
      </div>

      <div className="bg-black/30 backdrop-blur-sm p-16 rounded-3xl border border-white/10 text-center animate-fadeInUp min-w-[500px]">
        {/* 수동 결제 모드 */}
        {status === "idle" && isManual && (
          <>
            <div className="text-6xl font-black text-white mb-4">
              {t("payment.amount", { amount: config.paymentAmount.toLocaleString() })}
            </div>
            <p className="text-gray-400 text-xl mb-12">{t("payment.manualGuide")}</p>
            <div className="flex gap-6 justify-center">
              <button className="service-button nav-button" onClick={confirmManualPayment}>
                {t("payment.confirm")}
              </button>
              <button className="service-button nav-button" style={{ background: "rgba(255,255,255,0.1)", color: "#fff" }} onClick={onPrev}>
                {t("common.home")}
              </button>
            </div>
          </>
        )}

        {/* PayApp Lite 모드 */}
        {status === "idle" && !isManual && (
          <>
            <div className="text-6xl font-black text-white mb-4">
              {t("payment.amount", { amount: config.paymentAmount.toLocaleString() })}
            </div>
            <p className="text-gray-400 text-xl mb-12">{t("payment.cardGuide")}</p>
            <div className="flex gap-6 justify-center">
              <button className="service-button nav-button" onClick={requestPayment}>
                {t("payment.pay")}
              </button>
              <button className="service-button nav-button" style={{ background: "rgba(255,255,255,0.1)", color: "#fff" }} onClick={onPrev}>
                {t("common.home")}
              </button>
            </div>
            <button className="text-gray-500 text-sm underline mt-8 block mx-auto" onClick={devBypass}>
              결제완료(개발)
            </button>
          </>
        )}

        {status === "requesting" && (
          <div className="py-8">
            <div className="w-20 h-20 border-4 border-white/20 border-t-blue-500 rounded-full animate-spin mx-auto mb-8" />
            <p className="text-white text-2xl">{t("payment.requesting")}</p>
          </div>
        )}

        {status === "waiting" && (
          <div className="py-8">
            <div className="w-20 h-20 border-4 border-white/20 border-t-green-500 rounded-full animate-spin mx-auto mb-8" />
            <p className="text-white text-2xl mb-4">{t("payment.waiting")}</p>
            <p className="text-gray-400 text-lg mb-8">{t("payment.tapCard")}</p>
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
            <p className="text-green-400 text-2xl font-bold">{t("payment.done")}</p>
          </div>
        )}

        {status === "error" && (
          <>
            <p className="text-red-400 text-xl mb-6">{errorKey ? t(errorKey) : ""}</p>
            <div className="flex gap-4 justify-center">
              {isManual ? (
                <button className="service-button nav-button" onClick={confirmManualPayment}>
                  {t("payment.confirm")}
                </button>
              ) : (
                <button className="service-button nav-button" onClick={requestPayment}>
                  {t("common.retry")}
                </button>
              )}
              <button className="service-button nav-button" style={{ background: "rgba(255,255,255,0.1)", color: "#fff" }} onClick={onPrev}>
                {t("common.home")}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
