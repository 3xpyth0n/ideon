"use client";
import { createContext, useContext, useMemo, useState, useEffect } from "react";
import en from "@i18n/en.json";

export type Dict = typeof en;

export type Language = {
  code: string;
  label: string;
};

const I18nCtx = createContext<{
  dict: Dict;
  lang: string;
  setLang: (l: string) => void;
  availableLanguages: Language[];
}>({
  dict: en,
  lang: "en",
  setLang: () => {},
  availableLanguages: [{ code: "en", label: "English" }],
});

export function I18nProvider({
  children,
  dictionaries,
  initialLang = "en",
}: {
  children: React.ReactNode;
  dictionaries: Record<string, Dict>;
  initialLang?: string;
}) {
  const [lang, setLangState] = useState(initialLang);

  const availableLanguages = useMemo(() => {
    return Object.keys(dictionaries).map((code) => ({
      code,
      label: dictionaries[code].__label || code,
    }));
  }, [dictionaries]);

  useEffect(() => {
    const saved = document.cookie
      .split("; ")
      .find((row) => row.startsWith("ideonLang="))
      ?.split("=")[1];
    if (saved && dictionaries[saved]) {
      setLangState(saved);
    }
  }, [dictionaries]);

  const setLang = (l: string) => {
    if (!dictionaries[l]) return;
    setLangState(l);
    document.cookie = `ideonLang=${l}; path=/; max-age=31536000`;
  };

  const dict = dictionaries[lang] || dictionaries["en"];
  const value = useMemo(
    () => ({ dict, lang, setLang, availableLanguages }),
    [dict, lang, availableLanguages],
  );
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useI18n() {
  return useContext(I18nCtx);
}
