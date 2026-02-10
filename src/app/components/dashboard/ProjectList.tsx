"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Calendar,
  Users,
  Star,
  Trash2,
  RotateCcw,
  Edit2,
  Folder as FolderIcon,
  Home,
  ChevronRight,
} from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import { useUser } from "@providers/UserProvider";
import { ProjectModal } from "./ProjectModal";
import { ProjectAccessModal } from "./ProjectAccessModal";
import { FolderAccessModal } from "./FolderAccessModal";
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
  isStarred?: number | boolean;
  deletedAt?: string | null;
  folderId?: string | null;
}

interface Folder {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  projectCount?: number | string;
  collaboratorCount?: number | string;
  isStarred?: number | boolean;
  deletedAt?: string | null;
}

interface ProjectListProps {
  view?: string;
  folderId?: string;
}

export function ProjectList({ view, folderId }: ProjectListProps) {
  const { dict } = useI18n();
  const { user: currentUser } = useUser();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [currentFolder, setCurrentFolder] = useState<Folder | null>(null);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);

  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renamingName, setRenamingName] = useState("");

  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(
    null,
  );
  const [renamingProjectName, setRenamingProjectName] = useState("");
  const [renamingProjectDescription, setRenamingProjectDescription] =
    useState("");

  const [accessProject, setAccessProject] = useState<Project | null>(null);
  const [accessFolder, setAccessFolder] = useState<Folder | null>(null);

  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<Folder | null>(null);

  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [dragOverBreadcrumb, setDragOverBreadcrumb] = useState<string | null>(
    null,
  );
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    folder?: Folder;
    project?: Project;
  } | null>(null);

  // Close context menu on click elsewhere
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      // Reset state immediately to avoid stale data flash
      setProjects([]);
      setFolders([]);
      setCurrentFolder(null);

      // Prepare fetch promises
      let projectUrl = `/api/projects?view=${view || "all"}`;
      if (folderId) {
        projectUrl += `&folderId=${folderId}`;
      } else if (view === "recent") {
        const ids = getRecentProjects();
        if (ids.length > 0) {
          projectUrl += `&ids=${ids.join(",")}`;
        }
      }

      const projectsPromise = fetch(projectUrl, { cache: "no-store" }).then(
        (res) => (res.ok ? res.json() : []),
      );

      const foldersPromise =
        !folderId &&
        (!view ||
          view === "all" ||
          view === "my-projects" ||
          view === "starred" ||
          view === "trash" ||
          view === "shared")
          ? fetch(`/api/folders?view=${view || "all"}`, {
              cache: "no-store",
            }).then((res) => (res.ok ? res.json() : []))
          : Promise.resolve([]);

      const currentFolderPromise = folderId
        ? fetch(`/api/folders/${folderId}`, { cache: "no-store" }).then(
            (res) => (res.ok ? res.json() : null),
          )
        : Promise.resolve(null);

      // Execute in parallel
      const [projectsData, foldersData, currentFolderData] = await Promise.all([
        projectsPromise,
        foldersPromise,
        currentFolderPromise,
      ]);

      // Process Projects
      if (view === "recent") {
        const ids = getRecentProjects();
        const orderMap = new Map(ids.map((id, index) => [id, index]));
        (projectsData as Project[]).sort((a: Project, b: Project) => {
          const indexA = orderMap.get(a.id) ?? Infinity;
          const indexB = orderMap.get(b.id) ?? Infinity;
          return indexA - indexB;
        });
      }
      setProjects(projectsData);

      // Process Folders
      setFolders(foldersData);

      // Process Current Folder
      setCurrentFolder(currentFolderData);
    } catch (_err) {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [view, folderId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleStar = async (e: React.MouseEvent, project: Project) => {
    e.preventDefault();
    e.stopPropagation();

    const newIsStarred = !project.isStarred;

    setProjects((prev) => {
      if (view === "starred" && !newIsStarred) {
        return prev.filter((p) => p.id !== project.id);
      }
      return prev.map((p) =>
        p.id === project.id ? { ...p, isStarred: newIsStarred ? 1 : 0 } : p,
      );
    });

    try {
      await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isStarred: newIsStarred }),
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      fetchData();
    }
  };

  const toggleFolderStar = async (e: React.MouseEvent, folder: Folder) => {
    e.preventDefault();
    e.stopPropagation();

    const newIsStarred = !folder.isStarred;

    setFolders((prev) => {
      // If we are in "starred" view and we unstar, we should remove it from view
      if (view === "starred" && !newIsStarred) {
        return prev.filter((f) => f.id !== folder.id);
      }
      return prev.map((f) =>
        f.id === folder.id ? { ...f, isStarred: newIsStarred ? 1 : 0 } : f,
      );
    });

    try {
      await fetch(`/api/folders/${folder.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isStarred: newIsStarred }),
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      fetchData();
    }
  };

  const restoreProject = async (e: React.MouseEvent, project: Project) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        body: JSON.stringify({ deletedAt: null }),
        headers: { "Content-Type": "application/json" },
      });
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const deletePermanently = (e: React.MouseEvent, project: Project) => {
    e.preventDefault();
    e.stopPropagation();
    setProjectToDelete(project);
  };

  const restoreFolder = async (e: React.MouseEvent, folder: Folder) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await fetch(`/api/folders/${folder.id}`, {
        method: "PATCH",
        body: JSON.stringify({ deletedAt: null }),
        headers: { "Content-Type": "application/json" },
      });
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const deleteFolderPermanently = (e: React.MouseEvent, folder: Folder) => {
    e.preventDefault();
    e.stopPropagation();
    setFolderToDelete(folder);
  };

  const confirmDeleteProject = async () => {
    if (!projectToDelete) return;
    try {
      await fetch(`/api/projects/${projectToDelete.id}?permanent=true`, {
        method: "DELETE",
      });
      fetchData();
    } catch (e) {
      console.error(e);
    } finally {
      setProjectToDelete(null);
    }
  };

  const confirmDeleteFolder = async () => {
    if (!folderToDelete) return;
    try {
      const isTrashView = view === "trash";
      await fetch(
        `/api/folders/${folderToDelete.id}${
          isTrashView ? "?permanent=true" : ""
        }`,
        {
          method: "DELETE",
        },
      );
      fetchData();
    } catch (e) {
      console.error(e);
    } finally {
      setFolderToDelete(null);
    }
  };

  const handleCreateFolder = async () => {
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        body: JSON.stringify({ name: "New Folder" }),
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const newFolder = await res.json();
        setFolders((prev) => [newFolder, ...prev]);
        setRenamingFolderId(newFolder.id);
        setRenamingName(newFolder.name);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRenameFolder = async () => {
    if (!renamingFolderId) return;
    const folder = folders.find((f) => f.id === renamingFolderId);
    if (!folder) return;

    const newName = renamingName.trim() || folder.name;

    try {
      if (newName !== folder.name) {
        await fetch(`/api/folders/${folder.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: newName }),
          headers: { "Content-Type": "application/json" },
        });
        setFolders((prev) =>
          prev.map((f) => (f.id === folder.id ? { ...f, name: newName } : f)),
        );
      }
    } catch (e) {
      console.error(e);
    } finally {
      setRenamingFolderId(null);
      setRenamingName("");
    }
  };

  const handleRenameProject = async () => {
    if (!renamingProjectId) return;
    const project = projects.find((p) => p.id === renamingProjectId);
    if (!project) return;

    const newName = renamingProjectName.trim() || project.name;
    const newDesc = renamingProjectDescription.trim();

    if (newName === project.name && newDesc === (project.description || "")) {
      setRenamingProjectId(null);
      return;
    }

    try {
      await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: newName, description: newDesc }),
        headers: { "Content-Type": "application/json" },
      });
      setProjects((prev) =>
        prev.map((p) =>
          p.id === project.id
            ? { ...p, name: newName, description: newDesc }
            : p,
        ),
      );
    } catch (e) {
      console.error(e);
      fetchData();
    } finally {
      setRenamingProjectId(null);
      setRenamingProjectName("");
      setRenamingProjectDescription("");
    }
  };

  const handleInputBlur = (e: React.FocusEvent) => {
    // If moving focus to another edit input, don't save/close yet
    if (
      e.relatedTarget &&
      (e.relatedTarget as HTMLElement).classList.contains(
        "js-project-edit-input",
      )
    ) {
      return;
    }
    handleRenameProject();
  };

  const handleDragStart = (e: React.DragEvent, projectId: string) => {
    e.dataTransfer.setData("projectId", projectId);
    e.dataTransfer.effectAllowed = "move";

    // Create a custom drag image to fix transparency issues
    const target = e.currentTarget as HTMLElement;
    const clone = target.cloneNode(true) as HTMLElement;

    // Set styles to ensure visibility
    clone.style.position = "absolute";
    clone.style.top = "-9999px";
    clone.style.left = "-9999px";
    clone.style.width = `${target.offsetWidth}px`;
    clone.style.height = `${target.offsetHeight}px`;
    clone.style.opacity = "1"; // Browser adds its own transparency (usually ~50%), so we start with 100%
    clone.style.backgroundColor = "var(--bg-island)"; // Solid background
    clone.style.zIndex = "9999";
    clone.style.border = "1px solid var(--border)";
    clone.style.borderRadius = "8px"; // Match rounded corners

    document.body.appendChild(clone);
    e.dataTransfer.setDragImage(clone, 0, 0);

    // Clean up
    setTimeout(() => {
      document.body.removeChild(clone);
    }, 0);
  };

  const handleDragOver = (e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    if (dragOverFolderId !== folderId) {
      setDragOverFolderId(folderId);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverFolderId(null);
  };

  const handleDrop = async (e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    setDragOverFolderId(null);
    const projectId = e.dataTransfer.getData("projectId");
    if (!projectId) return;

    // Optimistic update
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    setFolders((prev) =>
      prev.map((f) =>
        f.id === folderId
          ? { ...f, projectCount: Number(f.projectCount || 0) + 1 }
          : f,
      ),
    );

    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify({ folderId }),
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Failed to move project");
      // Optionally refresh data
    } catch (err) {
      console.error(err);
      fetchData(); // Revert on error
    }
  };

  const handleBreadcrumbDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (dragOverBreadcrumb !== id) {
      setDragOverBreadcrumb(id);
    }
  };

  const handleBreadcrumbDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverBreadcrumb(null);
  };

  const handleBreadcrumbDrop = async (
    e: React.DragEvent,
    targetFolderId: string | null,
  ) => {
    e.preventDefault();
    setDragOverBreadcrumb(null);
    const projectId = e.dataTransfer.getData("projectId");
    if (!projectId) return;

    // If moving to same folder (current view), ignore
    if (targetFolderId === folderId) return;

    // Optimistic: Remove from current list since it moved out
    setProjects((prev) => prev.filter((p) => p.id !== projectId));

    try {
      await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify({ folderId: targetFolderId }),
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error(err);
      fetchData(); // Revert
    }
  };

  const getTitle = () => {
    if (folderId) return currentFolder?.name || "Folder";
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
    if (folderId) return "Projects in this folder";
    switch (view) {
      case "trash":
        return "Manage deleted projects";
      default:
        return dict.common.manageProjects;
    }
  };

  if (loading && projects.length === 0 && folders.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted animate-pulse uppercase tracking-widest text-xs font-bold">
          {dict.common.loading}
        </p>
      </div>
    );
  }

  const isTrash = view === "trash";
  const isReadOnlyView = ["trash", "recent", "starred"].includes(view || "");
  // Allow creation ONLY in Home (view is undefined/null/empty)
  const canCreate = !view;

  return (
    <>
      <div className="zen-container max-w-5xl py-12 animate-in fade-in duration-700">
        <header className="flex justify-between items-center mb-16">
          <div>
            {folderId ? (
              <>
                {/* Breadcrumb */}
                <div className="flex items-center gap-2 mb-2 text-sm text-muted-foreground">
                  <div
                    className={`flex items-center justify-center w-6 h-6 rounded transition-colors cursor-pointer ${
                      dragOverBreadcrumb === "root"
                        ? "bg-accent/20 text-accent"
                        : "hover:bg-white/5 text-muted-foreground"
                    }`}
                    onDragOver={(e) => handleBreadcrumbDragOver(e, "root")}
                    onDragLeave={handleBreadcrumbDragLeave}
                    onDrop={(e) => handleBreadcrumbDrop(e, null)}
                    onClick={() => router.push("/home")}
                    title="Home"
                  >
                    <Home size={14} />
                  </div>

                  <ChevronRight size={12} className="opacity-40" />

                  <div
                    className={`flex items-center px-1.5 py-0.5 rounded transition-colors ${
                      currentFolder && dragOverBreadcrumb === currentFolder.id
                        ? "bg-accent/20 text-accent"
                        : ""
                    }`}
                    onDragOver={(e) =>
                      currentFolder &&
                      handleBreadcrumbDragOver(e, currentFolder.id)
                    }
                    onDragLeave={handleBreadcrumbDragLeave}
                    onDrop={(e) =>
                      currentFolder && handleBreadcrumbDrop(e, currentFolder.id)
                    }
                  >
                    {currentFolder ? (
                      <span className="font-medium">{currentFolder.name}</span>
                    ) : (
                      <div className="h-4 w-20 bg-white/5 animate-pulse rounded" />
                    )}
                  </div>
                </div>

                {/* Title */}
                <h1 className="zen-title text-2xl mb-0 leading-none">
                  {currentFolder ? (
                    currentFolder.name
                  ) : (
                    <div className="h-8 w-32 bg-white/5 animate-pulse rounded" />
                  )}
                </h1>
              </>
            ) : (
              <div className="flex items-center gap-3 mb-1">
                <h1 className="zen-title text-2xl mb-0">{getTitle()}</h1>
              </div>
            )}
            <p className="zen-subtitle text-sm opacity-40 mb-4">
              {getSubtitle()}
            </p>
          </div>

          {canCreate && (
            <div className="flex gap-2">
              {!folderId && (
                <Button
                  onClick={handleCreateFolder}
                  className="btn-primary gap-2"
                >
                  <FolderIcon size={14} />
                  <span>New Folder</span>
                </Button>
              )}
              <Button
                onClick={() => setShowCreate(true)}
                className="btn-primary gap-2"
              >
                <Plus size={14} />
                <span>{dict.common.newProject}</span>
              </Button>
            </div>
          )}
        </header>

        <div className="project-grid">
          {/* Folders */}
          {!folderId &&
            (!isReadOnlyView || view === "starred" || view === "trash") &&
            folders.map((folder) => (
              <div
                key={folder.id}
                onClick={() => {
                  if (isTrash) return;
                  if (renamingFolderId !== folder.id) {
                    router.push(`/home?folderId=${folder.id}`);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (!isTrash && folder.ownerId === currentUser?.id) {
                    setContextMenu({ x: e.clientX, y: e.clientY, folder });
                  }
                }}
                onDragOver={(e) => !isTrash && handleDragOver(e, folder.id)}
                onDragLeave={!isTrash ? handleDragLeave : undefined}
                onDrop={(e) => !isTrash && handleDrop(e, folder.id)}
                className={`project-card group relative flex flex-col justify-between cursor-pointer transition-colors ${
                  isTrash ? "cursor-default opacity-75" : ""
                } ${
                  dragOverFolderId === folder.id
                    ? "border-blue-500 bg-blue-500/20"
                    : "border-blue-500/20 hover:border-blue-500/50 bg-blue-500/5 hover:bg-blue-500/10"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3 w-full">
                      <FolderIcon
                        className="text-blue-400 shrink-0"
                        size={24}
                        fill="currentColor"
                        fillOpacity={0.2}
                      />

                      {renamingFolderId === folder.id ? (
                        <input
                          type="text"
                          value={renamingName}
                          onChange={(e) => setRenamingName(e.target.value)}
                          onBlur={handleRenameFolder}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleRenameFolder();
                            }
                            if (e.key === "Escape") {
                              setRenamingFolderId(null);
                              setRenamingName("");
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="zen-textarea w-full text-blue-100 font-bold px-0 py-0 h-auto focus:border-white/20"
                          autoFocus
                        />
                      ) : (
                        <h3 className="project-card-title mb-0 text-blue-100 truncate leading-none mt-1">
                          {folder.name}
                        </h3>
                      )}
                    </div>
                    {!isTrash && (
                      <div className="flex items-center gap-1">
                        {folder.ownerId === currentUser?.id &&
                          renamingFolderId !== folder.id && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenamingFolderId(folder.id);
                                setRenamingName(folder.name);
                              }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-white/10 rounded"
                            >
                              <Edit2 size={12} />
                            </button>
                          )}
                        <button
                          onClick={(e) => toggleFolderStar(e, folder)}
                          className={`transition-opacity hover:scale-110 ${
                            folder.isStarred
                              ? "opacity-100 text-yellow-400"
                              : "opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-yellow-400"
                          }`}
                        >
                          <Star
                            size={16}
                            fill={folder.isStarred ? "currentColor" : "none"}
                          />
                        </button>
                      </div>
                    )}
                  </div>

                  <p className="project-card-desc mb-4">
                    {Number(folder.projectCount || 0)} projects
                  </p>
                </div>

                <div className="project-card-footer !grid grid-cols-3 w-full items-center mt-auto">
                  <div className="project-card-tag justify-self-start">
                    <Calendar size={10} strokeWidth={3} />
                    <span>
                      {new Date(folder.updatedAt).toLocaleDateString("fr-FR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </span>
                  </div>

                  <div className="flex justify-self-center">
                    <span
                      className={`text-[8px] font-black uppercase tracking-[0.2em] px-2 py-0.5 border ${
                        folder.ownerId === currentUser?.id
                          ? "border-white/10 bg-white/5 text-white/60"
                          : "border-accent/20 bg-accent/5 text-accent/60"
                      }`}
                    >
                      {folder.ownerId === currentUser?.id ? "MINE" : "SHARED"}
                    </span>
                  </div>

                  <div className="justify-self-end">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setAccessFolder(folder);
                      }}
                      className="project-card-tag hover:bg-white/10 transition-colors cursor-pointer"
                      title="Manage Access"
                    >
                      <Users size={10} strokeWidth={3} />
                      <span>
                        Users: {Number(folder.collaboratorCount || 0) + 1}
                      </span>
                    </button>
                  </div>
                </div>

                {isTrash && (
                  <div
                    className="absolute inset-0 backdrop-blur-xl flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    style={{
                      backgroundColor:
                        "color-mix(in srgb, var(--bg-page) 85%, transparent)",
                    }}
                  >
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => restoreFolder(e, folder)}
                      className="h-8 px-3"
                    >
                      <RotateCcw size={12} className="mr-2" />
                      {dict.common.restore || "Restore"}
                    </Button>
                    <Button
                      size="sm"
                      onClick={(e) => deleteFolderPermanently(e, folder)}
                      className="h-8 px-3"
                    >
                      <Trash2 size={12} className="mr-2" />
                      {dict.common.delete || "Delete"}
                    </Button>
                  </div>
                )}
              </div>
            ))}

          {/* Empty State */}
          {projects.length === 0 && folders.length === 0 && (
            <div
              onClick={() => canCreate && setShowCreate(true)}
              className={`project-card flex items-center justify-center cursor-pointer border-dashed border-border/60 hover:border-foreground/40 group ${
                !canCreate ? "cursor-default hover:border-border/60" : ""
              }`}
            >
              <div className="flex flex-col items-center gap-3 opacity-40 group-hover:opacity-80 transition-opacity">
                {isTrash ? (
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
                  {isTrash
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
            <div
              key={project.id}
              onClick={() => {
                if (isTrash) return;
                if (renamingProjectId !== project.id) {
                  router.push(`/project/${project.id}`);
                }
              }}
              draggable={!isTrash}
              onDragStart={(e) => handleDragStart(e, project.id)}
              className={`project-card group relative overflow-hidden ${
                isTrash ? "cursor-default opacity-75" : ""
              }`}
              onContextMenu={(e) => {
                e.preventDefault();
                if (!isTrash) {
                  setContextMenu({ x: e.clientX, y: e.clientY, project });
                }
              }}
            >
              <div className="flex justify-between items-start mb-2">
                {renamingProjectId === project.id ? (
                  <input
                    type="text"
                    value={renamingProjectName}
                    onChange={(e) => setRenamingProjectName(e.target.value)}
                    onBlur={handleInputBlur}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleRenameProject();
                      }
                      if (e.key === "Escape") {
                        setRenamingProjectId(null);
                        setRenamingProjectName("");
                        setRenamingProjectDescription("");
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="zen-textarea js-project-edit-input w-full text-blue-100 font-bold px-0 py-0 h-auto focus:border-white/20 project-card-title mb-0 mt-1 leading-none"
                    autoFocus
                  />
                ) : (
                  <h3 className="project-card-title mb-0">{project.name}</h3>
                )}
                {!isTrash && (
                  <div className="flex items-center gap-1">
                    {project.ownerId === currentUser?.id &&
                      renamingProjectId !== project.id && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenamingProjectId(project.id);
                            setRenamingProjectName(project.name);
                            setRenamingProjectDescription(
                              project.description || "",
                            );
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-white/10 rounded"
                        >
                          <Edit2 size={12} />
                        </button>
                      )}
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
                  </div>
                )}
              </div>

              {renamingProjectId === project.id ? (
                <textarea
                  value={renamingProjectDescription}
                  onChange={(e) =>
                    setRenamingProjectDescription(e.target.value)
                  }
                  onBlur={handleInputBlur}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setRenamingProjectId(null);
                      setRenamingProjectName("");
                      setRenamingProjectDescription("");
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="zen-textarea js-project-edit-input w-full text-muted-foreground px-0 py-0 h-auto focus:border-white/20 project-card-desc"
                  rows={2}
                />
              ) : (
                <p className="project-card-desc">
                  {project.description || dict.common.noDescription}
                </p>
              )}

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

              {isTrash && (
                <div
                  className="absolute inset-0 backdrop-blur-xl flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                  style={{
                    backgroundColor:
                      "color-mix(in srgb, var(--bg-page) 85%, transparent)",
                  }}
                >
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
            </div>
          ))}
        </div>
      </div>

      {showCreate && (
        <ProjectModal
          folderId={folderId}
          onClose={() => setShowCreate(false)}
          onSuccess={fetchData}
        />
      )}

      {accessProject && (
        <ProjectAccessModal
          projectId={accessProject.id}
          projectName={accessProject.name}
          onClose={() => setAccessProject(null)}
          onUpdate={fetchData}
        />
      )}

      {accessFolder && (
        <FolderAccessModal
          folderId={accessFolder.id}
          folderName={accessFolder.name}
          onClose={() => setAccessFolder(null)}
          onUpdate={fetchData}
        />
      )}

      {contextMenu && (
        <div
          className="fixed z-50 border border-white/10 rounded-lg shadow-xl py-1 w-48 animate-in fade-in zoom-in-95 duration-100"
          style={{
            top: contextMenu.y,
            left: contextMenu.x,
            backgroundColor: "var(--bg-island)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-4 py-2 text-sm hover:bg-white/5 flex items-center gap-2"
            onClick={() => {
              if (contextMenu.folder) {
                setRenamingFolderId(contextMenu.folder.id);
                setRenamingName(contextMenu.folder.name);
              } else if (contextMenu.project) {
                setRenamingProjectId(contextMenu.project.id);
                setRenamingProjectName(contextMenu.project.name);
                setRenamingProjectDescription(
                  contextMenu.project.description || "",
                );
              }
              setContextMenu(null);
            }}
          >
            <Edit2 size={14} />
            <span>Rename</span>
          </button>
          <button
            className="w-full text-left px-4 py-2 text-sm hover:bg-white/5 flex items-center gap-2"
            onClick={() => {
              if (contextMenu.folder) {
                setAccessFolder(contextMenu.folder);
              } else if (contextMenu.project) {
                setAccessProject(contextMenu.project);
              }
              setContextMenu(null);
            }}
          >
            <Users size={14} />
            <span>Invite Members</span>
          </button>
          <div className="h-[1px] bg-white/10 my-1" />
          <button
            className="w-full text-left px-4 py-2 text-sm hover:bg-red-500/10 text-red-400 flex items-center gap-2"
            onClick={() => {
              if (contextMenu.folder) {
                setFolderToDelete(contextMenu.folder);
              } else if (contextMenu.project) {
                setProjectToDelete(contextMenu.project);
              }
              setContextMenu(null);
            }}
          >
            <Trash2 size={14} />
            <span>Delete</span>
          </button>
        </div>
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
            <Button variant="danger" onClick={confirmDeleteProject}>
              {dict.common.delete || "Delete"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!folderToDelete}
        onClose={() => setFolderToDelete(null)}
        title="Delete Folder?"
        className="max-w-md"
      >
        <div className="p-6 pt-2">
          <p className="text-sm text-muted-foreground mb-6">
            Are you sure you want to delete this folder? Projects inside will be
            moved to the main list.
          </p>
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setFolderToDelete(null)}
              className="hover:underline"
            >
              {dict.common.cancel || "Cancel"}
            </Button>
            <Button variant="danger" onClick={confirmDeleteFolder}>
              {dict.common.delete || "Delete"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
