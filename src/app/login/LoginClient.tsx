"use client";
import React, { useState, useEffect } from "react";
import { useI18n } from "@providers/I18nProvider";
import { useUser } from "@providers/UserProvider";
import { LanguageSelect } from "@setup/components/LanguageSelect";
import { Eye, EyeOff } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@components/ui/Button";
import { toast } from "sonner";

export function LoginClient() {
  const { dict } = useI18n();
  const { refreshUser } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [magicEmail, setMagicEmail] = useState("");
  const [sendingMagic, setSendingMagic] = useState(false);
  const [showMagicInput, setShowMagicInput] = useState(false);
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [settings, setSettings] = useState<{
    passwordLoginEnabled: boolean;
    publicRegistrationEnabled: boolean;
    authProviders: Record<
      string,
      { enabled: boolean; clientId?: string; issuer?: string }
    >;
  }>({
    passwordLoginEnabled: true,
    publicRegistrationEnabled: false,
    authProviders: {},
  });

  useEffect(() => {
    setMounted(true);
    fetch("/api/auth/settings")
      .then((res) => {
        if (!res.ok) throw new Error(dict.auth.failedToFetchSettings);
        return res.json();
      })
      .then((data) => {
        if (data && typeof data === "object") {
          setSettings(data);
        }
      })
      .catch((err) => {
        console.error("Auth settings error:", err);
      })
      .finally(() => setLoading(false));
  }, [dict.auth.failedToFetchSettings]);

  useEffect(() => {
    if (!mounted) return;

    const params = new URLSearchParams(window.location.search);
    const setupSuccess = params.get("setupSuccess") === "true";
    const regDisabled = params.get("error") === "registrationDisabled";
    const accessDenied = params.get("error") === "AccessDenied";

    if (setupSuccess) {
      toast.success(dict.common.setupSuccess);
    } else if (regDisabled) {
      toast.error(dict.common.registrationDisabledError);
    } else if (accessDenied) {
      toast.error(dict.common.accessDenied || "Access Denied");
    }

    if (setupSuccess || regDisabled || accessDenied) {
      // Clear URL
      const url = new URL(window.location.href);
      url.searchParams.delete("setupSuccess");
      url.searchParams.delete("error");
      window.history.replaceState({}, "", url.toString());
    }
  }, [
    mounted,
    dict.common.setupSuccess,
    dict.common.registrationDisabledError,
    dict.common.accessDenied,
  ]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);

    const res = await signIn("credentials", {
      identifier,
      password,
      redirect: false,
    });

    setBusy(false);

    if (res?.error) {
      if (res.error === "too_many_requests") {
        toast.error(dict.common.tooManyRequests);
      } else {
        toast.error(dict.common.invalidCredentials);
      }
      return;
    }

    await refreshUser();
    router.replace("/home");
  };

  const onForgotPassword = async () => {
    if (!identifier) {
      toast.error(
        dict.common.identifierLabel
          ? `${dict.common.identifierLabel} required`
          : "Email or Username required",
      );
      return;
    }

    setForgotPasswordLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      });
      // Always show success to prevent enumeration
      toast.success(dict.auth.emailSent);
      toast.message(dict.auth.emailSentDescription);
    } catch {
      toast.error(dict.common.error || "An error occurred");
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  const onMagicLinkRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!magicEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(magicEmail)) {
      toast.error(dict.common.invalidEmail);
      return;
    }

    setSendingMagic(true);
    try {
      const res = await signIn("email", {
        email: magicEmail,
        redirect: false,
      });

      if (res?.ok && !res?.error) {
        toast.success(dict.common.magicLinkSent);
        setShowMagicInput(false);
        setMagicEmail("");
      } else {
        toast.error(dict.common.magicLinkError);
      }
    } catch (_err) {
      toast.error(dict.common.magicLinkError);
    } finally {
      setSendingMagic(false);
    }
  };

  useEffect(() => {
    const error = searchParams.get("error");
    if (error) {
      if (error === "invalidToken") {
        toast.error(dict.common.invalidToken || "Invalid or expired link");
      } else if (error === "internalError") {
        toast.error(dict.common.magicLinkError);
      }
    }
  }, [searchParams, dict]);

  if (!mounted || loading) {
    return (
      <div className="auth-initializing-container">
        <div className="auth-initializing-text">{dict.common.loading}</div>
      </div>
    );
  }

  const enabledProviders = Object.keys(settings?.authProviders || {});

  return (
    <div className="auth-page">
      {/* Top Left Logo */}
      <div
        className="auth-logo-container"
        onClick={() => router.push("/login")}
      >
        <img src="/dark-icon.png" className="auth-logo-img" alt={dict.title} />
        <span className="auth-logo-text">{dict.title}</span>
      </div>

      <div className="auth-card">
        <div className="auth-header">
          <h1 className="auth-title">{dict.common.loginTitle}</h1>
        </div>

        {settings.passwordLoginEnabled && (
          <form onSubmit={onSubmit} noValidate className="auth-form">
            <div className="auth-field">
              <label className="auth-label">
                {dict.common.identifierLabel}
              </label>
              <input
                className="auth-input"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={dict.common.identifierPlaceholder}
                autoComplete="username"
                required
              />
            </div>

            <div className="auth-field">
              <label className="auth-label">{dict.common.password}</label>
              <div className="auth-input-wrapper">
                <input
                  className="auth-input auth-input-password"
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={dict.common.passwordPlaceholder}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="auth-actions">
              <button
                type="button"
                onClick={onForgotPassword}
                disabled={forgotPasswordLoading || busy}
                className="forgot-password-link"
              >
                {forgotPasswordLoading ? (
                  <div className="w-4 h-4 border-2 border-foreground/30 border-t-foreground animate-spin" />
                ) : (
                  dict.auth.forgotPassword
                )}
              </button>

              <div className="flex items-center gap-2">
                <LanguageSelect />
                <Button
                  disabled={busy || forgotPasswordLoading}
                  type="submit"
                  className="btn-primary auth-submit-btn"
                >
                  {busy ? (
                    <div className="w-4 h-4 border-2 border-background/30 border-t-background animate-spin" />
                  ) : (
                    dict.common.login
                  )}
                </Button>
              </div>
            </div>
          </form>
        )}

        {settings.passwordLoginEnabled && enabledProviders.length > 0 && (
          <div className="auth-divider">
            <span>{dict.common.or}</span>
          </div>
        )}

        {enabledProviders.length > 0 && (
          <div className="auth-sso-grid">
            {enabledProviders.map((provider) => {
              if (provider === "magicLink") {
                return (
                  <div key={provider}>
                    {!showMagicInput ? (
                      <Button
                        className="btn-primary w-full flex items-center justify-center gap-2"
                        onClick={() => setShowMagicInput(true)}
                      >
                        <span>
                          {dict.common.continueWith}{" "}
                          {dict.common[provider as keyof typeof dict.common]}
                        </span>
                      </Button>
                    ) : (
                      <form
                        onSubmit={onMagicLinkRequest}
                        className="flex gap-2 w-full"
                      >
                        <input
                          type="email"
                          className="auth-input flex-1"
                          placeholder="me@domain.com"
                          value={magicEmail}
                          onChange={(e) => setMagicEmail(e.target.value)}
                          autoFocus
                          required
                        />
                        <Button
                          disabled={sendingMagic}
                          type="submit"
                          className="btn-primary whitespace-nowrap"
                        >
                          {sendingMagic ? (
                            <div className="w-4 h-4 border-2 border-background/30 border-t-background animate-spin" />
                          ) : (
                            dict.common.submit
                          )}
                        </Button>
                      </form>
                    )}
                  </div>
                );
              }
              return (
                <Button
                  key={provider}
                  className="btn-primary flex items-center justify-center gap-2"
                  onClick={() => {
                    const authProvider =
                      provider === "entra" ? "azure-ad" : provider;
                    signIn(authProvider, { callbackUrl: "/home" });
                  }}
                >
                  <span>
                    {dict.common.continueWith}{" "}
                    {dict.common[provider as keyof typeof dict.common]}
                  </span>
                </Button>
              );
            })}
          </div>
        )}
      </div>

      {settings.publicRegistrationEnabled && (
        <div className="auth-footer-container">
          <button
            onClick={() => router.push("/register")}
            className="auth-footer-link"
          >
            {dict.common.createAccount}
          </button>
        </div>
      )}
    </div>
  );
}
