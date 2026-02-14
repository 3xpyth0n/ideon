"use client";
import { useTheme } from "@providers/ThemeProvider";
import { useI18n } from "@providers/I18nProvider";

export function ThemeToggle() {
  const { dict } = useI18n();
  const { theme, setTheme } = useTheme();
  return (
    <button
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      aria-label={dict.layout.toggleTheme}
    >
      {theme === "light" ? dict.layout.darkMode : dict.layout.lightMode}
    </button>
  );
}
