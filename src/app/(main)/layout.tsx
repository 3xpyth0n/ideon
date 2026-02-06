import { Sidebar } from "@components/Sidebar";
import { promises as fs } from "fs";
import path from "path";

async function getVersion() {
  try {
    const pkg = await fs.readFile(
      path.join(process.cwd(), "package.json"),
      "utf-8",
    );
    return JSON.parse(pkg).version;
  } catch (_e) {
    return "0.0.0";
  }
}

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactNode> {
  const version = await getVersion();

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
      <Sidebar currentVersion={version} />
      <main className="main-island">
        {/* Debug: Layout is rendering */}
        {children}
      </main>
    </div>
  );
}
