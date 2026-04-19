"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
import { ProjectAccessModal } from "@components/project/ProjectAccessModal";
import { FolderAccessModal } from "./FolderAccessModal";
import { getRecentProjects } from "@lib/utils";
import { toast } from "sonner";

import { Button } from "@components/ui/Button";
import { Modal } from "@components/ui/Modal";
import { useTouchGestures } from "@components/project/hooks/useTouchGestures";

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
  role?: string;
}

interface Folder {
  id: string;
  name: string;
  ownerId: string;
  parentFolderId?: string | null;
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

type SidebarSyncDetail = {
  refreshAll?: boolean;
  folderIds?: string[];
};

export function ProjectList({ view, folderId }: ProjectListProps) {
  const { dict } = useI18n();
  const { user: currentUser } = useUser();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [currentFolder, setCurrentFolder] = useState<Folder | null>(null);
  const [folderPath, setFolderPath] = useState<Folder[]>([]);
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
  const [showEmptyTrashModal, setShowEmptyTrashModal] = useState(false);

  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

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
  const [adjustedMenuPos, setAdjustedMenuPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const isTrash = view === "trash";

  const onLongPress = useCallback(
    (
      e: React.TouchEvent | TouchEvent | React.PointerEvent | PointerEvent,
      x: number,
      y: number,
    ) => {
      const target = e.target as HTMLElement;

      const folderCard = target.closest("[data-folder-id]");
      if (folderCard) {
        const folderId = folderCard.getAttribute("data-folder-id");
        const folder = folders.find((f) => f.id === folderId);
        if (folder && !isTrash && folder.ownerId === currentUser?.id) {
          setContextMenu({ x, y, folder });
          return;
        }
      }

      const projectCard = target.closest("[data-project-id]");
      if (projectCard) {
        const projectId = projectCard.getAttribute("data-project-id");
        const project = projects.find((p) => p.id === projectId);
        if (project && !isTrash) {
          setContextMenu({ x, y, project });
          return;
        }
      }
    },
    [folders, projects, currentUser?.id, isTrash],
  );

  const touchHandlers = useTouchGestures({
    onLongPress,
    stopPropagation: true,
  });

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  useEffect(() => {
    if (contextMenu && contextMenuRef.current) {
      const menuRect = contextMenuRef.current.getBoundingClientRect();
      const margin = 16;

      let x = contextMenu.x;
      let y = contextMenu.y;

      if (x + menuRect.width + margin > window.innerWidth) {
        x = window.innerWidth - menuRect.width - margin;
      }
      if (x < margin) x = margin;

      if (y + menuRect.height + margin > window.innerHeight) {
        y = window.innerHeight - menuRect.height - margin;
      }
      if (y < margin) y = margin;

      setAdjustedMenuPos({ x, y });
    } else if (contextMenu) {
      setAdjustedMenuPos({ x: contextMenu.x, y: contextMenu.y });
    } else {
      setAdjustedMenuPos(null);
    }
  }, [contextMenu]);

  useEffect(() => {
    if (contextMenu && contextMenuRef.current && adjustedMenuPos) {
      const menuRect = contextMenuRef.current.getBoundingClientRect();
      const margin = 16;
      let needsUpdate = false;
      let { x, y } = adjustedMenuPos;

      if (x + menuRect.width + margin > window.innerWidth) {
        x = window.innerWidth - menuRect.width - margin;
        needsUpdate = true;
      }
      if (y + menuRect.height + margin > window.innerHeight) {
        y = window.innerHeight - menuRect.height - margin;
        needsUpdate = true;
      }

      if (needsUpdate) {
        setAdjustedMenuPos({ x, y });
      }
    }
  }, [contextMenu, adjustedMenuPos]);

  const fetchFolderPath = useCallback(async (initialFolder: Folder | null) => {
    if (!initialFolder?.parentFolderId) {
      return [] as Folder[];
    }

    const ancestors: Folder[] = [];
    let parentId: string | null = initialFolder.parentFolderId || null;

    while (parentId) {
      const parentFolder = await fetch(`/api/folders/${parentId}`, {
        cache: "no-store",
      }).then((res) => (res.ok ? (res.json() as Promise<Folder>) : null));

      if (!parentFolder) {
        break;
      }

      ancestors.unshift(parentFolder);
      parentId = parentFolder.parentFolderId || null;
    }

    return ancestors;
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      setProjects([]);
      setFolders([]);
      setCurrentFolder(null);
      setFolderPath([]);

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
        !view ||
        view === "all" ||
        view === "my-projects" ||
        view === "starred" ||
        view === "trash" ||
        view === "shared"
          ? fetch(
              folderId
                ? `/api/folders?parentFolderId=${encodeURIComponent(folderId)}`
                : `/api/folders?view=${view || "all"}`,
              {
                cache: "no-store",
              },
            ).then((res) => (res.ok ? res.json() : []))
          : Promise.resolve([]);

      const currentFolderPromise = folderId
        ? fetch(`/api/folders/${folderId}`, { cache: "no-store" }).then(
            (res) => (res.ok ? res.json() : null),
          )
        : Promise.resolve(null);

      const [projectsData, foldersData, currentFolderData] = await Promise.all([
        projectsPromise,
        foldersPromise,
        currentFolderPromise,
      ]);

      const nextFolderPath = folderId
        ? await fetchFolderPath(currentFolderData)
        : [];

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
      setFolders(foldersData);
      setCurrentFolder(currentFolderData);
      setFolderPath(nextFolderPath);
    } catch {
      // Handle error
      setProjects([]);
      setFolders([]);
      setCurrentFolder(null);
      setFolderPath([]);
    } finally {
      setLoading(false);
    }
  }, [fetchFolderPath, view, folderId]);

  useEffect(() => {
    fetchData();
    setSelectedItems(new Set());
  }, [fetchData]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedItems.size > 0
      ) {
        const tag = (document.activeElement as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        setShowBulkDeleteModal(true);
      }
      if (e.key === "Escape" && selectedItems.size > 0) {
        setSelectedItems(new Set());
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedItems]);

  const dispatchFavoriteChanged = useCallback(
    (
      detail:
        | {
            item: {
              id: string;
              name: string;
              updatedAt?: string;
              type: "project";
              folderId?: string | null;
            };
            isStarred: boolean;
          }
        | {
            item: {
              id: string;
              name: string;
              updatedAt?: string;
              type: "folder";
            };
            isStarred: boolean;
          },
    ) => {
      window.dispatchEvent(
        new CustomEvent("ideon:favorite-changed", { detail }),
      );
    },
    [],
  );

  const dispatchSidebarSync = useCallback((detail?: SidebarSyncDetail) => {
    window.dispatchEvent(new CustomEvent("ideon:sidebar-sync", { detail }));
  }, []);

  const syncSidebar = useCallback(
    (folderIds?: Array<string | null | undefined>) => {
      dispatchSidebarSync({
        refreshAll: true,
        folderIds: (folderIds ?? []).filter(
          (folderId): folderId is string => typeof folderId === "string",
        ),
      });
    },
    [dispatchSidebarSync],
  );

  const toggleStar = async (e: React.MouseEvent, project: Project) => {
    e.preventDefault();
    e.stopPropagation();

    const newIsStarred = !project.isStarred;
    const favoriteDetail = {
      item: {
        id: project.id,
        name: project.name,
        updatedAt: project.updatedAt,
        type: "project" as const,
        folderId: project.folderId ?? null,
      },
      isStarred: newIsStarred,
    };

    setProjects((prev) => {
      if (view === "starred" && !newIsStarred) {
        return prev.filter((p) => p.id !== project.id);
      }
      return prev.map((p) =>
        p.id === project.id ? { ...p, isStarred: newIsStarred ? 1 : 0 } : p,
      );
    });

    dispatchFavoriteChanged(favoriteDetail);

    try {
      await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isStarred: newIsStarred }),
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      dispatchFavoriteChanged({
        ...favoriteDetail,
        isStarred: !newIsStarred,
      });
      fetchData();
    }
  };

  const toggleFolderStar = async (e: React.MouseEvent, folder: Folder) => {
    e.preventDefault();
    e.stopPropagation();

    const newIsStarred = !folder.isStarred;
    const favoriteDetail = {
      item: {
        id: folder.id,
        name: folder.name,
        updatedAt: folder.updatedAt,
        type: "folder" as const,
      },
      isStarred: newIsStarred,
    };

    setFolders((prev) => {
      if (view === "starred" && !newIsStarred) {
        return prev.filter((f) => f.id !== folder.id);
      }
      return prev.map((f) =>
        f.id === folder.id ? { ...f, isStarred: newIsStarred ? 1 : 0 } : f,
      );
    });

    dispatchFavoriteChanged(favoriteDetail);

    try {
      await fetch(`/api/folders/${folder.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isStarred: newIsStarred }),
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      dispatchFavoriteChanged({
        ...favoriteDetail,
        isStarred: !newIsStarred,
      });
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
      syncSidebar([project.folderId]);
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
      syncSidebar([folder.id]);
    } catch (e) {
      console.error(e);
    }
  };

  const deleteFolderPermanently = (e: React.MouseEvent, folder: Folder) => {
    e.preventDefault();
    e.stopPropagation();
    setFolderToDelete(folder);
  };

  const toggleItemSelection = (key: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const confirmDeleteProject = async () => {
    if (!projectToDelete) return;
    try {
      const deletedProject = projectToDelete;
      const isTrashView = view === "trash";
      await fetch(
        `/api/projects/${deletedProject.id}${
          isTrashView ? "?permanent=true" : ""
        }`,
        {
          method: "DELETE",
        },
      );
      fetchData();
      syncSidebar([deletedProject.folderId]);
    } catch (e) {
      console.error(e);
    } finally {
      setProjectToDelete(null);
    }
  };

  const confirmDeleteFolder = async () => {
    if (!folderToDelete) return;
    try {
      const deletedFolder = folderToDelete;
      const isTrashView = view === "trash";
      await fetch(
        `/api/folders/${deletedFolder.id}${
          isTrashView ? "?permanent=true" : ""
        }`,
        {
          method: "DELETE",
        },
      );
      fetchData();
      syncSidebar([deletedFolder.id]);
    } catch (e) {
      console.error(e);
    } finally {
      setFolderToDelete(null);
    }
  };

  const confirmEmptyTrash = async () => {
    try {
      const response = await fetch("/api/projects/trash", {
        method: "DELETE",
      });
      if (response.ok) {
        toast.success(dict.common.success || "Trash emptied successfully");
        fetchData();
        syncSidebar();
        setShowEmptyTrashModal(false);
      } else {
        toast.error(dict.common.error || "Failed to empty trash");
      }
    } catch (error) {
      console.error("Error emptying trash:", error);
      toast.error(dict.common.error || "An error occurred");
    }
  };

  const handleCreateFolder = async () => {
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        body: JSON.stringify({
          name: dict.dashboard.createFolder,
          parentFolderId: folderId || null,
        }),
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const newFolder = await res.json();
        setFolders((prev) => [newFolder, ...prev]);
        setRenamingFolderId(newFolder.id);
        setRenamingName(newFolder.name);
        syncSidebar([newFolder.id, folderId]);
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
        syncSidebar([folder.id]);
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
      syncSidebar([project.folderId]);
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

  const setDragPreview = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "move";

    const target = e.currentTarget as HTMLElement;
    const clone = target.cloneNode(true) as HTMLElement;

    clone.style.position = "absolute";
    clone.style.top = "-9999px";
    clone.style.left = "-9999px";
    clone.style.width = `${target.offsetWidth}px`;
    clone.style.height = `${target.offsetHeight}px`;
    clone.style.opacity = "1";
    clone.style.backgroundColor = "var(--bg-island)";
    clone.style.zIndex = "9999";
    clone.style.border = "1px solid var(--border)";
    clone.style.borderRadius = "8px";

    document.body.appendChild(clone);
    e.dataTransfer.setDragImage(clone, 0, 0);

    setTimeout(() => {
      document.body.removeChild(clone);
    }, 0);
  };

  const handleDragStart = (e: React.DragEvent, projectId: string) => {
    e.dataTransfer.setData("projectId", projectId);
    setDragPreview(e);
  };

  const handleFolderDragStart = (
    e: React.DragEvent,
    draggedFolderId: string,
  ) => {
    e.dataTransfer.setData("folderId", draggedFolderId);
    setDragPreview(e);
  };

  const moveFolder = useCallback(
    async (draggedFolderId: string, targetParentFolderId: string | null) => {
      if (draggedFolderId === targetParentFolderId) {
        return;
      }

      try {
        const res = await fetch(`/api/folders/${draggedFolderId}`, {
          method: "PATCH",
          body: JSON.stringify({ parentFolderId: targetParentFolderId }),
          headers: { "Content-Type": "application/json" },
        });

        if (!res.ok) {
          throw new Error("Failed to move folder");
        }

        syncSidebar([draggedFolderId, targetParentFolderId, folderId]);
        fetchData();
      } catch (error) {
        console.error(error);
        fetchData();
      }
    },
    [fetchData, folderId, syncSidebar],
  );

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

  const handleDrop = async (e: React.DragEvent, targetFolderId: string) => {
    e.preventDefault();
    setDragOverFolderId(null);
    const draggedFolderId = e.dataTransfer.getData("folderId");
    if (draggedFolderId) {
      await moveFolder(draggedFolderId, targetFolderId);
      return;
    }

    const projectId = e.dataTransfer.getData("projectId");
    if (!projectId) return;

    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    setFolders((prev) =>
      prev.map((f) =>
        f.id === targetFolderId
          ? { ...f, projectCount: Number(f.projectCount || 0) + 1 }
          : f,
      ),
    );

    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify({ folderId: targetFolderId }),
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Failed to move project");
      syncSidebar([targetFolderId]);
    } catch (err) {
      console.error(err);
      fetchData();
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

    const draggedFolderId = e.dataTransfer.getData("folderId");
    if (draggedFolderId) {
      await moveFolder(draggedFolderId, targetFolderId);
      return;
    }

    const projectId = e.dataTransfer.getData("projectId");
    if (!projectId) return;

    if (targetFolderId === folderId) return;

    setProjects((prev) => prev.filter((p) => p.id !== projectId));

    try {
      await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify({ folderId: targetFolderId }),
        headers: { "Content-Type": "application/json" },
      });
      syncSidebar([targetFolderId, folderId]);
    } catch (err) {
      console.error(err);
      fetchData();
    }
  };

  const confirmBulkDelete = async () => {
    setIsBulkDeleting(true);
    const affectedFolderIds: Array<string | null | undefined> = [];
    try {
      await Promise.all(
        [...selectedItems].map(async (key) => {
          const colonIdx = key.indexOf(":");
          const type = key.slice(0, colonIdx) as "project" | "folder";
          const id = key.slice(colonIdx + 1);
          const suffix = isTrash ? "?permanent=true" : "";
          if (type === "project") {
            await fetch(`/api/projects/${id}${suffix}`, { method: "DELETE" });
            affectedFolderIds.push(projects.find((x) => x.id === id)?.folderId);
          } else {
            await fetch(`/api/folders/${id}${suffix}`, { method: "DELETE" });
            affectedFolderIds.push(id);
          }
        }),
      );
      setSelectedItems(new Set());
      setShowBulkDeleteModal(false);
      fetchData();
      syncSidebar(affectedFolderIds);
    } catch (e) {
      console.error(e);
      toast.error(dict.common?.error ?? "An error occurred");
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const getTitle = () => {
    if (folderId) return currentFolder?.name || "Folder";
    switch (view) {
      case "my-projects":
        return dict.dashboard.myProjects || "My Projects";
      case "shared":
        return dict.dashboard.sharedWithMe || "Shared with Me";
      case "recent":
        return dict.dashboard.recent || "Recent Projects";
      case "starred":
        return dict.dashboard.starred || "Starred Projects";
      case "trash":
        return dict.dashboard.trash || "Trash";
      default:
        return dict.dashboard.home || "Home";
    }
  };

  const getSubtitle = () => {
    if (folderId)
      return dict.dashboard.manageFolder || "Projects in this folder";
    switch (view) {
      case "trash":
        return dict.dashboard.manageTrash || "Manage deleted projects";
      case "recent":
        return dict.dashboard.manageRecent || "Your recently accessed projects";
      case "starred":
        return dict.dashboard.manageStarred || "Your favorite projects";
      case "shared":
        return dict.dashboard.manageShared || "Projects shared with you";
      case "my-projects":
        return (
          dict.dashboard.manageMyProjects || "Manage the projects you created"
        );
      default:
        return dict.dashboard.manageProjects;
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

  const isReadOnlyView = ["trash", "recent", "starred"].includes(view || "");
  const canCreateProject = !isReadOnlyView && (!view || view === "my-projects");
  const canCreateFolder =
    !isReadOnlyView &&
    ((!folderId && (!view || view === "my-projects")) ||
      (folderId && currentFolder?.ownerId === currentUser?.id));

  return (
    <>
      <div className="zen-container max-w-5xl py-12 animate-in fade-in duration-700">
        <header className="flex flex-col items-start gap-4 mt-8 mb-10 md:mb-16 md:flex-row md:items-center md:justify-between">
          <div className="w-full md:w-auto">
            {folderId ? (
              <>
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
                    title={dict.dashboard.home}
                  >
                    <Home size={14} />
                  </div>

                  {[
                    ...folderPath,
                    ...(currentFolder ? [currentFolder] : []),
                  ].map((folder, index, allFolders) => (
                    <div key={folder.id} className="flex items-center gap-2">
                      <ChevronRight size={12} className="opacity-40" />
                      <div
                        className={`flex items-center px-1.5 py-0.5 rounded transition-colors ${
                          dragOverBreadcrumb === folder.id
                            ? "bg-accent/20 text-accent"
                            : ""
                        }`}
                        onDragOver={(e) =>
                          handleBreadcrumbDragOver(e, folder.id)
                        }
                        onDragLeave={handleBreadcrumbDragLeave}
                        onDrop={(e) => handleBreadcrumbDrop(e, folder.id)}
                      >
                        {index === allFolders.length - 1 ? (
                          <span className="font-medium">{folder.name}</span>
                        ) : (
                          <button
                            onClick={() =>
                              router.push(`/home?folderId=${folder.id}`)
                            }
                            className="font-medium hover:underline"
                          >
                            {folder.name}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

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

          {(canCreateProject || canCreateFolder) && (
            <div className="flex w-full flex-col gap-2 sm:w-auto md:w-auto md:flex-row md:items-center">
              {canCreateFolder && (
                <Button
                  onClick={handleCreateFolder}
                  className="btn-primary gap-2 w-full sm:w-auto"
                >
                  <FolderIcon size={14} />
                  <span>{dict.dashboard.createFolder}</span>
                </Button>
              )}
              {canCreateProject && (
                <Button
                  onClick={() => setShowCreate(true)}
                  className="btn-primary gap-2 w-full sm:w-auto"
                >
                  <Plus size={14} />
                  <span>{dict.dashboard.newProject}</span>
                </Button>
              )}
            </div>
          )}

          {isTrash && (projects.length > 0 || folders.length > 0) && (
            <Button
              onClick={() => setShowEmptyTrashModal(true)}
              className="btn-primary gap-2"
            >
              <Trash2 size={14} />
              <span>{dict.dashboard.emptyTrashButton}</span>
            </Button>
          )}
        </header>

        {selectedItems.size > 0 && (
          <div className="bulk-action-bar">
            <span className="text-sm text-white/60">
              {selectedItems.size} {selectedItems.size === 1 ? "item" : "items"}{" "}
              selected
            </span>
            <button
              onClick={() => setShowBulkDeleteModal(true)}
              className="bulk-action-bar__delete"
            >
              <Trash2 size={13} />
              Delete
            </button>
            <button
              onClick={() => setSelectedItems(new Set())}
              className="rounded-lg px-3 py-1.5 text-sm text-white/40 hover:text-white/80 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        <div className="project-grid">
          {folders.map((folder) => (
            <div
              key={folder.id}
              onClick={(e) => {
                if (isTrash) return;
                if (e.ctrlKey || e.metaKey) {
                  e.preventDefault();
                  toggleItemSelection(`folder:${folder.id}`);
                  return;
                }
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
              draggable={!isTrash && folder.ownerId === currentUser?.id}
              onDragStart={(e) => handleFolderDragStart(e, folder.id)}
              data-folder-id={folder.id}
              {...touchHandlers}
              className={`project-card folder-card-style group relative flex flex-col justify-between cursor-pointer transition-colors ${
                isTrash ? "cursor-default opacity-75" : ""
              } ${dragOverFolderId === folder.id ? "drag-over" : ""} ${
                selectedItems.has(`folder:${folder.id}`)
                  ? "ring-2 ring-blue-400/60"
                  : ""
              }`}
            >
              {!isTrash && (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleItemSelection(`folder:${folder.id}`);
                  }}
                  className={`absolute top-2 left-2 z-10 transition-opacity ${
                    selectedItems.has(`folder:${folder.id}`)
                      ? "opacity-100"
                      : "opacity-0 group-hover:opacity-100"
                  }`}
                >
                  <input
                    type="checkbox"
                    readOnly
                    checked={selectedItems.has(`folder:${folder.id}`)}
                    className="w-4 h-4 accent-blue-400 cursor-pointer"
                  />
                </div>
              )}
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
                    <div className="flex items-center gap-2">
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
                            <Edit2 size={14} />
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
                  {dict.dashboard.projectsCount.replace(
                    "{count}",
                    String(Number(folder.projectCount || 0)),
                  )}
                </p>
              </div>

              <div className="project-card-footer grid! grid-cols-3 w-full items-center mt-auto">
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
                    className={`project-card-tag ${
                      folder.ownerId === currentUser?.id
                        ? "badge-owner"
                        : "badge-collaborator"
                    }`}
                  >
                    {folder.ownerId === currentUser?.id
                      ? dict.dashboard.statusMine
                      : dict.dashboard.statusShared}
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
                    title={dict.project.projectAccess}
                  >
                    <Users size={10} strokeWidth={3} />
                    <span>
                      {dict.common.usersCount.replace(
                        "{count}",
                        String(Number(folder.collaboratorCount || 0) + 1),
                      )}
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

          {projects.length === 0 && folders.length === 0 && (
            <div
              onClick={() => canCreateProject && setShowCreate(true)}
              className={`project-card flex items-center justify-center cursor-pointer border-dashed border-border/60 hover:border-foreground/40 group ${
                !canCreateProject ? "cursor-default hover:border-border/60" : ""
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
                <span className="text-xs font-bold uppercase">
                  {isTrash
                    ? dict.dashboard.emptyTrash || "Trash is empty"
                    : view === "starred"
                      ? dict.dashboard.emptyStarred || "No starred projects"
                      : view === "recent"
                        ? dict.dashboard.emptyRecent || "No recent projects"
                        : view === "shared"
                          ? dict.dashboard.emptyShared || "No shared projects"
                          : dict.dashboard.newProject}
                </span>
              </div>
            </div>
          )}

          {projects.map((project) => (
            <div
              key={project.id}
              onClick={(e) => {
                if (isTrash) return;
                if (e.ctrlKey || e.metaKey) {
                  e.preventDefault();
                  toggleItemSelection(`project:${project.id}`);
                  return;
                }
                if (renamingProjectId !== project.id) {
                  router.push(
                    folderId
                      ? `/project/${project.id}?folderId=${folderId}`
                      : `/project/${project.id}`,
                  );
                }
              }}
              draggable={!isTrash}
              onDragStart={(e) => handleDragStart(e, project.id)}
              data-project-id={project.id}
              {...touchHandlers}
              className={`project-card group relative overflow-hidden ${
                isTrash ? "cursor-default opacity-75" : ""
              } ${
                selectedItems.has(`project:${project.id}`)
                  ? "ring-2 ring-blue-400/60"
                  : ""
              }`}
              onContextMenu={(e) => {
                e.preventDefault();
                if (!isTrash) {
                  setContextMenu({ x: e.clientX, y: e.clientY, project });
                }
              }}
            >
              {!isTrash && (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleItemSelection(`project:${project.id}`);
                  }}
                  className={`absolute top-2 left-2 z-10 transition-opacity ${
                    selectedItems.has(`project:${project.id}`)
                      ? "opacity-100"
                      : "opacity-0 group-hover:opacity-100"
                  }`}
                >
                  <input
                    type="checkbox"
                    readOnly
                    checked={selectedItems.has(`project:${project.id}`)}
                    className="w-4 h-4 accent-blue-400 cursor-pointer"
                  />
                </div>
              )}
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
                  <div className="flex items-center gap-2">
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
                          <Edit2 size={14} />
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
                  {project.description || dict.project.noDescription}
                </p>
              )}

              <div className="project-card-footer grid! grid-cols-3 w-full items-center">
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
                    className={`project-card-tag ${
                      project.ownerId === currentUser?.id
                        ? "badge-owner"
                        : "badge-collaborator"
                    }`}
                  >
                    {project.ownerId === currentUser?.id
                      ? dict.dashboard.statusMine
                      : dict.dashboard.statusShared}
                  </span>
                </div>

                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (project.role !== "viewer") {
                      setAccessProject(project);
                    }
                  }}
                  className="project-card-tag transition-colors justify-self-end group/users"
                >
                  <Users
                    size={10}
                    strokeWidth={3}
                    className="transition-colors"
                  />
                  <span className="transition-colors">
                    {dict.common.usersCount.replace(
                      "{count}",
                      String(Number(project.collaboratorCount || 0) + 1),
                    )}
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
          onSuccess={() => {
            fetchData();
            syncSidebar([folderId]);
          }}
        />
      )}

      {accessProject && (
        <ProjectAccessModal
          isOpen={!!accessProject}
          projectId={accessProject.id}
          projectName={accessProject.name}
          onClose={() => setAccessProject(null)}
          onUpdate={() => {
            fetchData();
            syncSidebar([accessProject.folderId]);
          }}
        />
      )}

      {accessFolder && (
        <FolderAccessModal
          folderId={accessFolder.id}
          folderName={accessFolder.name}
          onClose={() => setAccessFolder(null)}
          onUpdate={() => {
            fetchData();
            syncSidebar([accessFolder.id]);
          }}
        />
      )}

      {contextMenu && adjustedMenuPos && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 border border-white/10 rounded-lg shadow-xl py-1 w-48 animate-in fade-in zoom-in-95 duration-100"
          style={{
            top: adjustedMenuPos.y,
            left: adjustedMenuPos.x,
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
            <span>{dict.common.rename}</span>
          </button>
          {(!contextMenu.project || contextMenu.project.role !== "viewer") && (
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
              <span>{dict.project.inviteMembers}</span>
            </button>
          )}
          <div className="h-px bg-white/10 my-1" />
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
            <span>{dict.common.delete}</span>
          </button>
        </div>
      )}

      <Modal
        isOpen={!!projectToDelete}
        onClose={() => setProjectToDelete(null)}
        title={dict.modals.deleteProjectTitle || "Delete Project?"}
        className="max-w-md"
      >
        <div className="p-6 pt-2">
          <p className="text-sm text-muted-foreground mb-6">
            {dict.modals.deleteProjectDescription ||
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
        title={dict.modals.deleteFolderTitle}
        className="max-w-md"
      >
        <div className="p-6 pt-2">
          <p className="text-sm text-muted-foreground mb-6">
            {dict.modals.deleteFolderDescription}
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

      <Modal
        isOpen={showEmptyTrashModal}
        onClose={() => setShowEmptyTrashModal(false)}
        title={dict.modals.emptyTrashTitle}
        className="max-w-md"
      >
        <div className="p-6 pt-2">
          <p className="text-sm text-muted-foreground mb-6">
            {dict.modals.emptyTrashDescription}
          </p>
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setShowEmptyTrashModal(false)}
              className="hover:underline"
            >
              {dict.common.cancel || "Cancel"}
            </Button>
            <Button variant="danger" onClick={confirmEmptyTrash}>
              {dict.common.delete || "Delete"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showBulkDeleteModal}
        onClose={() => {
          if (!isBulkDeleting) setShowBulkDeleteModal(false);
        }}
        title={`Delete ${selectedItems.size} ${
          selectedItems.size === 1 ? "item" : "items"
        }?`}
        subtitle={
          isTrash
            ? "These items will be permanently deleted and cannot be recovered."
            : "These items will be moved to the trash."
        }
        className="max-w-md"
      >
        <div className="p-6 pt-2">
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setShowBulkDeleteModal(false)}
              disabled={isBulkDeleting}
              className="hover:underline"
            >
              {dict.common.cancel || "Cancel"}
            </Button>
            <Button
              variant="danger"
              onClick={confirmBulkDelete}
              disabled={isBulkDeleting}
            >
              {isBulkDeleting
                ? "Deleting…"
                : isTrash
                  ? dict.common.delete || "Delete permanently"
                  : "Move to trash"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
