"use client";
import { useState, useEffect, useRef } from "react";
import { ChevronDown, Check, Camera, Loader2, Globe, X } from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import { useUser } from "@providers/UserProvider";
import { toast } from "sonner";
import { getAvatarUrl } from "@lib/utils";

export default function AccountPage() {
  const { dict, lang, setLang } = useI18n();
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      setUsername(user.username || "");
      setDisplayName(user.displayName || "");
      setEmail(user.email || "");
      setAvatarUrl(user.avatarUrl || null);
      setLoading(false);
    }
  }, [user]);

  // Removed direct fetch, using UserProvider instead

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
      await refreshUser(); // Update global user state
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
      await refreshUser(); // Update global user state
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
      toast(dict.common.passwordMismatch);
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

  if (loading) {
    return (
      <div className="island-content flex items-center justify-center">
        <p className="text-muted animate-pulse uppercase tracking-widest text-xs font-bold">
          {dict.common.loading}
        </p>
      </div>
    );
  }

  return (
    <div className="island-content">
      <div className="zen-container max-w-5xl py-12 animate-in fade-in duration-700">
        <header className="mb-12">
          <h1 className="zen-title text-2xl mb-1">{dict.common.settings}</h1>
          <p className="zen-subtitle text-sm opacity-40">
            {dict.common.accountSubtitle}
          </p>
        </header>

        <div className="flex flex-col gap-12">
          {/* Language Section */}
          <section className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-10 pb-12 border-b border-border/5">
            <div className="md:col-span-4">
              <h2 className="section-title mb-1">{dict.common.language}</h2>
              <p className="text-xs text-muted opacity-40 leading-relaxed">
                {dict.common.languageDescription}
              </p>
            </div>
            <div className="md:col-span-8 max-w-xs">
              <div className="custom-select">
                <button
                  onClick={() => setIsLangOpen(!isLangOpen)}
                  className="select-trigger h-11 px-0"
                >
                  <div className="flex items-center gap-3">
                    <Globe size={14} className="opacity-40" />
                    <span className="text-xs font-medium">
                      {lang === "en" ? dict.common.langEn : dict.common.langFr}
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
                  <div className="select-dropdown rounded-none overflow-hidden mt-2 border-border/10 bg-background/80 backdrop-blur-xl shadow-2xl">
                    <button
                      onClick={() => {
                        setLang("en");
                        setIsLangOpen(false);
                      }}
                      className="select-option py-3 px-4"
                    >
                      <span className="text-xs">{dict.common.langEn}</span>
                      {lang === "en" && (
                        <Check size={10} className="text-text-main" />
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setLang("fr");
                        setIsLangOpen(false);
                      }}
                      className="select-option py-3 px-4 border-t border-border/5"
                    >
                      <span className="text-xs">{dict.common.langFr}</span>
                      {lang === "fr" && (
                        <Check size={10} className="text-text-main" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Identity Section */}
          <section className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-10 pb-12 border-b border-border/5">
            <div className="md:col-span-4">
              <h2 className="section-title mb-1">{dict.common.identity}</h2>
              <p className="text-xs text-muted opacity-40 leading-relaxed">
                {dict.common.identityDescription}
              </p>
            </div>
            <div className="md:col-span-8">
              <div className="flex flex-col gap-10">
                {/* Avatar Row */}
                <div className="flex items-center gap-6">
                  <div className="relative group">
                    <div
                      onClick={handleAvatarClick}
                      className="w-20 h-20 rounded-none border border-border/10 overflow-hidden cursor-pointer hover:border-text-main/20 transition-all duration-500 flex items-center justify-center bg-border/5 relative"
                    >
                      <img
                        src={getAvatarUrl(avatarUrl, username)}
                        alt={dict.common.avatarAlt}
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
                        title={dict.common.deleteAvatar}
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
                    <p className="text-[11px] text-muted opacity-40 max-w-[200px]">
                      {dict.common.avatarHint}
                    </p>
                  </div>
                </div>

                {/* Profile Form */}
                <form
                  onSubmit={handleProfileUpdate}
                  className="flex flex-col gap-6 max-w-md"
                >
                  <div className="flex flex-col gap-2">
                    <label className="zen-label ml-0">
                      {dict.common.displayName}
                    </label>
                    <input
                      className="zen-input text-sm"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder={dict.common.displayNamePlaceholder}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="zen-label ml-0">
                      {dict.common.username}
                    </label>
                    <input
                      className="zen-input text-sm"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder={dict.common.usernamePlaceholder}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="zen-label ml-0">
                      {dict.common.email}
                    </label>
                    <input
                      className="zen-input text-sm"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={dict.common.emailPlaceholder}
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
          <section className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-10 pb-12 border-b border-border/5">
            <div className="md:col-span-4">
              <h2 className="section-title mb-1">{dict.common.security}</h2>
              <p className="text-xs text-muted opacity-40 leading-relaxed">
                {dict.common.securityDescription}
              </p>
            </div>
            <div className="md:col-span-8 max-w-md">
              <form
                onSubmit={handlePasswordUpdate}
                className="flex flex-col gap-6"
              >
                <div className="flex flex-col gap-2">
                  <label className="zen-label ml-0">
                    {dict.common.newPassword}
                  </label>
                  <input
                    type="password"
                    className="zen-input text-sm"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={dict.common.passwordPlaceholder}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="zen-label ml-0">
                    {dict.common.confirmPassword}
                  </label>
                  <input
                    type="password"
                    className="zen-input text-sm"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={dict.common.passwordPlaceholder}
                  />
                </div>
                <div className="pt-2">
                  <button type="submit" className="btn-primary">
                    {dict.common.rotatePassword}
                  </button>
                </div>
              </form>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
