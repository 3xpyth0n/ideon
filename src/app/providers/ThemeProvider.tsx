"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

type Theme = "light" | "dark";

const ThemeCtx = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: "light",
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const root = document.documentElement;
    const initialTheme = root.getAttribute("data-theme") as Theme | null;

    if (initialTheme) {
      setTheme(initialTheme);
    }

    setTimeout(() => {
      root.removeAttribute("data-no-transition");
    }, 100);
  }, []);

  const handleSetTheme = (t: Theme) => {
    setTheme(t);
    window.localStorage.setItem("theme", t);
    document.documentElement.setAttribute("data-theme", t);
  };

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    root.style.setProperty("color-scheme", theme);
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme: handleSetTheme }), [theme]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}
