"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Plus, Calendar, Users } from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import { useUser } from "@providers/UserProvider";
import { ProjectModal } from "./ProjectModal";
import { ProjectAccessModal } from "./ProjectAccessModal";

import { Button } from "@components/ui/Button";

interface Project {
  id: string;
  name: string;
  description: string | null;
  updatedAt: string;
  ownerId: string;
  collaboratorCount?: string | number;
}

export function ProjectList() {
  const { dict } = useI18n();
  const { user: currentUser } = useUser();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [accessProject, setAccessProject] = useState<Project | null>(null);

  // Removed redundant fetchUser, using UserProvider instead

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (_err) {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted animate-pulse uppercase tracking-widest text-xs font-bold">
          {dict.common.loading}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="zen-container max-w-5xl py-12 animate-in fade-in duration-700">
        <header className="flex justify-between items-center mb-16">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="zen-title text-2xl mb-0">
                {dict.common.overview}
              </h1>
            </div>
            <p className="zen-subtitle text-sm opacity-40 mb-4">
              {dict.common.manageProjects}
            </p>
          </div>
          <Button onClick={() => setShowCreate(true)} className="btn-primary">
            <div className="flex items-center gap-2">
              <Plus size={14} />
              <span>{dict.common.newProject}</span>
            </div>
          </Button>
        </header>

        <div className="project-grid">
          {/* Empty State */}
          {projects.length === 0 && (
            <div
              onClick={() => setShowCreate(true)}
              className="project-card flex items-center justify-center cursor-pointer border-dashed border-border/60 hover:border-foreground/40 group"
            >
              <div className="flex flex-col items-center gap-3 opacity-40 group-hover:opacity-80 transition-opacity">
                <Plus size={24} strokeWidth={1.5} />
                <span className="text-2xs font-bold uppercase tracking-[0.2em]">
                  {dict.common.newProject}
                </span>
              </div>
            </div>
          )}

          {/* Project Cards */}
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/project/${project.id}`}
              className="project-card group"
              onContextMenu={(e) => {
                e.preventDefault();
                setEditingProject(project);
              }}
            >
              <h3 className="project-card-title">{project.name}</h3>

              <p className="project-card-desc">
                {project.description || dict.common.noDescription}
              </p>

              <div className="project-card-footer !grid grid-cols-3 w-full items-center">
                <div className="project-card-tag justify-self-start">
                  <Calendar size={10} strokeWidth={3} />
                  <span>
                    {project.updatedAt
                      ? new Date(project.updatedAt).toLocaleDateString(
                          "fr-FR",
                          {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          },
                        )
                      : "—"}
                  </span>
                </div>

                <div className="flex justify-self-center">
                  <span
                    className={`text-[8px] font-black uppercase tracking-[0.2em] px-2 py-0.5 border ${
                      project.ownerId === currentUser?.id
                        ? "border-white/10 bg-white/5 text-white/60"
                        : "border-accent/20 bg-accent/5 text-accent/60"
                    }`}
                  >
                    {project.ownerId === currentUser?.id
                      ? dict.common.statusMine
                      : dict.common.statusShared}
                  </span>
                </div>

                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setAccessProject(project);
                  }}
                  className="project-card-tag hover:bg-white/10 transition-colors justify-self-end group/users"
                >
                  <Users
                    size={10}
                    strokeWidth={3}
                    className="group-hover/users:text-accent transition-colors"
                  />
                  <span className="group-hover/users:text-accent transition-colors">
                    Users: {Number(project.collaboratorCount) || 1}
                  </span>
                </button>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {showCreate && (
        <ProjectModal
          onClose={() => setShowCreate(false)}
          onSuccess={fetchProjects}
        />
      )}

      {editingProject && (
        <ProjectModal
          project={editingProject}
          onClose={() => setEditingProject(null)}
          onSuccess={fetchProjects}
        />
      )}

      {accessProject && (
        <ProjectAccessModal
          projectId={accessProject.id}
          projectName={accessProject.name}
          onClose={() => setAccessProject(null)}
          onUpdate={fetchProjects}
        />
      )}
    </>
  );
}
