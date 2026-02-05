"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Plus, Calendar, Users, Star, Trash2, RotateCcw } from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import { useUser } from "@providers/UserProvider";
import { ProjectModal } from "./ProjectModal";
import { ProjectAccessModal } from "./ProjectAccessModal";
import { getRecentProjects } from "@lib/utils";

import { Button } from "@components/ui/Button";
import { Modal } from "@components/ui/Modal";

interface Project {
  id: string;
  name: string;
  description: string | null;
  updatedAt: string;
  ownerId: string;
  collaboratorCount?: string | number;
  isStarred?: number | boolean; // API returns number (0/1) or boolean
  deletedAt?: string | null;
}

interface ProjectListProps {
  view?: string;
}

export function ProjectList({ view }: ProjectListProps) {
  const { dict } = useI18n();
  const { user: currentUser } = useUser();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [accessProject, setAccessProject] = useState<Project | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      let url = `/api/projects?view=${view || "all"}`;

      if (view === "recent") {
        const ids = getRecentProjects();
        if (ids.length === 0) {
          setProjects([]);
          setLoading(false);
          return;
        }
        url += `&ids=${ids.join(",")}`;
      }

      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        let data = await res.json();

        if (view === "recent") {
          const ids = getRecentProjects();
          const orderMap = new Map(ids.map((id, index) => [id, index]));
          data.sort((a: Project, b: Project) => {
            const indexA = orderMap.get(a.id) ?? Infinity;
            const indexB = orderMap.get(b.id) ?? Infinity;
            return indexA - indexB;
          });
        }

        setProjects(data);
      }
    } catch (_err) {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [view]);

  const toggleStar = async (e: React.MouseEvent, project: Project) => {
    e.preventDefault();
    e.stopPropagation();

    const newIsStarred = !project.isStarred;

    // Optimistic update
    setProjects((prev) => {
      // If we are in 'starred' view and unstarring, remove it immediately
      if (view === "starred" && !newIsStarred) {
        return prev.filter((p) => p.id !== project.id);
      }

      // Otherwise just update the property
      return prev.map((p) =>
        p.id === project.id ? { ...p, isStarred: newIsStarred ? 1 : 0 } : p,
      );
    });

    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isStarred: newIsStarred }),
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        throw new Error("Failed to update star status");
      }
    } catch {
      // Revert on error by re-fetching the true state
      fetchProjects();
    }
  };

  const restoreProject = async (e: React.MouseEvent, project: Project) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        body: JSON.stringify({ deletedAt: null }),
        headers: {
          "Content-Type": "application/json",
        },
      });
      fetchProjects();
    } catch {
      // Silently fail
    }
  };

  const deletePermanently = (e: React.MouseEvent, project: Project) => {
    e.preventDefault();
    e.stopPropagation();
    setProjectToDelete(project);
  };

  const confirmDelete = async () => {
    if (!projectToDelete) return;

    try {
      await fetch(`/api/projects/${projectToDelete.id}?permanent=true`, {
        method: "DELETE",
      });
      fetchProjects();
    } catch {
      // Silently fail
    } finally {
      setProjectToDelete(null);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const getTitle = () => {
    switch (view) {
      case "my-projects":
        return dict.common.myProjects || "My Projects";
      case "shared":
        return dict.common.sharedWithMe || "Shared with Me";
      case "recent":
        return dict.common.recent || "Recent Projects";
      case "starred":
        return dict.common.starred || "Starred Projects";
      case "trash":
        return dict.common.trash || "Trash";
      default:
        return dict.common.overview;
    }
  };

  const getSubtitle = () => {
    switch (view) {
      case "trash":
        return "Manage deleted projects";
      default:
        return dict.common.manageProjects;
    }
  };

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
              <h1 className="zen-title text-2xl mb-0">{getTitle()}</h1>
            </div>
            <p className="zen-subtitle text-sm opacity-40 mb-4">
              {getSubtitle()}
            </p>
          </div>
          {!["trash", "shared", "recent", "starred"].includes(view || "") && (
            <Button onClick={() => setShowCreate(true)} className="btn-primary">
              <div className="flex items-center gap-2">
                <Plus size={14} />
                <span>{dict.common.newProject}</span>
              </div>
            </Button>
          )}
        </header>

        <div className="project-grid">
          {/* Empty State */}
          {projects.length === 0 && (
            <div
              onClick={() =>
                !["trash", "shared", "recent", "starred"].includes(
                  view || "",
                ) && setShowCreate(true)
              }
              className={`project-card flex items-center justify-center cursor-pointer border-dashed border-border/60 hover:border-foreground/40 group ${
                ["trash", "shared", "recent", "starred"].includes(view || "")
                  ? "cursor-default hover:border-border/60"
                  : ""
              }`}
            >
              <div className="flex flex-col items-center gap-3 opacity-40 group-hover:opacity-80 transition-opacity">
                {view === "trash" ? (
                  <Trash2 size={24} strokeWidth={1.5} />
                ) : view === "starred" ? (
                  <Star size={24} strokeWidth={1.5} />
                ) : view === "recent" ? (
                  <RotateCcw size={24} strokeWidth={1.5} />
                ) : view === "shared" ? (
                  <Users size={24} strokeWidth={1.5} />
                ) : (
                  <Plus size={24} strokeWidth={1.5} />
                )}
                <span className="text-2xs font-bold uppercase tracking-[0.2em]">
                  {view === "trash"
                    ? dict.common.emptyTrash || "Trash is empty"
                    : view === "starred"
                      ? dict.common.emptyStarred || "No starred projects"
                      : view === "recent"
                        ? dict.common.emptyRecent || "No recent projects"
                        : view === "shared"
                          ? dict.common.emptyShared || "No shared projects"
                          : dict.common.newProject}
                </span>
              </div>
            </div>
          )}

          {/* Project Cards */}
          {projects.map((project) => (
            <Link
              key={project.id}
              href={view === "trash" ? "#" : `/project/${project.id}`}
              onClick={(e) => view === "trash" && e.preventDefault()}
              className={`project-card group relative overflow-hidden ${
                view === "trash" ? "cursor-default opacity-75" : ""
              }`}
              onContextMenu={(e) => {
                e.preventDefault();
                if (view !== "trash") setEditingProject(project);
              }}
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className="project-card-title mb-0">{project.name}</h3>
                {view !== "trash" && (
                  <button
                    onClick={(e) => toggleStar(e, project)}
                    className={`transition-opacity hover:scale-110 ${
                      project.isStarred
                        ? "opacity-100 text-yellow-400"
                        : "opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-yellow-400"
                    }`}
                  >
                    <Star
                      size={16}
                      fill={project.isStarred ? "currentColor" : "none"}
                    />
                  </button>
                )}
              </div>

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

              {view === "trash" && (
                <div className="absolute inset-0 bg-background/90 backdrop-blur-[1px] flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => restoreProject(e, project)}
                    className="h-8 px-3"
                  >
                    <RotateCcw size={12} className="mr-2" />
                    {dict.common.restore || "Restore"}
                  </Button>
                  <Button
                    size="sm"
                    onClick={(e) => deletePermanently(e, project)}
                    className="h-8 px-3"
                  >
                    <Trash2 size={12} className="mr-2" />
                    {dict.common.delete || "Delete"}
                  </Button>
                </div>
              )}
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

      <Modal
        isOpen={!!projectToDelete}
        onClose={() => setProjectToDelete(null)}
        title={dict.common.deleteProjectTitle || "Delete Project?"}
        className="max-w-md"
      >
        <div className="p-6 pt-2">
          <p className="text-sm text-muted-foreground mb-6">
            {dict.common.deleteProjectDescription ||
              "Are you sure you want to delete this project? This action is irreversible."}
          </p>
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setProjectToDelete(null)}
              className="hover:underline"
            >
              {dict.common.cancel || "Cancel"}
            </Button>
            <Button variant="danger" onClick={confirmDelete}>
              {dict.common.delete || "Delete"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
