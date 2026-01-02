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
} from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import { useUser } from "@providers/UserProvider";
import { getAvatarUrl } from "@lib/utils";
import { useTheme } from "@providers/ThemeProvider";
import { useState, useEffect } from "react";
import { Button } from "./ui/Button";
import { Modal } from "./ui/Modal";

export function Sidebar() {
  const { dict } = useI18n();
  const { theme, setTheme } = useTheme();
  const { user } = useUser();
  const pathname = usePathname();
  const router = useRouter();

  // Removed redundant fetchUser useEffect, using UserProvider instead
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  const [managementExpanded, setManagementExpanded] = useState(false);
  const [currentHash, setCurrentHash] = useState("");

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
              <span className="sidebar-logo-text">{dict.title}</span>
            )}
          </div>
        </div>

        <nav className="nav-section pointer-events-none">
          <div className="nav-group pointer-events-none">
            <Link
              href="/home"
              className={`nav-item pointer-events-auto ${
                pathname === "/home" ? "active" : ""
              }`}
              title={isCollapsed ? dict.common.home : ""}
            >
              <House size={20} />
              {!isCollapsed && <span>{dict.common.home}</span>}
            </Link>
            {(user?.role === "superadmin" || user?.role === "admin") && (
              <Link
                href="/users"
                className={`nav-item pointer-events-auto ${
                  isActive("/users") ? "active" : ""
                }`}
                title={isCollapsed ? dict.common.team : ""}
              >
                <Users size={20} />
                {!isCollapsed && <span>{dict.common.team}</span>}
              </Link>
            )}
            {(user?.role === "superadmin" || user?.role === "admin") && (
              <div className="nav-group-collapsible pointer-events-auto">
                <button
                  onClick={() => {
                    if (isCollapsed) {
                      router.push("/management#authentication");
                    } else {
                      setManagementExpanded(!managementExpanded);
                    }
                  }}
                  className={`nav-item ${
                    isActive("/management") ? "active" : ""
                  } ${managementExpanded ? "expanded" : ""}`}
                  title={isCollapsed ? dict.common.management : ""}
                >
                  <Settings size={20} />
                  {!isCollapsed && (
                    <>
                      <span>{dict.common.management}</span>
                      <ChevronDown size={14} className="nav-item-expand" />
                    </>
                  )}
                </button>
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
                      onClick={(_e) => {
                        if (pathname === "/management") {
                          window.location.hash = "#authentication";
                        }
                      }}
                    >
                      <span>{dict.common.authentication}</span>
                    </a>
                    <a
                      href="/management#sso"
                      className={`nav-sub-item ${
                        pathname === "/management" && currentHash === "#sso"
                          ? "active"
                          : ""
                      }`}
                      onClick={(_e) => {
                        if (pathname === "/management") {
                          window.location.hash = "#sso";
                        }
                      }}
                    >
                      <span>{dict.common.ssoProviders}</span>
                    </a>
                    <a
                      href="/management#audit"
                      className={`nav-sub-item ${
                        pathname === "/management" && currentHash === "#audit"
                          ? "active"
                          : ""
                      }`}
                      onClick={(_e) => {
                        if (pathname === "/management") {
                          window.location.hash = "#audit";
                        }
                      }}
                    >
                      <span>{dict.common.securityAudit}</span>
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
                    ? dict.common.darkMode
                    : dict.common.lightMode
                }
              >
                {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
              </button>
            ) : (
              <div className="theme-toggle pointer-events-auto">
                <button
                  onClick={() => setTheme("light")}
                  className={`theme-btn ${theme === "light" ? "active" : ""}`}
                  title={dict.common.lightMode}
                >
                  <Sun size={16} />
                </button>
                <button
                  onClick={() => setTheme("dark")}
                  className={`theme-btn ${theme === "dark" ? "active" : ""}`}
                  title={dict.common.darkMode}
                >
                  <Moon size={16} />
                </button>
              </div>
            )}

            <button
              onClick={() => setShowLogoutModal(true)}
              className="logout-btn-minimal pointer-events-auto"
              title={dict.common.logout}
            >
              <LogOut size={18} />
            </button>
          </div>

          <Link
            href="/account"
            className={`sidebar-profile pointer-events-auto ${
              isActive("/account") ? "active" : ""
            }`}
            title={isCollapsed ? dict.common.settings : ""}
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
                    dict.common.defaultUsername}
                </span>
                <span className="sidebar-profile-email">
                  {user?.email || "..."}
                </span>
              </div>
            )}
          </Link>
        </footer>
      </aside>

      <Modal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        title={dict.common.logoutConfirm}
        subtitle={dict.common.logoutDescription}
      >
        <div className="modal-actions">
          <Button onClick={logout} noRipple className="btn-danger">
            {dict.common.logout}
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
