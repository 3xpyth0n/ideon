"use client";
import { useState } from "react";
import { useI18n } from "@providers/I18nProvider";
import { ChevronDown, Languages } from "lucide-react";

export function LanguageSelect() {
  const { lang, setLang, availableLanguages } = useI18n();
  const [open, setOpen] = useState(false);
  const current =
    availableLanguages.find((o) => o.code === lang) || availableLanguages[0];

  return (
    <div className="lang-select-container">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`lang-select-trigger ${open ? "open" : ""}`}
      >
        <Languages size={16} />
        {current?.label || lang}
        <ChevronDown size={14} className="chevron" />
      </button>

      {open && (
        <>
          <div className="fixed-overlay" onClick={() => setOpen(false)} />
          <div className="lang-select-dropdown">
            {availableLanguages.map((o) => (
              <button
                key={o.code}
                onClick={() => {
                  setLang(o.code);
                  setOpen(false);
                }}
                className={`lang-select-option ${
                  o.code === lang ? "active" : ""
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
