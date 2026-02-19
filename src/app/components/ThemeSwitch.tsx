"use client";

import { useTheme } from "@providers/ThemeProvider";
import { useI18n } from "@providers/I18nProvider";
import { Sun, Moon } from "lucide-react";

export function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  const { dict } = useI18n();

  return (
    <div className="theme-toggle pointer-events-auto">
      <button
        onClick={() => setTheme("light")}
        className={`theme-btn ${theme === "light" ? "active" : ""}`}
        title={dict.layout.lightMode}
      >
        <Sun size={16} />
      </button>
      <button
        onClick={() => setTheme("dark")}
        className={`theme-btn ${theme === "dark" ? "active" : ""}`}
        title={dict.layout.darkMode}
      >
        <Moon size={16} />
      </button>
    </div>
  );
}
