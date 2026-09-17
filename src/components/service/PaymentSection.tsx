"use client";

import { useState, useEffect, useRef } from "react";
import type { DeviceConfig } from "@/types";
import { useLanguage } from "@/i18n/LanguageContext";
import { LOCALES, type MessageKey } from "@/i18n/translations";
import { getServiceSectionClass, SERVICE_BIG_BUTTON_CLASS } from "./sectionLayout";
import { SectionTitle } from "./SectionShell";

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
  // 영문 타이틀만 2줄("Please complete\n your payment")이라 가로 화면에서 카드가 결제 버튼과 겹친다.
  // 영어일 때만 카드 높이를 낮춰 겹침을 없앤다(세로 화면은 portrait:h-auto라 영향 없음).
  const tierHeightClass = lang === "en" ? "h-[21rem]" : "h-[26rem]";
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
    <section className={`${getServiceSectionClass(lang)} grid-rows-[auto_1fr] px-16`}>
      {status === "idle" ? (
        <>
          <SectionTitle className="text-center whitespace-pre-line">
            {t("payment.selectQuantity")}
          </SectionTitle>

          <div className="min-h-0 w-full flex flex-col items-center justify-start pt-16 portrait:pt-14 portrait:pb-28">
          <div className="w-full max-w-[1700px] flex flex-col items-center animate-fadeInUp portrait:flex-1 portrait:min-h-0">
          {/* 언어 선택 — 시작 화면(StartSection)과 동일한 불투명 스타일.
              배경화면(밝은 이미지일 수 있음) 위에서도 읽히도록 비선택 버튼을 불투명 단색 배경 +
              인라인 흰 글자로 칠하고, 선택 버튼은 테두리를 강조(primary) 색상으로 준다. */}
          <div className="flex gap-5 portrait:gap-6 mb-12 portrait:mb-10 flex-wrap justify-center">
            {LOCALES.map(({ code, label }) => (
              <button
                key={code}
                className={`px-[5.25rem] py-9 portrait:px-8 portrait:py-8 rounded-2xl text-[3.375rem] portrait:text-5xl font-semibold transition-colors shadow-lg border-4 ${
                  lang === code
                    ? "bg-white text-gray-900"
                    : "bg-[#3f3f46] border-[#8a8a95] hover:bg-[#52525b]"
                }`}
                style={lang === code ? { borderColor: "var(--theme-primary, var(--color-brand))" } : { color: "#ffffff" }}
                onClick={() => setLang(code)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* 매수/가격 티어 카드 — 세로에선 전체폭 세로 스택 */}
          <div className="flex gap-10 portrait:gap-6 justify-center flex-wrap mb-12 portrait:mb-0 portrait:flex-col portrait:flex-nowrap portrait:w-full portrait:items-stretch portrait:flex-1 portrait:min-h-0">
            {tiers.map((tier) => {
              const selected = tier.qty === selectedQty;
              return (
                <button
                  key={tier.qty}
                  onClick={() => selectQty(tier.qty)}
                  className={`w-[32rem] ${tierHeightClass} portrait:w-full portrait:h-auto portrait:flex-1 portrait:min-h-0 rounded-2xl flex flex-col items-center justify-center gap-3 portrait:gap-5 transition-all duration-200 border-2 ${
                    selected
                      ? "border-transparent scale-[1.04] shadow-2xl"
                      : "bg-white border-black/10 hover:border-black/20"
                  }`}
                  style={selected ? { background: "var(--theme-primary, #6c6fb4)" } : {}}
                >
                  <span className={`text-8xl portrait:text-8xl font-extrabold ${selected ? "text-white" : "text-[#4a4e8c]"}`}>
                    {t("payment.sheets", { count: String(tier.qty) })}
                  </span>
                  <span className={`text-5xl portrait:text-6xl font-bold ${selected ? "text-white/90" : "text-[#4a4e8c]"}`}>
                    {t("payment.amount", { amount: fmt(tier.price) })}
                  </span>
                </button>
              );
            })}
          </div>

          {!isManual && (
            <button className="text-gray-500 text-sm underline mt-6" onClick={devBypass}>
              결제완료(개발)
            </button>
          )}
          </div>
          </div>

          {/* 하단 고정 바 — 결제하기 버튼만 중앙에 배치(총액·이전 버튼 제거). */}
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 flex items-center justify-center">
            <button className={`service-button nav-next-lg btn-role-payment ${SERVICE_BIG_BUTTON_CLASS}`} onClick={handlePay}>
              {t("payment.pay")}
            </button>
          </div>
        </>
      ) : (
        <div className="bg-black/30 backdrop-blur-sm p-16 rounded-3xl border border-white/10 text-center animate-fadeInUp min-w-[500px] place-self-center" style={{ gridRow: "1 / -1" }}>
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
              <p className="text-gray-400 text-lg mb-2 whitespace-pre-line">{t("payment.tapCard")}</p>
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
