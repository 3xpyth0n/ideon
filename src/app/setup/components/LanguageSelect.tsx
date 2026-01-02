"use client";
import { useState } from "react";
import { useI18n } from "@providers/I18nProvider";
import { ChevronDown, Languages } from "lucide-react";

const options = [
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
];

export function LanguageSelect() {
  const { lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === lang) || options[0];

  return (
    <div className="lang-select-container">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`lang-select-trigger ${open ? "open" : ""}`}
      >
        <Languages size={16} />
        {current.label}
        <ChevronDown size={14} className="chevron" />
      </button>

      {open && (
        <>
          <div className="fixed-overlay" onClick={() => setOpen(false)} />
          <div className="lang-select-dropdown">
            {options.map((o) => (
              <button
                key={o.value}
                onClick={() => {
                  setLang(o.value);
                  setOpen(false);
                }}
                className={`lang-select-option ${
                  o.value === lang ? "active" : ""
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
