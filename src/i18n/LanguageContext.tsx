"use client";

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";
import { translate, type Locale, type MessageKey } from "./translations";

interface LanguageContextValue {
  lang: Locale;
  setLang: (lang: Locale) => void;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: "ko",
  setLang: () => {},
  t: (key, params) => translate("ko", key, params),
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Locale>("ko");

  const t = useCallback(
    (key: MessageKey, params?: Record<string, string | number>) => translate(lang, key, params),
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
