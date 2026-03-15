"use client";
import { useState, useEffect, useRef } from "react";
import {
  ChevronDown,
  Check,
  Camera,
  Loader2,
  Globe,
  X,
  BadgeInfo,
  Keyboard,
} from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import { useUser } from "@providers/UserProvider";
import { toast } from "sonner";
import { getAvatarUrl } from "@lib/utils";
import { GitTokenManager } from "@components/account/GitTokenManager";
import { Modal } from "@components/ui/Modal";
import { ideonSiteConfig } from "@lib/site-config";

export default function AccountPage() {
  const { dict, lang, setLang, availableLanguages } = useI18n();
  const { user, refreshUser } = useUser();
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLangOpen, setIsLangOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [vimMode, setVimMode] = useState(false);
  const [currentVersion, setCurrentVersion] = useState("0.0.0");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeId, setActiveId] = useState<string | null>(null);

  // Table of contents items
  const toc = [
    { id: "language", label: dict.account.language },
    { id: "identity", label: dict.account.identity },
    { id: "security", label: dict.account.security },
    { id: "git-tokens", label: dict.gitTokens.title },
    { id: "vim-mode", label: dict.account.vimMode },
  ];

  const isScrollingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleTocClick = (id: string) => {
    isScrollingRef.current = true;
    setActiveId(id);

    if (id === toc[0].id && containerRef.current) {
      containerRef.current.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Release lock after animation
    timeoutRef.current = setTimeout(() => {
      isScrollingRef.current = false;
    }, 1000);
  };

  useEffect(() => {
    if (loading || !containerRef.current) return;

    const container = containerRef.current;
    const ids = toc.map((t) => t.id);
    const sections = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    if (sections.length === 0) return;

    // Track visibility of all sections to determine the active one
    const visibilityMap = new Map<string, IntersectionObserverEntry>();

    const observer = new IntersectionObserver(
      (entries) => {
        if (isScrollingRef.current) return;

        entries.forEach((entry) => {
          visibilityMap.set(entry.target.id, entry);
        });

        let maxIntersectHeight = 0;
        let visibleId: string | null = null;

        ids.forEach((id) => {
          const entry = visibilityMap.get(id);
          if (entry && entry.isIntersecting) {
            const height = entry.intersectionRect.height;
            if (height > maxIntersectHeight) {
              maxIntersectHeight = height;
              visibleId = id;
            }
          }
        });

        if (visibleId) {
          setActiveId(visibleId);
        }
      },
      {
        root: null,
        rootMargin: "-10% 0px -70% 0px",
        threshold: Array.from({ length: 11 }, (_, i) => i * 0.1),
      },
    );

    sections.forEach((s) => observer.observe(s));

    const handleScroll = () => {
      if (isScrollingRef.current) return;

      const scrollTop = container.scrollTop;
      const clientHeight = container.clientHeight;
      const scrollHeight = container.scrollHeight;

      // If at the very top, force first section
      if (scrollTop < 50) {
        setActiveId(ids[0]);
        return;
      }

      if (Math.abs(scrollHeight - clientHeight - scrollTop) < 5) {
        setActiveId(ids[ids.length - 1]);
        return;
      }
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      observer.disconnect();
      container.removeEventListener("scroll", handleScroll);
    };
  }, [dict, loading]);

  useEffect(() => {
    fetch("/api/system/current-version")
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.version === "string" && data.version.length > 0) {
          setCurrentVersion(data.version);
        }
      })
      .catch(() => {
        setCurrentVersion("0.0.0");
      });
  }, []);

  useEffect(() => {
    if (user) {
      setUsername(user.username || "");
      setDisplayName(user.displayName || "");
      setEmail(user.email || "");
      setAvatarUrl(user.avatarUrl || null);
      setVimMode(user.vimMode || false);
      setLoading(false);
    }
  }, [user]);

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    setUploading(true);

    try {
      const res = await fetch("/api/account/avatar", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error();

      const data = await res.json();
      setAvatarUrl(data.avatarUrl);
      toast(dict.common.success);
      await refreshUser();
      window.dispatchEvent(new CustomEvent("user-data-updated"));
    } catch {
      toast(dict.common.error);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteAvatar = async () => {
    setUploading(true);
    try {
      const res = await fetch("/api/account/avatar", {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      setAvatarUrl(null);
      toast(dict.common.success);
      await refreshUser();
      window.dispatchEvent(new CustomEvent("user-data-updated"));
    } catch {
      toast(dict.common.error);
    } finally {
      setUploading(false);
    }
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, displayName, email }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || dict.common.error);
      }

      toast(dict.common.success);
      window.dispatchEvent(new CustomEvent("user-data-updated"));
    } catch (error) {
      toast(
        error instanceof Error ? error.message : (dict.common.error as string),
      );
    }
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast(dict.auth.passwordMismatch);
      return;
    }
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) throw new Error();
      toast(dict.common.success);
      setPassword("");
      setConfirmPassword("");
    } catch {
      toast(dict.common.error);
    }
  };

  const handleVimModeToggle = async () => {
    const newValue = !vimMode;
    setVimMode(newValue);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vimMode: newValue }),
      });
      if (!res.ok) throw new Error();
      toast(dict.common.success);
      await refreshUser();
      window.dispatchEvent(new CustomEvent("user-data-updated"));
    } catch {
      setVimMode(!newValue);
      toast(dict.common.error);
    }
  };

  if (loading) {
    return (
      <div className="island-content flex items-center justify-center">
        <p className="text-muted animate-pulse uppercase tracking-widest text-xs font-bold">
          {dict.common.loading}
        </p>
      </div>
    );
  }

  const copyrightText = `© ${new Date().getFullYear()} ${
    ideonSiteConfig.creator.name
  }`;

  return (
    <div className="island-content relative pt-0!" ref={containerRef}>
      <div className="zen-container max-w-5xl py-12 animate-in fade-in duration-700">
        <header className="mb-8 mt-12">
          <h1 className="zen-title text-2xl mb-1">{dict.layout.settings}</h1>
          <p className="zen-subtitle text-sm opacity-40">
            {dict.account.accountSubtitle}
          </p>
        </header>

        <div className="account-tabs-nav">
          {toc.map((item) => (
            <button
              key={item.id}
              onClick={() => handleTocClick(item.id)}
              className={`management-tab-btn ${
                activeId === item.id ? "active" : ""
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-12">
          {/* Language Section */}
          <section
            id="language"
            className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-10 pb-12 scroll-mt-24"
          >
            <div className="md:col-span-4">
              <h2 className="section-title mb-1">{dict.account.language}</h2>
              <p className="text-xs text-muted opacity-40 leading-relaxed">
                {dict.account.languageDescription}
              </p>
            </div>
            <div className="md:col-span-8 w-full sm:w-auto">
              <div className="custom-select w-full sm:w-auto">
                <button
                  onClick={() => setIsLangOpen(!isLangOpen)}
                  className="select-trigger h-11 px-0"
                >
                  <div className="flex items-center gap-3">
                    <Globe size={14} className="opacity-40" />
                    <span className="text-xs font-medium">
                      {availableLanguages.find((l) => l.code === lang)?.label ||
                        lang}
                    </span>
                  </div>
                  <ChevronDown
                    size={12}
                    className={`transition-transform duration-300 opacity-40 ${
                      isLangOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {isLangOpen && (
                  <div className="select-dropdown absolute top-full left-0 z-100 w-full mt-2 rounded-none overflow-hidden border-border/10 bg-background/80 backdrop-blur-xl shadow-2xl">
                    {availableLanguages.map((l, index) => (
                      <button
                        key={l.code}
                        onClick={() => {
                          setLang(l.code);
                          setIsLangOpen(false);
                        }}
                        className={`select-option py-3 px-4 ${
                          index > 0 ? "border-t border-border/5" : ""
                        }`}
                      >
                        <span className="text-xs">{l.label}</span>
                        {lang === l.code && (
                          <Check size={10} className="text-text-main" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Identity Section */}
          <section
            id="identity"
            className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-10 pb-12 scroll-mt-24"
          >
            <div className="md:col-span-4">
              <h2 className="section-title mb-1">{dict.account.identity}</h2>
              <p className="text-xs text-muted opacity-40 leading-relaxed">
                {dict.account.identityDescription}
              </p>
            </div>
            <div className="md:col-span-8">
              <div className="flex flex-col gap-10">
                {/* Avatar Row */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
                  <div className="relative group">
                    <div
                      onClick={handleAvatarClick}
                      className="w-20 h-20 rounded-none border border-border/10 overflow-hidden cursor-pointer hover:border-text-main/20 transition-all duration-500 flex items-center justify-center bg-border/5 relative"
                    >
                      <img
                        src={getAvatarUrl(avatarUrl, username)}
                        alt={dict.account.avatarAlt}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />

                      <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center">
                        {uploading ? (
                          <Loader2
                            size={16}
                            className="text-text-main animate-spin"
                          />
                        ) : (
                          <Camera size={16} className="text-text-main" />
                        )}
                      </div>
                    </div>

                    {avatarUrl && !uploading && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAvatar();
                        }}
                        className="avatar-remove-btn"
                        title={dict.account.deleteAvatar}
                      >
                        <X size={12} strokeWidth={2.5} />
                      </button>
                    )}

                    <input
                      type="file"
                      ref={fileInputRef}
                      style={{ display: "none" }}
                      accept="image/*"
                      onChange={handleFileChange}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <p className="text-[11px] text-muted opacity-40 max-w-50 leading-relaxed">
                      {dict.account.avatarHint}
                    </p>
                  </div>
                </div>

                {/* Profile Form */}
                <form
                  onSubmit={handleProfileUpdate}
                  className="flex flex-col gap-6 w-full max-w-md"
                >
                  <div className="flex flex-col gap-2">
                    <label className="zen-label ml-0">
                      {dict.account.displayName}
                    </label>
                    <input
                      className="zen-input text-sm"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder={dict.account.displayNamePlaceholder}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="zen-label ml-0">
                      {dict.auth.username}
                    </label>
                    <input
                      className="zen-input text-sm"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder={dict.auth.usernamePlaceholder}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="zen-label ml-0">{dict.auth.email}</label>
                    <input
                      className="zen-input text-sm"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={dict.blocks.emailPlaceholder}
                    />
                  </div>
                  <div className="pt-2">
                    <button
                      type="submit"
                      className="zen-button h-11 px-8 text-xs font-bold shadow-sm"
                    >
                      {dict.common.save}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </section>

          {/* Security Section */}
          <section
            id="security"
            className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-10 pb-12 scroll-mt-24"
          >
            <div className="md:col-span-4">
              <h2 className="section-title mb-1">{dict.account.security}</h2>
              <p className="text-xs text-muted opacity-40 leading-relaxed">
                {dict.account.securityDescription}
              </p>
            </div>
            <div className="md:col-span-8 w-full max-w-md">
              <form
                onSubmit={handlePasswordUpdate}
                className="flex flex-col gap-6 w-full"
              >
                <div className="flex flex-col gap-2">
                  <label className="zen-label ml-0">
                    {dict.account.newPassword}
                  </label>
                  <input
                    type="password"
                    className="zen-input text-sm"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={dict.auth.passwordPlaceholder}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="zen-label ml-0">
                    {dict.auth.confirmPassword}
                  </label>
                  <input
                    type="password"
                    className="zen-input text-sm"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={dict.auth.passwordPlaceholder}
                  />
                </div>
                <div className="pt-2">
                  <button type="submit" className="btn-primary">
                    {dict.account.rotatePassword}
                  </button>
                </div>
              </form>
            </div>
          </section>

          {/* Git Tokens Section */}
          <section
            id="git-tokens"
            className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-10 pb-12 scroll-mt-24"
          >
            <div className="md:col-span-4">
              <h2 className="section-title mb-1">{dict.gitTokens.title}</h2>
              <p className="text-xs text-muted opacity-40 leading-relaxed">
                {dict.gitTokens.description}
              </p>
            </div>
            <div className="md:col-span-8 max-w-md">
              <GitTokenManager />
            </div>
          </section>

          {/* Vim Mode Section */}
          <section
            id="vim-mode"
            className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-10 pb-12 scroll-mt-24"
          >
            <div className="md:col-span-4">
              <h2 className="section-title mb-1">{dict.account.vimMode}</h2>
              <p className="text-xs text-muted opacity-40 leading-relaxed">
                {dict.account.vimModeDescription}
              </p>
            </div>
            <div className="md:col-span-8 max-w-md">
              <div className="flex items-center justify-between p-3 border border-border/10 rounded-lg bg-background/50 hover:bg-background/80 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="text-muted-foreground">
                    <Keyboard className="w-5 h-5" />
                  </div>
                  <div className="font-medium text-sm flex items-center gap-2">
                    {dict.account.vimMode}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">
                    {vimMode ? dict.common.enabled : dict.common.disabled}
                  </span>
                  <button
                    type="button"
                    className={`zen-switch-small ${vimMode ? "active" : ""}`}
                    onClick={handleVimModeToggle}
                  >
                    <div className="switch-thumb" />
                  </button>
                </div>
              </div>
            </div>
          </section>

          <div className="account-about-trigger-wrap">
            <button
              type="button"
              className="about-trigger-btn"
              onClick={() => setIsAboutOpen(true)}
            >
              <BadgeInfo size={14} />
              <span>{dict.account.aboutButton}</span>
            </button>
          </div>
        </div>
      </div>

      <Modal
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
        title={dict.account.aboutTitle}
        subtitle={dict.account.aboutSubtitle}
        className="about-modal"
      >
        <div className="about-modal-content">
          <div className="about-section">
            <h3 className="about-section-title">
              {dict.account.aboutSectionInfo}
            </h3>
            <div className="about-meta-grid">
              <p className="about-meta-item">
                <span className="about-meta-label">
                  {dict.account.aboutAppNameLabel}
                </span>
                <span className="about-meta-value">{ideonSiteConfig.name}</span>
              </p>
              <p className="about-meta-item">
                <span className="about-meta-label">
                  {dict.account.aboutCreatorLabel}
                </span>
                <span className="about-meta-value">
                  {ideonSiteConfig.creator.name}
                </span>
              </p>
              <p className="about-meta-item">
                <span className="about-meta-label">
                  {dict.account.aboutVersionLabel}
                </span>
                <span className="about-meta-value">v{currentVersion}</span>
              </p>
              <p className="about-meta-item">
                <span className="about-meta-label">
                  {dict.account.aboutLicenseLabel}
                </span>
                <span className="about-meta-value">
                  {ideonSiteConfig.license}
                </span>
              </p>
              <p className="about-meta-item">
                <span className="about-meta-label">
                  {dict.account.aboutCopyrightLabel}
                </span>
                <span className="about-meta-value">{copyrightText}</span>
              </p>
            </div>
          </div>

          <div className="about-section">
            <h3 className="about-section-title">
              {dict.account.aboutSectionLinks}
            </h3>
            <div className="about-actions-grid">
              <a
                className="btn-ghost about-action-link"
                href={ideonSiteConfig.links.repository}
                target="_blank"
                rel="noopener noreferrer"
              >
                {dict.account.aboutOpenRepository}
              </a>
              <a
                className="btn-ghost about-action-link"
                href={ideonSiteConfig.links.website}
                target="_blank"
                rel="noopener noreferrer"
              >
                {dict.account.aboutOpenWebsite}
              </a>
              <a
                className="btn-ghost about-action-link"
                href={ideonSiteConfig.links.documentation}
                target="_blank"
                rel="noopener noreferrer"
              >
                {dict.account.aboutOpenDocumentation}
              </a>
              <a
                className="btn-ghost about-action-link"
                href={ideonSiteConfig.links.issues}
                target="_blank"
                rel="noopener noreferrer"
              >
                {dict.account.aboutOpenIssue}
              </a>
              <a
                className="btn-ghost about-action-link"
                href={`mailto:${ideonSiteConfig.contact.email}`}
              >
                {dict.account.aboutSendEmail}
              </a>
              <a
                className="btn-ghost about-action-link"
                href={ideonSiteConfig.links.changelog}
                target="_blank"
                rel="noopener noreferrer"
              >
                {dict.account.aboutViewChangelog}
              </a>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
