import { Sidebar } from "@components/Sidebar";
import { TabBarWrapper } from "@components/TabBarWrapper";
import { promises as fs } from "fs";
import path from "path";
import { cookies } from "next/headers";
import { getAuthUser } from "@auth";
import { Suspense } from "react";

async function getVersion() {
  try {
    const pkg = await fs.readFile(
      path.join(process.cwd(), "package.json"),
      "utf-8",
    );
    return JSON.parse(pkg).version;
  } catch {
    return "0.0.0";
  }
}

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactNode> {
  const version = await getVersion();
  const cookieStore = await cookies();
  const sidebarCollapsed =
    cookieStore.get("sidebarCollapsed")?.value === "true";
  const user = await getAuthUser();

  return (
    <div className="app-container">
      <div className="bg-logo-container">
        <img
          src="/light-icon.png"
          alt=""
          className="bg-logo light"
          aria-hidden="true"
        />
        <img
          src="/dark-icon.png"
          alt=""
          className="bg-logo dark"
          aria-hidden="true"
        />
      </div>
      <Sidebar
        currentVersion={version}
        initialCollapsed={sidebarCollapsed}
        userRole={user?.role}
      />
      <div className="main-column" id="main-column-container">
        <Suspense fallback={null}>
          <TabBarWrapper />
        </Suspense>
        <main className="main-island" id="app-main-container">
          {children}
        </main>
      </div>
    </div>
  );
}
