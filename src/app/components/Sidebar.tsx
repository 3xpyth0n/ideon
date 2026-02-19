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
} from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import { useUser } from "@providers/UserProvider";
import { getAvatarUrl } from "@lib/utils";
import { useTheme } from "@providers/ThemeProvider";
import { useState, useEffect } from "react";
import { Button } from "./ui/Button";
import { Modal } from "./ui/Modal";
import { useSearchParams } from "next/navigation";
import { VersionBadge } from "./VersionBadge";

interface SidebarProps {
  currentVersion?: string;
  initialCollapsed?: boolean;
  userRole?: string;
}

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

  const effectiveRole = user?.role || userRole;
  const isAdminOrSuper =
    effectiveRole === "admin" || effectiveRole === "superadmin";

  // Removed redundant fetchUser useEffect, using UserProvider instead
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);
  const [isInitialized, setIsInitialized] = useState(false);

  const [managementExpanded, setManagementExpanded] = useState(false);
  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const [currentHash, setCurrentHash] = useState("");

  useEffect(() => {
    try {
      const savedProjectsExpanded = localStorage.getItem("projectsExpanded");
      if (savedProjectsExpanded !== null) {
        setProjectsExpanded(savedProjectsExpanded === "true");
      }

      const savedManagementExpanded =
        localStorage.getItem("managementExpanded");
      if (savedManagementExpanded !== null) {
        setManagementExpanded(savedManagementExpanded === "true");
      }
    } catch {
      console.warn("LocalStorage unavailable");
    }
  }, []);

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentHash(window.location.hash);
    };

    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const initialCollapsed =
      root.getAttribute("data-sidebar-collapsed") === "true";

    if (initialCollapsed !== isCollapsed) {
      setIsCollapsed(initialCollapsed);
    }

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
  };

  const logout = async () => {
    await signOut({ callbackUrl: "/login" });
  };

  const isActive = (p: string) =>
    pathname === p || pathname.startsWith(`${p}/`);

  const toggleSidebar = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleToggle(!isCollapsed);
    }
  };

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
            <div className="nav-group-collapsible pointer-events-auto">
              <div
                className={`nav-item flex items-stretch p-0 overflow-hidden ${
                  pathname === "/home" && !currentView ? "active" : ""
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
                {!isCollapsed && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const newState = !projectsExpanded;
                      setProjectsExpanded(newState);
                      localStorage.setItem(
                        "projectsExpanded",
                        String(newState),
                      );
                    }}
                    className={`pr-3 flex items-center justify-center transition-colors ${
                      projectsExpanded ? "expanded" : ""
                    }`}
                  >
                    <ChevronDown
                      size={14}
                      className={`nav-item-expand transition-transform duration-200 ${
                        projectsExpanded ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                )}
              </div>
              {!isCollapsed && projectsExpanded && (
                <div className="nav-sub-group">
                  <Link
                    href="/home?view=my-projects"
                    className={`nav-sub-item ${
                      currentView === "my-projects" ? "active" : ""
                    }`}
                  >
                    <User size={16} />
                    <span>{dict.dashboard.myProjects || "My Projects"}</span>
                  </Link>
                  <Link
                    href="/home?view=shared"
                    className={`nav-sub-item ${
                      currentView === "shared" ? "active" : ""
                    }`}
                  >
                    <Share2 size={16} />
                    <span>{dict.dashboard.sharedWithMe || "Shared"}</span>
                  </Link>
                  <Link
                    href="/home?view=recent"
                    className={`nav-sub-item ${
                      currentView === "recent" ? "active" : ""
                    }`}
                  >
                    <Clock size={16} />
                    <span>{dict.dashboard.recent || "Recent"}</span>
                  </Link>
                  <Link
                    href="/home?view=starred"
                    className={`nav-sub-item ${
                      currentView === "starred" ? "active" : ""
                    }`}
                  >
                    <Star size={16} />
                    <span>{dict.dashboard.starred || "Starred"}</span>
                  </Link>
                  <Link
                    href="/home?view=trash"
                    className={`nav-sub-item ${
                      currentView === "trash" ? "active" : ""
                    }`}
                  >
                    <Trash2 size={16} />
                    <span>{dict.dashboard.trash || "Trash"}</span>
                  </Link>
                </div>
              )}
            </div>

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
                  }`}
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
                        className={`nav-item-expand transition-transform duration-200 ${
                          managementExpanded ? "rotate-180" : ""
                        }`}
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
                  {user?.email || "..."}
                </span>
              </div>
            )}
          </Link>
        </footer>
      </aside>

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
      </button>

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
