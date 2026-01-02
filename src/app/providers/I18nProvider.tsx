"use client";
import { createContext, useContext, useMemo, useState, useEffect } from "react";
import en from "@i18n/en.json";
import fr from "@i18n/fr.json";

type Dict = typeof en;

const I18nCtx = createContext<{
  dict: Dict;
  lang: string;
  setLang: (l: string) => void;
}>({
  dict: en,
  lang: "en",
  setLang: () => {},
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState("en");

  useEffect(() => {
    const saved = document.cookie
      .split("; ")
      .find((row) => row.startsWith("ideonLang="))
      ?.split("=")[1];
    if (saved && (saved === "en" || saved === "fr")) {
      setLangState(saved);
    }
  }, []);

  const setLang = (l: string) => {
    setLangState(l);
    document.cookie = `ideonLang=${l}; path=/; max-age=31536000`;
  };

  const dict = lang === "fr" ? fr : en;
  const value = useMemo(() => ({ dict, lang, setLang }), [dict, lang]);
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useI18n() {
  return useContext(I18nCtx);
}
