"use client";

import { useState, useEffect, useRef } from "react";
import type { DeviceConfig } from "@/types";
import { useLanguage } from "@/i18n/LanguageContext";
import { LOCALES, type MessageKey } from "@/i18n/translations";

export function PaymentSection({
  config,
  orderId,
  setOrderId,
  printQuantity,
  setPrintQuantity,
  onNext,
  onPrev,
}: {
  config: DeviceConfig;
  orderId: string | null;
  setOrderId: (id: string | null) => void;
  printQuantity: number;
  setPrintQuantity: (n: number) => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  const { lang, setLang, t } = useLanguage();
  const [status, setStatus] = useState<"idle" | "requesting" | "waiting" | "completed" | "error">(
    orderId ? "waiting" : "idle"
  );
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isManual = config.paymentTerminalMode === "manual";
  const tiers = config.paymentTiers.length > 0 ? config.paymentTiers : [{ qty: 1, price: config.paymentAmount }];

  // 선택 티어: 세션 복원값(printQuantity)의 매수가 티어에 있으면 유지, 아니면 첫 티어.
  const [selectedQty, setSelectedQty] = useState<number>(
    tiers.some((t) => t.qty === printQuantity) ? printQuantity : tiers[0].qty
  );
  const selectedTier = tiers.find((t) => t.qty === selectedQty) ?? tiers[0];
  const totalAmount = selectedTier.price;

  const selectQty = (qty: number) => {
    setSelectedQty(qty);
    setPrintQuantity(qty); // 인화 단계에서 쓰도록 즉시 flow에 저장
  };

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
        const res = await fetch(`/api/payments/status/${oid}/`);
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
    setPrintQuantity(selectedQty);
    setStatus("requesting");
    setErrorKey(null);
    try {
      const res = await fetch("/api/payments/request/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: config.deviceId, amount: totalAmount }),
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
    setPrintQuantity(selectedQty);
    setStatus("completed");
    setTimeout(onNext, 800);
  };

  const devBypass = () => {
    setPrintQuantity(selectedQty);
    setStatus("completed");
    setTimeout(onNext, 500);
  };

  // 결제하기: 수동 모드면 확인, PayApp 모드면 결제 요청.
  const handlePay = () => {
    if (isManual) confirmManualPayment();
    else requestPayment();
  };

  const fmt = (n: number) => n.toLocaleString();

  return (
    <section className="w-full h-full flex flex-col items-center justify-center relative z-10 px-8">
      {status === "idle" ? (
        <div className="w-full max-w-5xl flex flex-col items-center animate-fadeInUp">
          <h2 className="text-4xl font-extrabold text-white mb-8" style={{ textShadow: "0 2px 15px rgba(0,0,0,0.5)" }}>
            {t("payment.selectQuantity")}
          </h2>

          {/* 언어 선택 */}
          <div className="flex gap-3 mb-10">
            {LOCALES.map(({ code, label }) => (
              <button
                key={code}
                className={`px-6 py-3 rounded-full text-base font-semibold transition-all ${
                  lang === code
                    ? "bg-white text-gray-900 shadow-lg"
                    : "bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
                }`}
                onClick={() => setLang(code)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* 매수/가격 티어 카드 */}
          <div className="flex gap-6 justify-center flex-wrap mb-12">
            {tiers.map((tier) => {
              const selected = tier.qty === selectedQty;
              return (
                <button
                  key={tier.qty}
                  onClick={() => selectQty(tier.qty)}
                  className={`w-56 h-56 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all duration-200 border-2 ${
                    selected
                      ? "bg-white border-white scale-[1.04] shadow-2xl"
                      : "border-white/20 hover:border-white/40"
                  }`}
                  style={selected ? {} : { background: "var(--theme-primary, #6c6fb4)" }}
                >
                  <span className={`text-5xl font-extrabold ${selected ? "text-[#4a4e8c]" : "text-white"}`}>
                    {t("payment.sheets", { count: String(tier.qty) })}
                  </span>
                  <span className={`text-2xl font-bold ${selected ? "text-[#4a4e8c]" : "text-white/90"}`}>
                    {t("payment.amount", { amount: fmt(tier.price) })}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 하단: 이전 / 총액 / 결제하기 */}
          <div className="w-full flex items-center justify-between">
            <button
              className="service-button nav-button"
              style={{ background: "rgba(255,255,255,0.1)", color: "#fff" }}
              onClick={onPrev}
            >
              {t("common.prev")}
            </button>

            <div className="text-center">
              <div className="text-5xl font-black text-white leading-none">
                {t("payment.amount", { amount: fmt(totalAmount) })}
              </div>
            </div>

            <button className="service-button nav-button" onClick={handlePay}>
              {t("payment.pay")}
            </button>
          </div>

          {!isManual && (
            <button className="text-gray-500 text-sm underline mt-6" onClick={devBypass}>
              결제완료(개발)
            </button>
          )}
        </div>
      ) : (
        <div className="bg-black/30 backdrop-blur-sm p-16 rounded-3xl border border-white/10 text-center animate-fadeInUp min-w-[500px]">
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
              <p className="text-gray-400 text-lg mb-2">{t("payment.tapCard")}</p>
              <p className="text-white/70 text-lg mb-8">
                {t("payment.sheets", { count: String(selectedQty) })} · {t("payment.amount", { amount: fmt(totalAmount) })}
              </p>
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
      )}
    </section>
  );
}
