import "./global.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/forms.css";
import "./styles/editor.css";
import "./styles/animations.css";
import { I18nProvider } from "@providers/I18nProvider";
import { ThemeProvider } from "@providers/ThemeProvider";
import { UserProvider } from "@providers/UserProvider";
import { ConfigProvider } from "@providers/ConfigProvider";
import { TouchProvider } from "@providers/TouchProvider";
import { Toaster } from "sonner";
import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { loadDictionaries } from "@i18n/loader";

import { runMigrations } from "@lib/migrations";
import { isSystemInstalled } from "@lib/db";

const APP_NAME = "Ideon";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f5" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const lang = cookieStore.get("ideonLang")?.value || "en";
  const dictionaries = await loadDictionaries();
  const dict = dictionaries[lang] || dictionaries["en"];

  return {
    title: {
      template: `${APP_NAME} - %s`,
      default: APP_NAME,
    },
    description: dict.subtitle,
    manifest: "/site.webmanifest",
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "any" },
        { url: "/favicon.svg", type: "image/svg+xml" },
        { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      ],
      apple: [
        { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      ],
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: APP_NAME,
    },
  };
}

let migrationPromise: Promise<unknown> | null = null;

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  if (!migrationPromise) {
    migrationPromise = runMigrations();
  }
  await migrationPromise;

  const cookieStore = await cookies();
  const lang = cookieStore.get("ideonLang")?.value || "en";
  const sidebarCollapsed =
    cookieStore.get("sidebarCollapsed")?.value === "true";
  const headerList = await headers();
  const nonce = headerList.get("x-nonce") || undefined;
  const pathname = headerList.get("x-pathname") || "/";

  // System installation check (Server-side)
  const isSetupComplete = await isSystemInstalled();

  // Redirect logic based on installation status
  // We skip API routes and internal Next.js paths
  if (
    !pathname.startsWith("/api") &&
    !pathname.startsWith("/_next") &&
    !pathname.includes(".")
  ) {
    if (!isSetupComplete && !pathname.startsWith("/setup")) {
      redirect("/setup");
    }
    if (isSetupComplete && pathname.startsWith("/setup")) {
      redirect("/home");
    }
  }

  const dictionaries = await loadDictionaries();

  return (
    <html
      lang={lang}
      suppressHydrationWarning
      data-sidebar-collapsed={sidebarCollapsed ? "true" : undefined}
    >
      <head>
        <script src="/init-theme.js" nonce={nonce} suppressHydrationWarning />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />
        {nonce && <meta property="csp-nonce" content={nonce} />}
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider>
          <I18nProvider dictionaries={dictionaries} initialLang={lang}>
            <ConfigProvider isSetupComplete={isSetupComplete}>
              <UserProvider>
                <TouchProvider>{children}</TouchProvider>
                <Toaster
                  position="top-right"
                  expand={false}
                  richColors={false}
                  duration={3000}
                  toastOptions={{
                    className: "toast-style",
                  }}
                />
              </UserProvider>
            </ConfigProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
