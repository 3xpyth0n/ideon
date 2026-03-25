import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        "bg-page": "var(--bg-page)",
        "bg-sidebar": "var(--bg-sidebar)",
        "bg-island": "var(--bg-island)",
        "text-main": "var(--text-main)",
        "text-muted": "var(--text-muted)",
        border: "var(--border)",
        accent: "var(--accent)",
        warning: "var(--warning)",
        danger: "var(--danger)",
        "toast-bg": "var(--toast-bg)",
      },
      fontFamily: {
        branding: ["var(--font-branding)"],
        sans: ["var(--font-sans)"],
      },
      borderColor: {
        DEFAULT: "var(--border)",
      },
    },
  },
  plugins: [],
};
export default config;
