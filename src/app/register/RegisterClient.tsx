"use client";
import React, { useState, useEffect } from "react";
import { useI18n } from "@providers/I18nProvider";
import { LanguageSelect } from "@setup/components/LanguageSelect";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@components/ui/Button";
import { toast } from "sonner";

export function RegisterClient() {
  const { dict } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [validToken, setValidToken] = useState(false);
  const [publicRegistration, setPublicRegistration] = useState(false);

  useEffect(() => {
    setMounted(true);

    const checkSettings = async () => {
      try {
        const res = await fetch("/api/auth/settings");
        const data = await res.json();
        setPublicRegistration(data.publicRegistrationEnabled);

        if (!token) {
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to fetch auth settings", err);
        if (!token) {
          setLoading(false);
        }
      }
    };

    checkSettings();

    if (!token) {
      return;
    }

    fetch(`/api/auth/invite?token=${token}`)
      .then((res) => {
        if (res.ok) {
          return res.json();
        }
        throw new Error("Invalid token");
      })
      .then((data) => {
        setEmail(data.email);
        setValidToken(true);
      })
      .catch(() => {
        setValidToken(false);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);

    if (password !== confirm) {
      toast.error(dict.common.passwordMismatch);
      setBusy(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: token || undefined,
          email: token ? undefined : email,
          username,
          password,
        }),
      });

      if (res.ok) {
        router.push("/login?registered=true");
      } else {
        const data = await res.json();
        toast.error(data.error || dict.common.error);
      }
    } catch (_err) {
      toast.error(dict.common.error);
    } finally {
      setBusy(false);
    }
  };

  if (!mounted || loading) {
    return (
      <div className="auth-page flex items-center justify-center">
        <Loader2 className="animate-spin text-white/50" size={32} />
      </div>
    );
  }

  const canRegister = token ? validToken : publicRegistration;

  if (!canRegister) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-header">
            <h1 className="auth-title">{dict.common.invalidInvitationTitle}</h1>
            <p className="auth-subtitle">
              {dict.common.invalidInvitationSubtitle}
            </p>
          </div>
          <div className="auth-footer flex justify-center mt-6">
            <button
              className="auth-footer-link"
              onClick={() => router.push("/login")}
            >
              {dict.common.backToLogin}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div
        className="auth-logo-container"
        onClick={() => router.push("/login")}
      >
        <img src="/dark-icon.png" className="auth-logo-img" alt={dict.title} />
        <span className="auth-logo-text">{dict.title}</span>
      </div>

      <div className="auth-card">
        <div className="auth-header">
          <h1 className="auth-title">
            {dict.common.completeRegistrationTitle}
          </h1>
          <p className="auth-subtitle">
            {dict.common.completeRegistrationSubtitle}
          </p>
        </div>

        <form onSubmit={onSubmit} className="auth-form">
          <div className="auth-field">
            <label className="auth-label">{dict.common.email}</label>
            <input
              className={`auth-input ${token ? "opacity-50" : ""}`}
              value={email}
              onChange={(e) => !token && setEmail(e.target.value)}
              readOnly={!!token}
              required
              type="email"
            />
          </div>

          <div className="auth-field">
            <label className="auth-label">{dict.common.username}</label>
            <input
              className="auth-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={dict.common.usernamePlaceholder}
              required
            />
          </div>

          <div className="auth-field">
            <label className="auth-label">{dict.common.password}</label>
            <div className="auth-input-wrapper">
              <input
                className="auth-input auth-input-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="auth-field">
            <label className="auth-label">{dict.common.confirmPassword}</label>
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
                onClick={() => setShowConfirm(!showConfirm)}
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
              {busy ? (
                <div className="w-4 h-4 border-2 border-background/30 border-t-background animate-spin" />
              ) : (
                dict.common.register
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
