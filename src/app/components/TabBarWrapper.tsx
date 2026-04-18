"use client";

import { useSearchParams, usePathname } from "next/navigation";
import { TabBar } from "./TabBar";

export function TabBarWrapper() {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const folderId = searchParams.get("folderId");
  const projectMatch = pathname.match(/^\/project\/([^/]+)/);
  const currentProjectId = projectMatch?.[1];

  if (!folderId) return null;

  return <TabBar folderId={folderId} currentProjectId={currentProjectId} />;
}
