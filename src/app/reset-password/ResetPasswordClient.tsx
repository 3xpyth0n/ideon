"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useI18n } from "@providers/I18nProvider";
import { Button } from "@components/ui/Button";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";

export function ResetPasswordClient() {
  const { dict } = useI18n();
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error(dict.auth.passwordsDoNotMatch);
      return;
    }

    if (!identifier) {
      toast.error(
        dict.auth.identifierLabel
          ? `${dict.auth.identifierLabel} required`
          : "Email or Username required",
      );
      return;
    }

    if (password.length < 8) {
      toast.error(dict.auth.passwordTooShort);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, identifier }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to reset password");
      }

      if (data.error) {
        throw new Error(data.error);
      }

      toast.success(dict.auth.resetSuccess);
      toast.message(dict.auth.resetSuccessDescription);
      router.push("/login");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : dict.auth.invalidResetToken;
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) return null;

  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="text-center text-red-500 mb-4">
            {dict.auth.invalidResetToken}
          </div>
          <Button
            onClick={() => router.push("/login")}
            className="w-full btn-primary"
          >
            {dict.canvas.return}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <h1 className="auth-title">{dict.auth.resetPassword}</h1>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label className="auth-label">
              {dict.auth.identifierLabel || "Email or Username"}
            </label>
            <div className="auth-input-wrapper">
              <input
                className="auth-input"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={
                  dict.auth.identifierPlaceholder ||
                  "you@company.com or username"
                }
                required
                autoFocus
                autoComplete="username"
              />
            </div>
          </div>

          <div className="auth-field">
            <label className="auth-label">{dict.auth.password}</label>
            <div className="auth-input-wrapper">
              <input
                className="auth-input auth-input-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={dict.auth.passwordPlaceholder}
                required
                autoComplete="new-password"
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
            <label className="auth-label">{dict.auth.confirmPassword}</label>
            <div className="auth-input-wrapper">
              <input
                className="auth-input auth-input-password"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={dict.auth.passwordPlaceholder}
                required
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className="auth-actions">
            <div />
            <Button
              disabled={loading}
              type="submit"
              className="btn-primary auth-submit-btn"
            >
              {loading ? (
                <div className="loading-spinner border-background/30 border-t-background" />
              ) : (
                dict.auth.submit
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
