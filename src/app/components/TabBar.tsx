"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Project {
  id: string;
  name: string;
}

interface TabBarProps {
  folderId: string;
  currentProjectId: string | undefined;
}

export function TabBar({ folderId, currentProjectId }: TabBarProps) {
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    fetch(`/api/projects?folderId=${folderId}`)
      .then((r) => r.json())
      .then((data: Project[]) => setProjects(data))
      .catch(() => {});
  }, [folderId]);

  if (projects.length === 0) return null;

  return (
    <div className="tab-bar-outer">
      {projects.map((project) => (
        <Link
          key={project.id}
          href={`/project/${project.id}?folderId=${folderId}`}
          className={`tab-item${
            currentProjectId === project.id ? " active" : ""
          }`}
          title={project.name}
        >
          {project.name}
        </Link>
      ))}
    </div>
  );
}
