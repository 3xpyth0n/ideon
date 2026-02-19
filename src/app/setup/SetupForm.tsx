"use client";
import React, { useState, useEffect } from "react";
import { setupAction } from "./setupActions";
import { useI18n } from "@providers/I18nProvider";
import { ThemeSwitch } from "@components/ThemeSwitch";
import { LanguageSelect } from "./components/LanguageSelect";
import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@components/ui/Button";
import { toast } from "sonner";

export function SetupForm() {
  const { dict } = useI18n();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error(dict.auth.invalidEmail);
      setBusy(false);
      return;
    }

    if (!username.trim()) {
      toast.error(dict.auth.usernameRequired);
      setBusy(false);
      return;
    }

    if (password !== confirm) {
      toast.error(dict.auth.passwordMismatch);
      setBusy(false);
      return;
    }
    const ok = await setupAction({ email, username, password });
    setBusy(false);
    if (ok) {
      router.replace("/login?setupSuccess=true");
      return;
    }
    toast.error(dict.setup.errorInit);
  };

  if (!mounted) {
    return (
      <div className="auth-initializing-container">
        <div className="auth-initializing-text">{dict.common.loading}</div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      {/* Top Left Logo */}
      <div
        className="auth-logo-container"
        onClick={() => router.push("/login")}
      >
        <div className="auth-logo-img">
          <img
            src="/light-icon.png"
            className="auth-logo-layer light"
            alt={dict.title}
          />
          <img
            src="/dark-icon.png"
            className="auth-logo-layer dark"
            alt={dict.title}
          />
        </div>
      </div>

      {/* Theme Switch */}
      <div style={{ position: "absolute", top: "2.5rem", right: "2.5rem" }}>
        <ThemeSwitch />
      </div>

      <div className="auth-card">
        <div className="auth-header">
          <h1 className="auth-title">{dict.setup.setupTitle}</h1>
          <p className="auth-subtitle">{dict.setup.setupSubtitle}</p>
        </div>

        <form onSubmit={onSubmit} noValidate className="auth-form">
          <div className="auth-field">
            <label className="auth-label">{dict.auth.email}</label>
            <input
              className="auth-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={dict.blocks.emailPlaceholder}
              required
            />
          </div>

          <div className="auth-field">
            <label className="auth-label">{dict.auth.username}</label>
            <input
              className="auth-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={dict.auth.usernamePlaceholder}
              required
            />
          </div>

          <div className="auth-field">
            <label className="auth-label">{dict.auth.password}</label>
            <div className="auth-input-wrapper">
              <input
                className="auth-input auth-input-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((s) => !s)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="auth-field">
            <label className="auth-label">{dict.auth.confirmPassword}</label>
            <div className="auth-input-wrapper">
              <input
                className="auth-input auth-input-password"
                type={showConfirm ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowConfirm((s) => !s)}
                tabIndex={-1}
              >
                {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="auth-actions">
            <LanguageSelect />
            <Button
              disabled={busy}
              type="submit"
              className="btn-primary auth-submit-btn"
            >
              {busy ? dict.common.loading : dict.auth.submit}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
