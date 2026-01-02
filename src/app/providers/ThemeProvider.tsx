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

    // Une fois que React est hydraté, on peut autoriser les transitions
    // mais on attend un petit peu pour être sûr que le premier rendu est fini
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
    // On utilise setProperty pour éviter les violations CSP style-src 'self'
    // car modifier .style.colorScheme directement est parfois considéré comme du style inline
    root.style.setProperty("color-scheme", theme);
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme: handleSetTheme }), [theme]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}
