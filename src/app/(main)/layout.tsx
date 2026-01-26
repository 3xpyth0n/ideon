import { Sidebar } from "@components/Sidebar";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactNode> {
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
      <Sidebar />
      <main className="main-island">
        {/* Debug: Layout is rendering */}
        {children}
      </main>
    </div>
  );
}
