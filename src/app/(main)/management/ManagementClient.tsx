"use client";

import React, { useState, useEffect } from "react";
import { useI18n } from "@providers/I18nProvider";
import {
  Shield,
  Key,
  Mail,
  Slack,
  Github,
  Disc,
  Globe,
  Cloud,
  Lock,
  UserPlus,
  Loader2,
  ChevronRight,
  Download,
} from "lucide-react";
import { Button } from "@components/ui/Button";
import { Modal } from "@components/ui/Modal";
import { AuditTable, type AuditLog } from "@components/audit/AuditTable";
import { AuditExportModal } from "@components/audit/AuditExportModal";

type ProviderKey =
  | "google"
  | "entra"
  | "slack"
  | "oidc"
  | "discord"
  | "gitlab"
  | "magicLink"
  | "saml";

interface ProviderConfig {
  enabled: boolean;
  clientId?: string;
  clientSecret?: string;
  issuer?: string;
  tenantId?: string;
  redirectUri?: string;
  expiresInMinutes?: number;
}

interface AuthSettings {
  publicRegistrationEnabled: boolean;
  passwordLoginEnabled: boolean;
  authProviders: Record<ProviderKey, ProviderConfig>;
  appUrl?: string;
}

import { toast } from "sonner";

export function ManagementClient() {
  const { dict } = useI18n();
  const [activeTab, setActiveTab] = useState("authentication");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [settings, setSettings] = useState<AuthSettings>({
    publicRegistrationEnabled: true,
    passwordLoginEnabled: true,
    authProviders: {
      google: { enabled: false },
      entra: { enabled: false },
      slack: { enabled: false },
      oidc: { enabled: false },
      discord: { enabled: false },
      gitlab: { enabled: false },
      magicLink: { enabled: false },
      saml: { enabled: false },
    },
  });

  const [configuringProvider, setConfiguringProvider] =
    useState<ProviderKey | null>(null);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [smtpTestStatus, setSmtpTestStatus] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const openProviderConfig = (provider: ProviderKey) => {
    setSmtpTestStatus(null);
    setConfiguringProvider(provider);
  };

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash === "audit" || hash === "authentication" || hash === "sso") {
        setActiveTab(hash);
      } else {
        setActiveTab("authentication");
      }
    };

    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    window.addEventListener("popstate", handleHashChange);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
      window.removeEventListener("popstate", handleHashChange);
    };
  }, []);

  useEffect(() => {
    if (activeTab === "audit") {
      setLoadingAudit(true);
      fetch("/api/management/audit")
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setAuditLogs(data);
          }
        })
        .catch((err) => console.error("Failed to fetch audit logs:", err))
        .finally(() => setLoadingAudit(false));
    }
  }, [activeTab]);

  useEffect(() => {
    fetch("/api/management/auth")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch settings");
        return res.json();
      })
      .then((data) => {
        if (data && typeof data === "object" && !data.error) {
          setSettings((prev) => ({
            ...prev,
            ...data,
            authProviders: {
              ...prev.authProviders,
              ...(data.authProviders || {}),
            },
          }));
        }
      })
      .catch((err) => {
        console.error("Management settings error:", err);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (updatedSettings: AuthSettings) => {
    setSaving(true);
    try {
      const res = await fetch("/api/management/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedSettings),
      });
      if (res.ok) {
        setSettings(updatedSettings);
        toast.success(dict.common.success || "Settings saved");
      } else {
        const data = await res.json();
        toast.error(data.error || dict.common.error);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const toggleProvider = (key: ProviderKey) => {
    const updated = {
      ...settings,
      authProviders: {
        ...settings.authProviders,
        [key]: {
          ...settings.authProviders[key],
          enabled: !settings.authProviders[key].enabled,
        },
      },
    };
    handleSave(updated);
  };

  const updateProviderConfig = (
    key: ProviderKey,
    config: Partial<ProviderConfig>,
  ) => {
    const updated = {
      ...settings,
      authProviders: {
        ...settings.authProviders,
        [key]: {
          ...settings.authProviders[key],
          ...config,
        },
      },
    };
    handleSave(updated);
    setConfiguringProvider(null);
  };

  const handleTestSmtp = async () => {
    setTestingSmtp(true);
    setSmtpTestStatus(null);
    try {
      const res = await fetch("/api/management/auth/test-smtp", {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(dict.common.testSmtpSuccess);
        setSmtpTestStatus({
          success: true,
          message: dict.common.testSmtpSuccess,
        });
      } else {
        toast.error(data.error || dict.common.testSmtpError);
        setSmtpTestStatus({
          success: false,
          message: data.error || dict.common.testSmtpError,
        });
      }
    } catch (error) {
      console.error(error);
      toast.error(dict.common.testSmtpError);
      setSmtpTestStatus({
        success: false,
        message: dict.common.testSmtpError,
      });
    } finally {
      setTestingSmtp(false);
    }
  };

  const providers: {
    key: ProviderKey;
    icon: React.ElementType;
    color: string;
  }[] = [
    { key: "google", icon: Globe, color: "#4285F4" },
    { key: "entra", icon: Cloud, color: "#0078D4" },
    { key: "slack", icon: Slack, color: "#4A154B" },
    { key: "oidc", icon: Key, color: "#F78C40" },
    { key: "discord", icon: Disc, color: "#5865F2" },
    { key: "gitlab", icon: Github, color: "#FC6D26" },
    { key: "magicLink", icon: Mail, color: "#EA4335" },
    { key: "saml", icon: Shield, color: "#8E44AD" },
  ];

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted animate-pulse uppercase tracking-widest text-xs font-bold">
          {dict.common.loading}
        </p>
      </div>
    );
  }

  return (
    <div className="management-container">
      <header className="management-header">
        <div>
          <h1 className="management-title">{dict.common.management}</h1>
          <p className="management-subtitle">
            {dict.common.managementSubtitle}
          </p>
        </div>
      </header>

      <div className="management-tabs-nav">
        <button
          className={`management-tab-btn ${
            activeTab === "authentication" ? "active" : ""
          }`}
          onClick={() => (window.location.hash = "authentication")}
        >
          <Key size={16} />
          {dict.common.authentication}
        </button>
        <button
          className={`management-tab-btn ${
            activeTab === "sso" ? "active" : ""
          }`}
          onClick={() => (window.location.hash = "sso")}
        >
          <Globe size={16} />
          {dict.common.ssoProviders}
        </button>
        <button
          className={`management-tab-btn ${
            activeTab === "audit" ? "active" : ""
          }`}
          onClick={() => (window.location.hash = "audit")}
        >
          <Shield size={16} />
          {dict.common.securityAudit}
        </button>
      </div>

      <div className="management-content-wrapper">
        <main className="management-content">
          {activeTab === "authentication" && (
            <div className="auth-settings">
              <section className="settings-section">
                <h2 className="section-title">{dict.common.generalSettings}</h2>
                <p className="section-subtitle">
                  {dict.common.authSettingsSubtitle}
                </p>

                <div className="settings-grid">
                  <div className="setting-card">
                    <div className="setting-info">
                      <UserPlus size={24} className="setting-icon" />
                      <div>
                        <h3 className="setting-name">
                          {dict.common.publicRegistration}
                        </h3>
                        <p className="setting-description">
                          {dict.common.publicRegistrationDesc}
                        </p>
                      </div>
                    </div>
                    <div className="setting-action">
                      <button
                        className={`zen-switch ${
                          settings.publicRegistrationEnabled ? "active" : ""
                        }`}
                        onClick={() =>
                          handleSave({
                            ...settings,
                            publicRegistrationEnabled:
                              !settings.publicRegistrationEnabled,
                          })
                        }
                        disabled={saving}
                      >
                        <div className="switch-thumb" />
                      </button>
                    </div>
                  </div>

                  <div className="setting-card">
                    <div className="setting-info">
                      <Lock size={24} className="setting-icon" />
                      <div>
                        <h3 className="setting-name">
                          {dict.common.passwordLogin}
                        </h3>
                        <p className="setting-description">
                          {dict.common.passwordLoginDesc}
                        </p>
                      </div>
                    </div>
                    <div className="setting-action">
                      <button
                        className={`zen-switch ${
                          settings.passwordLoginEnabled ? "active" : ""
                        }`}
                        onClick={() =>
                          handleSave({
                            ...settings,
                            passwordLoginEnabled:
                              !settings.passwordLoginEnabled,
                          })
                        }
                        disabled={saving}
                      >
                        <div className="switch-thumb" />
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === "sso" && (
            <div className="auth-settings">
              <section className="settings-section">
                <h2 className="section-title">{dict.common.ssoProviders}</h2>
                <p className="section-subtitle">{dict.common.ssoDesc}</p>

                <div className="provider-grid">
                  {providers.map((p) => {
                    const config = settings.authProviders[p.key] || {
                      enabled: false,
                    };
                    return (
                      <div key={p.key} className="provider-card">
                        <div className="provider-header">
                          <div
                            className="provider-icon-wrapper"
                            style={{
                              backgroundColor: `${p.color}10`,
                              color: p.color,
                            }}
                          >
                            <p.icon size={24} />
                          </div>
                          <button
                            className={`zen-switch-small ${
                              config.enabled ? "active" : ""
                            }`}
                            onClick={() => toggleProvider(p.key)}
                            disabled={saving}
                          >
                            <div className="switch-thumb" />
                          </button>
                        </div>
                        <h3 className="provider-name">
                          {(dict.common as Record<string, string>)[p.key]}
                        </h3>
                        <div className="provider-status">
                          <span
                            className={`status-dot ${
                              config.enabled ? "active" : ""
                            }`}
                          />
                          {config.enabled
                            ? dict.common.enabled
                            : dict.common.disabled}
                        </div>
                        <Button
                          className="btn-minimal w-full mt-4 justify-between"
                          onClick={() => openProviderConfig(p.key)}
                          noRipple
                        >
                          <span className="btn-text">
                            {dict.common.configure}
                          </span>
                          <ChevronRight size={16} />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          )}

          {activeTab === "audit" && (
            <div className="audit-settings">
              <section className="settings-section">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="section-title">
                      {dict.common.securityAudit}
                    </h2>
                    <p className="section-subtitle">
                      {dict.common.managementSubtitle}
                    </p>
                  </div>
                  <Button
                    onClick={() => setShowExportModal(true)}
                    disabled={loadingAudit || auditLogs.length === 0}
                    className="btn-primary text-xs py-2 h-auto"
                  >
                    <div className="flex items-center gap-2">
                      <Download size={14} />
                      <span>{dict.common.export}</span>
                    </div>
                  </Button>
                </div>

                <div>
                  <AuditTable logs={auditLogs} loading={loadingAudit} />
                </div>

                <AuditExportModal
                  isOpen={showExportModal}
                  onClose={() => setShowExportModal(false)}
                  logs={auditLogs}
                />
              </section>
            </div>
          )}
        </main>
      </div>

      {configuringProvider && (
        <ProviderConfigModal
          provider={configuringProvider}
          config={settings.authProviders[configuringProvider]}
          onClose={() => setConfiguringProvider(null)}
          onSave={(config) => updateProviderConfig(configuringProvider, config)}
          onTestSmtp={handleTestSmtp}
          testingSmtp={testingSmtp}
          smtpTestStatus={smtpTestStatus}
          dict={dict}
          appUrl={
            settings.appUrl ||
            (typeof window !== "undefined"
              ? window.location.origin
              : "http://localhost:3000")
          }
        />
      )}
    </div>
  );
}

function ProviderConfigModal({
  provider,
  config,
  onClose,
  onSave,
  onTestSmtp,
  testingSmtp,
  smtpTestStatus,
  dict,
  appUrl,
}: {
  provider: ProviderKey;
  config: ProviderConfig;
  onClose: () => void;
  onSave: (config: Partial<ProviderConfig>) => void;
  onTestSmtp: () => void;
  testingSmtp: boolean;
  smtpTestStatus: { success: boolean; message: string } | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dict: any;
  appUrl: string;
}) {
  const [formData, setFormData] = useState<Partial<ProviderConfig>>(config);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const isOidc =
    provider === "oidc" ||
    provider === "google" ||
    provider === "gitlab" ||
    provider === "entra" ||
    provider === "slack" ||
    provider === "discord";
  const isSaml = provider === "saml";
  const isMagicLink = provider === "magicLink";

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={`${dict.common.configure} ${
        dict.common[provider as keyof typeof dict.common]
      }`}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-6 mt-6">
        {["google", "entra", "slack", "discord"].includes(provider) && (
          <div className="bg-blue-50/50 border border-blue-100/50 p-4 rounded-lg flex flex-col gap-2">
            <div className="flex items-center gap-2 font-bold tracking-wider">
              <Globe size={14} />
              <span>{dict.common.callbackUrlNotice}</span>
            </div>
            <div className="flex items-center gap-2">
              <code className="bg-white/50 px-2 py-1 rounded border border-blue-200/50 text-[11px] flex-1 font-mono text-blue-900 overflow-hidden text-ellipsis whitespace-nowrap">
                {appUrl}/api/auth/callback/
                {provider === "entra" ? "azure-ad" : provider}
              </code>
            </div>
          </div>
        )}
        {isOidc && (
          <>
            <div className="form-group">
              <label className="modal-label">{dict.common.clientId}</label>
              <input
                className="zen-input"
                value={formData.clientId || ""}
                onChange={(e) =>
                  setFormData({ ...formData, clientId: e.target.value })
                }
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              />
            </div>
            <div className="form-group">
              <label className="modal-label">{dict.common.clientSecret}</label>
              <input
                className="zen-input"
                type="password"
                value={formData.clientSecret || ""}
                onChange={(e) =>
                  setFormData({ ...formData, clientSecret: e.target.value })
                }
                placeholder="••••••••••••••••"
              />
            </div>
            {provider === "entra" && (
              <div className="form-group">
                <label className="modal-label">{dict.common.tenantId}</label>
                <input
                  className="zen-input"
                  value={formData.tenantId || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, tenantId: e.target.value })
                  }
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
              </div>
            )}
            {provider === "oidc" && (
              <div className="form-group">
                <label className="modal-label">{dict.common.issuer}</label>
                <input
                  className="zen-input"
                  value={formData.issuer || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, issuer: e.target.value })
                  }
                  placeholder="https://example.com/auth/realms/master"
                />
              </div>
            )}
            <div className="form-group">
              <label className="modal-label">{dict.common.redirectUri}</label>
              <input
                className="zen-input"
                value={formData.redirectUri || ""}
                onChange={(e) =>
                  setFormData({ ...formData, redirectUri: e.target.value })
                }
                placeholder="https://your-app.com/api/auth/callback"
              />
            </div>
          </>
        )}

        {isSaml && (
          <div className="form-group">
            <label className="modal-label">{dict.common.issuer}</label>
            <input
              className="zen-input"
              value={formData.issuer || ""}
              onChange={(e) =>
                setFormData({ ...formData, issuer: e.target.value })
              }
              placeholder="https://idp.example.com/saml"
            />
          </div>
        )}

        {isMagicLink && (
          <div className="form-group">
            <label className="modal-label">
              {dict.common.magicLinkDuration}
            </label>
            <input
              type="number"
              className="zen-input"
              value={formData.expiresInMinutes || ""}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  expiresInMinutes: parseInt(e.target.value),
                })
              }
              placeholder={dict.common.magicLinkDurationPlaceholder}
            />
            <p className="text-[10px] opacity-40 mt-1">
              {dict.common.magicLinkEnvNotice}
            </p>
          </div>
        )}

        <div className="modal-footer-full">
          <div className="flex flex-col gap-4 w-full">
            {isMagicLink && (
              <div className="flex items-center gap-4 w-full">
                <Button
                  type="button"
                  onClick={onTestSmtp}
                  disabled={testingSmtp}
                  className="btn-primary whitespace-nowrap"
                >
                  {testingSmtp ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    dict.common.testSmtp
                  )}
                </Button>
                {smtpTestStatus && (
                  <div
                    className={`text-sm font-medium p-2 rounded flex-1 ${
                      smtpTestStatus.success ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {smtpTestStatus.message}
                  </div>
                )}
              </div>
            )}
            <Button type="submit" className="btn-primary btn-full">
              {dict.common.save}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
