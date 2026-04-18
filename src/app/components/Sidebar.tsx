"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LogOut,
  Sun,
  Moon,
  Users,
  Settings,
  ChevronDown,
  House,
  User,
  Clock,
  Star,
  Trash2,
  Share2,
  PanelLeftOpen,
  PanelLeftClose,
  Grid2x2Plus,
  Folder,
  FileText,
} from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import { useUser } from "@providers/UserProvider";
import { getAvatarUrl } from "@lib/utils";
import { useTheme } from "@providers/ThemeProvider";
import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Button } from "./ui/Button";
import { Modal } from "./ui/Modal";
import { useSearchParams } from "next/navigation";
import { VersionBadge } from "./VersionBadge";

interface SidebarProps {
  currentVersion?: string;
  initialCollapsed?: boolean;
  userRole?: string;
}

type SidebarProject = { id: string; name: string };
type SidebarFolder = { id: string; name: string; updatedAt?: string };
type SidebarProjectRecord = SidebarProject & {
  updatedAt?: string;
  folderId?: string | null;
};
type SidebarStarredItem = {
  id: string;
  name: string;
  updatedAt?: string;
  type: "folder" | "project";
  folderId?: string | null;
};
type SidebarFavoriteChangedDetail = {
  item: SidebarStarredItem;
  isStarred: boolean;
};
type SidebarFolderSection = "my-projects" | "shared" | "starred";
type SidebarSyncDetail = {
  refreshAll?: boolean;
  folderIds?: string[];
};

export function Sidebar({
  currentVersion = "0.0.0",
  initialCollapsed = false,
  userRole,
}: SidebarProps) {
  const { dict } = useI18n();
  const { theme, setTheme } = useTheme();
  const { user } = useUser();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentView = searchParams.get("view");
  const currentFolderId = searchParams.get("folderId");

  const effectiveRole = user?.role || userRole;
  const isAdminOrSuper =
    effectiveRole === "admin" || effectiveRole === "superadmin";

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);
  const [isInitialized, setIsInitialized] = useState(false);

  const [managementExpanded, setManagementExpanded] = useState(false);
  const [myProjectsExpanded, setMyProjectsExpanded] = useState(false);
  const [recentExpanded, setRecentExpanded] = useState(false);
  const [sharedExpanded, setSharedExpanded] = useState(false);
  const [starredExpanded, setStarredExpanded] = useState(false);

  const [sidebarFolders, setSidebarFolders] = useState<SidebarFolder[]>([]);
  const [sidebarRootProjects, setSidebarRootProjects] = useState<
    SidebarProjectRecord[]
  >([]);
  const [expandedFolderIdsBySection, setExpandedFolderIdsBySection] = useState<
    Record<SidebarFolderSection, Set<string>>
  >({
    "my-projects": new Set(),
    shared: new Set(),
    starred: new Set(),
  });
  const [folderProjects, setFolderProjects] = useState<
    Record<string, SidebarProjectRecord[]>
  >({});
  const [sidebarSharedFolders, setSidebarSharedFolders] = useState<
    SidebarFolder[]
  >([]);
  const [sidebarRecent, setSidebarRecent] = useState<SidebarProjectRecord[]>(
    [],
  );
  const [sidebarShared, setSidebarShared] = useState<SidebarProjectRecord[]>(
    [],
  );
  const [sidebarStarred, setSidebarStarred] = useState<SidebarStarredItem[]>(
    [],
  );
  const [currentHash, setCurrentHash] = useState("");

  const myProjectsFetchedRef = useRef(false);
  const recentFetchedRef = useRef(false);
  const sharedFetchedRef = useRef(false);
  const starredFetchedRef = useRef(false);

  const sortStarredItems = useCallback((items: SidebarStarredItem[]) => {
    return [...items].sort((left, right) => {
      const leftTime = left.updatedAt ? new Date(left.updatedAt).getTime() : 0;
      const rightTime = right.updatedAt
        ? new Date(right.updatedAt).getTime()
        : 0;
      return rightTime - leftTime;
    });
  }, []);

  const loadMyProjects = useCallback(async () => {
    const [foldersResponse, projectsResponse] = await Promise.all([
      fetch("/api/folders?view=my-projects", { cache: "no-store" }),
      fetch("/api/projects?view=my-projects", { cache: "no-store" }),
    ]);

    if (!foldersResponse.ok || !projectsResponse.ok) {
      throw new Error("Failed to load sidebar my projects");
    }

    const [foldersData, projectsData] = await Promise.all([
      foldersResponse.json() as Promise<SidebarFolder[]>,
      projectsResponse.json() as Promise<SidebarProjectRecord[]>,
    ]);

    setSidebarFolders(foldersData);
    setSidebarRootProjects(projectsData);
  }, []);

  const loadRecent = useCallback(async () => {
    const response = await fetch("/api/projects?view=recent", {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Failed to load sidebar recent projects");
    }

    const data = (await response.json()) as SidebarProjectRecord[];
    setSidebarRecent(data);
  }, []);

  const loadShared = useCallback(async () => {
    const [foldersResponse, projectsResponse] = await Promise.all([
      fetch("/api/folders?view=shared", { cache: "no-store" }),
      fetch("/api/projects?view=shared", { cache: "no-store" }),
    ]);

    if (!foldersResponse.ok || !projectsResponse.ok) {
      throw new Error("Failed to load sidebar shared projects");
    }

    const [foldersData, projectsData] = await Promise.all([
      foldersResponse.json() as Promise<SidebarFolder[]>,
      projectsResponse.json() as Promise<SidebarProjectRecord[]>,
    ]);

    setSidebarSharedFolders(foldersData);
    setSidebarShared(projectsData);
  }, []);

  const loadStarred = useCallback(async () => {
    const [foldersResponse, projectsResponse] = await Promise.all([
      fetch("/api/folders?view=starred", { cache: "no-store" }),
      fetch("/api/projects?view=starred", { cache: "no-store" }),
    ]);

    if (!foldersResponse.ok || !projectsResponse.ok) {
      throw new Error("Failed to load sidebar starred items");
    }

    const [foldersData, projectsData] = await Promise.all([
      foldersResponse.json() as Promise<SidebarFolder[]>,
      projectsResponse.json() as Promise<SidebarProjectRecord[]>,
    ]);

    const nextItems = sortStarredItems([
      ...foldersData.map((folder) => ({
        id: folder.id,
        name: folder.name,
        updatedAt: folder.updatedAt,
        type: "folder" as const,
      })),
      ...projectsData.map((project) => ({
        id: project.id,
        name: project.name,
        updatedAt: project.updatedAt,
        type: "project" as const,
        folderId: project.folderId ?? null,
      })),
    ]);

    setSidebarStarred(nextItems);
  }, [sortStarredItems]);

  const loadFolderProjects = useCallback(async (folderId: string) => {
    const response = await fetch(`/api/projects?folderId=${folderId}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Failed to load sidebar folder projects");
    }

    const data = (await response.json()) as SidebarProjectRecord[];
    setFolderProjects((prev) => ({ ...prev, [folderId]: data }));
  }, []);

  const refreshExpandedFolderProjects = useCallback(
    async (detail?: SidebarSyncDetail) => {
      const folderIds = new Set<string>(detail?.folderIds ?? []);

      Object.values(expandedFolderIdsBySection).forEach((folderSet) => {
        folderSet.forEach((folderId) => folderIds.add(folderId));
      });

      await Promise.all(
        Array.from(folderIds).map((folderId) =>
          loadFolderProjects(folderId).catch(() => {}),
        ),
      );
    },
    [expandedFolderIdsBySection, loadFolderProjects],
  );

  const refreshSidebarData = useCallback(
    async (detail?: SidebarSyncDetail) => {
      const loaders: Promise<unknown>[] = [];

      if (detail?.refreshAll || myProjectsFetchedRef.current || myProjectsExpanded) {
        loaders.push(loadMyProjects().catch(() => {}));
      }

      if (detail?.refreshAll || recentFetchedRef.current || recentExpanded) {
        loaders.push(loadRecent().catch(() => {}));
      }

      if (detail?.refreshAll || sharedFetchedRef.current || sharedExpanded) {
        loaders.push(loadShared().catch(() => {}));
      }

      if (detail?.refreshAll || starredFetchedRef.current || starredExpanded) {
        loaders.push(loadStarred().catch(() => {}));
      }

      loaders.push(refreshExpandedFolderProjects(detail));

      await Promise.all(loaders);
    },
    [
      loadMyProjects,
      loadRecent,
      loadShared,
      loadStarred,
      myProjectsExpanded,
      recentExpanded,
      refreshExpandedFolderProjects,
      sharedExpanded,
      starredExpanded,
    ],
  );

  useEffect(() => {
    try {
      const savedManagement = localStorage.getItem("managementExpanded");
      if (savedManagement !== null)
        setManagementExpanded(savedManagement === "true");

      const savedMyProjects = localStorage.getItem("myProjectsExpanded");
      if (savedMyProjects !== null)
        setMyProjectsExpanded(savedMyProjects === "true");

      const savedRecent = localStorage.getItem("recentExpanded");
      if (savedRecent !== null) setRecentExpanded(savedRecent === "true");

      const savedShared = localStorage.getItem("sharedExpanded");
      if (savedShared !== null) setSharedExpanded(savedShared === "true");

      const savedStarred = localStorage.getItem("starredExpanded");
      if (savedStarred !== null) setStarredExpanded(savedStarred === "true");
    } catch {
      console.warn("LocalStorage unavailable");
    }
  }, []);

  useEffect(() => {
    const handleHashChange = () => setCurrentHash(window.location.hash);
    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const collapsedAttr =
      root.getAttribute("data-sidebar-collapsed") === "true";
    if (collapsedAttr !== isCollapsed) setIsCollapsed(collapsedAttr);
    setIsInitialized(true);
  }, []);

  const handleToggle = (collapsed: boolean) => {
    setIsCollapsed(collapsed);
    localStorage.setItem("sidebarCollapsed", String(collapsed));
    document.cookie = `sidebarCollapsed=${collapsed}; path=/; max-age=31536000; SameSite=Lax`;
    if (collapsed) {
      document.documentElement.setAttribute("data-sidebar-collapsed", "true");
    } else {
      document.documentElement.removeAttribute("data-sidebar-collapsed");
    }
    window.dispatchEvent(
      new CustomEvent("sidebar-toggle", { detail: { collapsed } }),
    );
  };

  const logout = async () => {
    await signOut({ callbackUrl: "/login" });
  };

  useEffect(() => {
    if (!myProjectsExpanded || myProjectsFetchedRef.current) return;
    myProjectsFetchedRef.current = true;
    loadMyProjects().catch(() => {});
  }, [loadMyProjects, myProjectsExpanded]);

  useEffect(() => {
    if (!recentExpanded || recentFetchedRef.current) return;
    recentFetchedRef.current = true;
    loadRecent().catch(() => {});
  }, [loadRecent, recentExpanded]);

  useEffect(() => {
    if (!sharedExpanded || sharedFetchedRef.current) return;
    sharedFetchedRef.current = true;
    loadShared().catch(() => {});
  }, [loadShared, sharedExpanded]);

  useEffect(() => {
    if (!starredExpanded || starredFetchedRef.current) return;
    starredFetchedRef.current = true;
    loadStarred().catch(() => {});
  }, [loadStarred, starredExpanded]);

  useEffect(() => {
    const handleFavoriteChanged = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;

      const detail = event.detail as SidebarFavoriteChangedDetail | undefined;
      if (!detail?.item?.id) return;

      setSidebarStarred((prev) => {
        const filtered = prev.filter(
          (item) =>
            !(item.id === detail.item.id && item.type === detail.item.type),
        );

        if (!detail.isStarred) {
          return filtered;
        }

        return sortStarredItems([detail.item, ...filtered]);
      });
    };

    window.addEventListener(
      "ideon:favorite-changed",
      handleFavoriteChanged as EventListener,
    );

    return () => {
      window.removeEventListener(
        "ideon:favorite-changed",
        handleFavoriteChanged as EventListener,
      );
    };
  }, [sortStarredItems]);

  useEffect(() => {
    const handleSidebarSync = (event?: Event) => {
      const detail =
        event instanceof CustomEvent
          ? (event.detail as SidebarSyncDetail | undefined)
          : undefined;

      refreshSidebarData(detail).catch(() => {});
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        handleSidebarSync();
      }
    };

    window.addEventListener(
      "ideon:sidebar-sync",
      handleSidebarSync as EventListener,
    );
    window.addEventListener("focus", handleSidebarSync);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener(
        "ideon:sidebar-sync",
        handleSidebarSync as EventListener,
      );
      window.removeEventListener("focus", handleSidebarSync);
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
    };
  }, [refreshSidebarData]);

  const handleMyProjectsToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !myProjectsExpanded;
    setMyProjectsExpanded(next);
    localStorage.setItem("myProjectsExpanded", String(next));
  };

  const isFolderExpanded = (section: SidebarFolderSection, folderId: string) =>
    expandedFolderIdsBySection[section].has(folderId);

  const handleFolderToggle = (
    section: SidebarFolderSection,
    e: React.MouseEvent,
    folderId: string,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setExpandedFolderIdsBySection((prev) => {
      const next = new Set(prev[section]);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }

      return {
        ...prev,
        [section]: next,
      };
    });
    if (!folderProjects[folderId]) {
      loadFolderProjects(folderId).catch(() => {});
    }
  };

  const isActive = (p: string) =>
    pathname === p || pathname.startsWith(`${p}/`);

  const toggleSidebar = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleToggle(!isCollapsed);
    }
  };

  const hasMyProjectsContent =
    sidebarRootProjects.length > 0 || sidebarFolders.length > 0;
  const hasSharedContent =
    sidebarSharedFolders.length > 0 || sidebarShared.length > 0;

  return (
    <>
      <aside
        className={`sidebar ${isCollapsed ? "collapsed" : ""} ${
          !isInitialized ? "no-transition" : ""
        }`}
        onClick={toggleSidebar}
      >
        <div className="sidebar-header pointer-events-none">
          <div className="sidebar-logo-container">
            <div className="sidebar-logo-img">
              <img
                src="/light-icon.png"
                alt=""
                className="logo-layer light"
                aria-hidden="true"
              />
              <img
                src="/dark-icon.png"
                alt=""
                className="logo-layer dark"
                aria-hidden="true"
              />
            </div>
            {!isCollapsed && (
              <>
                <span className="sidebar-logo-text">{dict.title}</span>
                <VersionBadge currentVersion={currentVersion} />
              </>
            )}
          </div>
        </div>

        <nav className="nav-section pointer-events-none">
          <div className="nav-group pointer-events-none">
            {/* Home */}
            <div
              className={`nav-item pointer-events-auto flex items-stretch p-0 overflow-hidden ${
                pathname === "/home" && !currentView && !currentFolderId
                  ? "active"
                  : ""
              }`}
            >
              <Link
                href="/home"
                className="flex-1 flex items-center gap-3 px-3 py-2.5 text-inherit no-underline"
                title={isCollapsed ? dict.dashboard.home : ""}
              >
                <House size={20} />
                {!isCollapsed && <span>{dict.dashboard.home}</span>}
              </Link>
            </div>

            {!isCollapsed && (
              <div className="nav-separator">
                <span>{dict.dashboard.projectsManagement}</span>
              </div>
            )}

            {/* My Projects */}
            <div className="nav-group-collapsible pointer-events-auto">
              <div
                className={`nav-item flex items-stretch p-0 overflow-hidden ${
                  currentView === "my-projects" || !!currentFolderId
                    ? "active"
                    : ""
                } ${myProjectsExpanded ? "expanded" : ""}`}
              >
                <Link
                  href="/home?view=my-projects"
                  className="flex-1 flex items-center gap-3 px-3 py-2.5 text-inherit no-underline"
                  title={isCollapsed ? dict.dashboard.myProjects : ""}
                >
                  <User size={20} />
                  {!isCollapsed && <span>{dict.dashboard.myProjects}</span>}
                </Link>
                {!isCollapsed && (
                  <button
                    onClick={handleMyProjectsToggle}
                    className="pr-3 flex items-center justify-center"
                  >
                    <ChevronDown
                      size={14}
                      className="nav-item-expand transition-transform duration-200"
                    />
                  </button>
                )}
              </div>
              {!isCollapsed && myProjectsExpanded && (
                <div className="nav-sub-group">
                  {!hasMyProjectsContent && (
                    <div className="nav-sub-empty">
                      {dict.dashboard.emptyMyProjects}
                    </div>
                  )}
                  {sidebarRootProjects.map((project) => (
                    <Link
                      key={project.id}
                      href={`/project/${project.id}`}
                      className={`nav-sub-item ${
                        pathname === `/project/${project.id}` &&
                        !currentFolderId
                          ? "active"
                          : ""
                      }`}
                    >
                      <FileText size={14} />
                      <span>{project.name}</span>
                    </Link>
                  ))}
                  {sidebarFolders.map((folder) => (
                    <div key={folder.id}>
                      <div
                        className={`nav-sub-item nav-sub-folder-row ${
                          currentFolderId === folder.id ? "active" : ""
                        }`}
                      >
                        <Link
                          href={`/home?folderId=${folder.id}`}
                          className="nav-sub-folder-link"
                        >
                          <Folder size={14} />
                          <span>{folder.name}</span>
                        </Link>
                        <button
                          onClick={(e) =>
                            handleFolderToggle("my-projects", e, folder.id)
                          }
                          className="nav-sub-folder-button"
                        >
                          <ChevronDown
                            size={12}
                            className={`transition-transform duration-200 ${
                              isFolderExpanded("my-projects", folder.id)
                                ? ""
                                : "-rotate-90"
                            }`}
                          />
                        </button>
                      </div>
                      {isFolderExpanded("my-projects", folder.id) &&
                        folderProjects[folder.id] &&
                        (folderProjects[folder.id].length > 0 ? (
                          <div className="sidebar-folder-tree">
                            {folderProjects[folder.id].map((project) => (
                              <Link
                                key={project.id}
                                href={`/project/${project.id}?folderId=${folder.id}`}
                                className={`nav-sub-item ${
                                  pathname === `/project/${project.id}` &&
                                  currentFolderId === folder.id
                                    ? "active"
                                    : ""
                                }`}
                              >
                                <FileText size={12} />
                                <span>{project.name}</span>
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <div className="sidebar-folder-tree">
                            <div className="nav-sub-empty">
                              {dict.dashboard.emptyFolder}
                            </div>
                          </div>
                        ))}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Shared with Me */}
            <div className="nav-group-collapsible pointer-events-auto">
              <div
                className={`nav-item flex items-stretch p-0 overflow-hidden ${
                  currentView === "shared" ? "active" : ""
                } ${sharedExpanded ? "expanded" : ""}`}
              >
                <Link
                  href="/home?view=shared"
                  className="flex-1 flex items-center gap-3 px-3 py-2.5 text-inherit no-underline"
                  title={
                    isCollapsed ? dict.dashboard.sharedWithMe || "Shared" : ""
                  }
                >
                  <Share2 size={20} />
                  {!isCollapsed && (
                    <span>{dict.dashboard.sharedWithMe || "Shared"}</span>
                  )}
                </Link>
                {!isCollapsed && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const next = !sharedExpanded;
                      setSharedExpanded(next);
                      localStorage.setItem("sharedExpanded", String(next));
                    }}
                    className="pr-3 flex items-center justify-center"
                  >
                    <ChevronDown
                      size={14}
                      className="nav-item-expand transition-transform duration-200"
                    />
                  </button>
                )}
              </div>
              {!isCollapsed && sharedExpanded && (
                <div className="nav-sub-group">
                  {!hasSharedContent && (
                    <div className="nav-sub-empty">
                      {dict.dashboard.emptyShared}
                    </div>
                  )}
                  {sidebarSharedFolders.map((folder) => (
                    <div key={folder.id}>
                      <div
                        className={`nav-sub-item nav-sub-folder-row ${
                          currentFolderId === folder.id ? "active" : ""
                        }`}
                      >
                        <Link
                          href={`/home?folderId=${folder.id}`}
                          className="nav-sub-folder-link"
                        >
                          <Folder size={14} />
                          <span>{folder.name}</span>
                        </Link>
                        <button
                          onClick={(e) =>
                            handleFolderToggle("shared", e, folder.id)
                          }
                          className="nav-sub-folder-button"
                        >
                          <ChevronDown
                            size={12}
                            className={`transition-transform duration-200 ${
                              isFolderExpanded("shared", folder.id)
                                ? ""
                                : "-rotate-90"
                            }`}
                          />
                        </button>
                      </div>
                      {isFolderExpanded("shared", folder.id) &&
                        folderProjects[folder.id] &&
                        (folderProjects[folder.id].length > 0 ? (
                          <div className="sidebar-folder-tree">
                            {folderProjects[folder.id].map((project) => (
                              <Link
                                key={project.id}
                                href={`/project/${project.id}?folderId=${folder.id}`}
                                className={`nav-sub-item ${
                                  pathname === `/project/${project.id}` &&
                                  currentFolderId === folder.id
                                    ? "active"
                                    : ""
                                }`}
                              >
                                <FileText size={12} />
                                <span>{project.name}</span>
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <div className="sidebar-folder-tree">
                            <div className="nav-sub-empty">
                              {dict.dashboard.emptyFolder}
                            </div>
                          </div>
                        ))}
                    </div>
                  ))}
                  {sidebarShared.map((project) => (
                    <Link
                      key={project.id}
                      href={`/project/${project.id}`}
                      className={`nav-sub-item ${
                        pathname === `/project/${project.id}` ? "active" : ""
                      }`}
                    >
                      <FileText size={14} />
                      <span>{project.name}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Recent */}
            <div className="nav-group-collapsible pointer-events-auto">
              <div
                className={`nav-item flex items-stretch p-0 overflow-hidden ${
                  currentView === "recent" ? "active" : ""
                } ${recentExpanded ? "expanded" : ""}`}
              >
                <Link
                  href="/home?view=recent"
                  className="flex-1 flex items-center gap-3 px-3 py-2.5 text-inherit no-underline"
                  title={isCollapsed ? dict.dashboard.recent || "Recent" : ""}
                >
                  <Clock size={20} />
                  {!isCollapsed && (
                    <span>{dict.dashboard.recent || "Recent"}</span>
                  )}
                </Link>
                {!isCollapsed && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const next = !recentExpanded;
                      setRecentExpanded(next);
                      localStorage.setItem("recentExpanded", String(next));
                    }}
                    className="pr-3 flex items-center justify-center"
                  >
                    <ChevronDown
                      size={14}
                      className="nav-item-expand transition-transform duration-200"
                    />
                  </button>
                )}
              </div>
              {!isCollapsed && recentExpanded && (
                <div className="nav-sub-group">
                  {sidebarRecent.length === 0 && (
                    <div className="nav-sub-empty">
                      {dict.dashboard.emptyRecent}
                    </div>
                  )}
                  {sidebarRecent.map((project) => (
                    <Link
                      key={project.id}
                      href={`/project/${project.id}`}
                      className={`nav-sub-item ${
                        pathname === `/project/${project.id}` ? "active" : ""
                      }`}
                    >
                      <FileText size={14} />
                      <span>{project.name}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Starred */}
            <div className="nav-group-collapsible pointer-events-auto">
              <div
                className={`nav-item flex items-stretch p-0 overflow-hidden ${
                  currentView === "starred" ? "active" : ""
                } ${starredExpanded ? "expanded" : ""}`}
              >
                <Link
                  href="/home?view=starred"
                  className="flex-1 flex items-center gap-3 px-3 py-2.5 text-inherit no-underline"
                  title={isCollapsed ? dict.dashboard.starred || "Starred" : ""}
                >
                  <Star size={20} />
                  {!isCollapsed && (
                    <span>{dict.dashboard.starred || "Starred"}</span>
                  )}
                </Link>
                {!isCollapsed && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const next = !starredExpanded;
                      setStarredExpanded(next);
                      localStorage.setItem("starredExpanded", String(next));
                    }}
                    className="pr-3 flex items-center justify-center"
                  >
                    <ChevronDown
                      size={14}
                      className="nav-item-expand transition-transform duration-200"
                    />
                  </button>
                )}
              </div>
              {!isCollapsed && starredExpanded && (
                <div className="nav-sub-group">
                  {sidebarStarred.length === 0 && (
                    <div className="nav-sub-empty">
                      {dict.dashboard.emptyStarred}
                    </div>
                  )}
                  {sidebarStarred.map((item) =>
                    item.type === "folder" ? (
                      <div key={`folder-${item.id}`}>
                        <div
                          className={`nav-sub-item nav-sub-folder-row ${
                            currentFolderId === item.id ? "active" : ""
                          }`}
                        >
                          <Link
                            href={`/home?folderId=${item.id}`}
                            className="nav-sub-folder-link"
                          >
                            <Folder size={14} />
                            <span>{item.name}</span>
                          </Link>
                          <button
                            onClick={(e) =>
                              handleFolderToggle("starred", e, item.id)
                            }
                            className="nav-sub-folder-button"
                          >
                            <ChevronDown
                              size={12}
                              className={`transition-transform duration-200 ${
                                isFolderExpanded("starred", item.id)
                                  ? ""
                                  : "-rotate-90"
                              }`}
                            />
                          </button>
                        </div>
                        {isFolderExpanded("starred", item.id) &&
                          folderProjects[item.id] &&
                          (folderProjects[item.id].length > 0 ? (
                            <div className="sidebar-folder-tree">
                              {folderProjects[item.id].map((project) => (
                                <Link
                                  key={project.id}
                                  href={`/project/${project.id}?folderId=${item.id}`}
                                  className={`nav-sub-item ${
                                    pathname === `/project/${project.id}` &&
                                    currentFolderId === item.id
                                      ? "active"
                                      : ""
                                  }`}
                                >
                                  <FileText size={12} />
                                  <span>{project.name}</span>
                                </Link>
                              ))}
                            </div>
                          ) : (
                            <div className="sidebar-folder-tree">
                              <div className="nav-sub-empty">
                                {dict.dashboard.emptyFolder}
                              </div>
                            </div>
                          ))}
                      </div>
                    ) : (
                      <Link
                        key={`project-${item.id}`}
                        href={
                          item.folderId
                            ? `/project/${item.id}?folderId=${item.folderId}`
                            : `/project/${item.id}`
                        }
                        className={`nav-sub-item ${
                          pathname === `/project/${item.id}` ? "active" : ""
                        }`}
                      >
                        <FileText size={14} />
                        <span>{item.name}</span>
                      </Link>
                    ),
                  )}
                </div>
              )}
            </div>

            {/* Trash */}
            <div
              className={`nav-item pointer-events-auto flex items-stretch p-0 overflow-hidden ${
                currentView === "trash" ? "active" : ""
              }`}
            >
              <Link
                href="/home?view=trash"
                className="flex-1 flex items-center gap-3 px-3 py-2.5 text-inherit no-underline"
                title={isCollapsed ? dict.dashboard.trash || "Trash" : ""}
              >
                <Trash2 size={20} />
                {!isCollapsed && <span>{dict.dashboard.trash || "Trash"}</span>}
              </Link>
            </div>

            <div
              className={`nav-item pointer-events-auto flex items-stretch p-0 overflow-hidden ${
                isActive("/integrations") ? "active" : ""
              }`}
            >
              <Link
                href="/integrations"
                className="flex-1 flex items-center gap-3 px-3 py-2.5 text-inherit no-underline"
                title={isCollapsed ? dict.management.integrations : ""}
              >
                <Grid2x2Plus size={20} />
                {!isCollapsed && <span>{dict.management.integrations}</span>}
              </Link>
            </div>

            {isAdminOrSuper && !isCollapsed && (
              <div className="nav-separator">
                <span>{dict.dashboard.teamManagement}</span>
              </div>
            )}

            {isAdminOrSuper && (
              <div
                className={`nav-item pointer-events-auto flex items-stretch p-0 overflow-hidden ${
                  isActive("/users") ? "active" : ""
                }`}
              >
                <Link
                  href="/users"
                  className="flex-1 flex items-center gap-3 px-3 py-2.5 text-inherit no-underline"
                  title={isCollapsed ? dict.dashboard.team : ""}
                >
                  <Users size={20} />
                  {!isCollapsed && <span>{dict.dashboard.team}</span>}
                </Link>
              </div>
            )}
            {isAdminOrSuper && (
              <div className="nav-group-collapsible pointer-events-auto">
                <div
                  className={`nav-item flex items-stretch p-0 overflow-hidden ${
                    isActive("/management") ? "active" : ""
                  } ${managementExpanded ? "expanded" : ""}`}
                >
                  <button
                    onClick={() => {
                      if (isCollapsed) {
                        router.push("/management#authentication");
                      } else {
                        const newState = !managementExpanded;
                        setManagementExpanded(newState);
                        localStorage.setItem(
                          "managementExpanded",
                          String(newState),
                        );
                      }
                    }}
                    className="flex-1 flex items-center gap-3 px-3 py-2.5 text-inherit no-underline"
                    title={isCollapsed ? dict.management.management : ""}
                  >
                    <Settings size={20} />
                    {!isCollapsed && <span>{dict.management.management}</span>}
                  </button>
                  {!isCollapsed && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const newState = !managementExpanded;
                        setManagementExpanded(newState);
                        localStorage.setItem(
                          "managementExpanded",
                          String(newState),
                        );
                      }}
                      className={`pr-3 flex items-center justify-center transition-colors ${
                        managementExpanded ? "expanded" : ""
                      }`}
                    >
                      <ChevronDown
                        size={14}
                        className="nav-item-expand transition-transform duration-200"
                      />
                    </button>
                  )}
                </div>
                {!isCollapsed && managementExpanded && (
                  <div className="nav-sub-group">
                    <a
                      href="/management#authentication"
                      className={`nav-sub-item ${
                        pathname === "/management" &&
                        (!currentHash || currentHash === "#authentication")
                          ? "active"
                          : ""
                      }`}
                      onClick={() => {
                        if (pathname === "/management") {
                          window.location.hash = "#authentication";
                        }
                      }}
                    >
                      <span>{dict.auth.authentication}</span>
                    </a>
                    <a
                      href="/management#sso"
                      className={`nav-sub-item ${
                        pathname === "/management" && currentHash === "#sso"
                          ? "active"
                          : ""
                      }`}
                      onClick={() => {
                        if (pathname === "/management") {
                          window.location.hash = "#sso";
                        }
                      }}
                    >
                      <span>{dict.management.ssoProviders}</span>
                    </a>
                    <a
                      href="/management#audit"
                      className={`nav-sub-item ${
                        pathname === "/management" && currentHash === "#audit"
                          ? "active"
                          : ""
                      }`}
                      onClick={() => {
                        if (pathname === "/management") {
                          window.location.hash = "#audit";
                        }
                      }}
                    >
                      <span>{dict.management.securityAudit}</span>
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        </nav>

        <footer className="sidebar-footer pointer-events-none">
          <div
            className={`flex items-center justify-between gap-4 pointer-events-none ${
              isCollapsed ? "flex-col" : ""
            }`}
          >
            {isCollapsed ? (
              <button
                onClick={() => setTheme(theme === "light" ? "dark" : "light")}
                className="theme-btn-collapsed pointer-events-auto"
                title={
                  theme === "light"
                    ? dict.layout.darkMode
                    : dict.layout.lightMode
                }
              >
                {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
              </button>
            ) : (
              <div className="theme-toggle pointer-events-auto">
                <button
                  onClick={() => setTheme("light")}
                  className={`theme-btn ${theme === "light" ? "active" : ""}`}
                  title={dict.layout.lightMode}
                >
                  <Sun size={16} />
                </button>
                <button
                  onClick={() => setTheme("dark")}
                  className={`theme-btn ${theme === "dark" ? "active" : ""}`}
                  title={dict.layout.darkMode}
                >
                  <Moon size={16} />
                </button>
              </div>
            )}

            <button
              onClick={() => setShowLogoutModal(true)}
              className="logout-btn-minimal pointer-events-auto"
              title={dict.auth.logout}
            >
              <LogOut size={18} />
            </button>
          </div>

          <Link
            href="/account"
            className={`sidebar-profile pointer-events-auto ${
              isActive("/account") ? "active" : ""
            }`}
            title={isCollapsed ? dict.layout.settings : ""}
          >
            <div className="sidebar-profile-avatar">
              <img
                src={getAvatarUrl(
                  user?.avatarUrl,
                  user?.username,
                  user?.updatedAt,
                )}
                alt=""
                className="img-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            {!isCollapsed && (
              <div className="sidebar-profile-info">
                <span className="sidebar-profile-name">
                  {user?.displayName ||
                    user?.username ||
                    dict.account.defaultUsername}
                </span>
                <span className="sidebar-profile-email">
                  {user?.username ? `@${user.username}` : "..."}
                </span>
              </div>
            )}
          </Link>
        </footer>
      </aside>

      {isInitialized &&
        createPortal(
          <button
            className={`sidebar-toggle-btn ${isCollapsed ? "collapsed" : ""}`}
            onClick={() => handleToggle(!isCollapsed)}
            title={
              isCollapsed
                ? dict.layout.expand || "Expand"
                : dict.layout.collapse || "Collapse"
            }
          >
            {isCollapsed ? (
              <PanelLeftOpen size={20} />
            ) : (
              <PanelLeftClose size={20} />
            )}
          </button>,
          document.getElementById("main-column-container")!,
        )}

      <Modal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        title={dict.auth.logoutConfirm}
        subtitle={dict.auth.logoutDescription}
      >
        <div className="modal-actions">
          <Button onClick={logout} noRipple className="btn-danger">
            {dict.auth.logout}
          </Button>
          <Button
            onClick={() => setShowLogoutModal(false)}
            noRipple
            className="btn-ghost"
          >
            {dict.common.cancel}
          </Button>
        </div>
      </Modal>
    </>
  );
}
