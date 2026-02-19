"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { addRecentProject } from "@lib/utils";

const ProjectCanvas = dynamic(
  () => import("@components/project/ProjectCanvas"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center w-full h-full bg-page">
        <div className="text-sm opacity-60">Loading canvas...</div>
      </div>
    ),
  },
);

interface ProjectClientProps {
  id: string;
}

export default function ProjectClient({ id }: ProjectClientProps) {
  const router = useRouter();

  useEffect(() => {
    if (!id || id === "undefined") {
      router.push("/home");
    } else {
      addRecentProject(id);
      // Track server-side last opened
      fetch(`/api/projects/${id}/open`, { method: "POST" }).catch(
        console.error,
      );
    }
  }, [id, router]);

  if (!id || id === "undefined") {
    return null;
  }

  return (
    <main className="relative w-full h-screen overflow-hidden">
      <ProjectCanvas initialProjectId={id} />
    </main>
  );
}
