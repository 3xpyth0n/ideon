"use client";

import { useEffect, useState, useCallback } from "react";
import { FolderOpen, Star, Users, Trash2, Plus } from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import { useUser } from "@providers/UserProvider";
import { Button } from "@components/ui/Button";
import { ProjectModal } from "./ProjectModal";
import { DashboardStatCard } from "./DashboardStatCard";
import { DashboardProjectCard } from "./DashboardProjectCard";
import { HomeSearch } from "./HomeSearch";
import type { DashboardResponse } from "@/api/dashboard/route";

function DashboardSkeleton() {
  return (
    <div className="zen-container max-w-5xl py-12">
      <div className="flex items-center justify-between mt-8 mb-10">
        <div className="flex flex-col gap-2">
          <div
            className="h-8 w-48 animate-pulse rounded"
            style={{ background: "var(--border)" }}
          />
          <div
            className="h-4 w-64 animate-pulse rounded"
            style={{ background: "var(--border)" }}
          />
        </div>
        <div
          className="h-9 w-36 animate-pulse rounded"
          style={{ background: "var(--border)" }}
        />
      </div>
      <div className="dashboard-stats-row">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="dashboard-stat-card animate-pulse">
            <div
              className="h-5 w-5 rounded mb-2"
              style={{ background: "var(--border)" }}
            />
            <div
              className="h-8 w-10 rounded mb-1"
              style={{ background: "var(--border)" }}
            />
            <div
              className="h-3 w-20 rounded"
              style={{ background: "var(--border)" }}
            />
          </div>
        ))}
      </div>
      <div
        className="h-4 w-32 animate-pulse rounded mt-10 mb-4"
        style={{ background: "var(--border)" }}
      />
      <div className="dashboard-compact-list">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="dashboard-compact-card animate-pulse">
            <div
              className="h-4 rounded"
              style={{ background: "var(--border)", width: "55%" }}
            />
            <div
              className="h-4 w-40 rounded"
              style={{ background: "var(--border)" }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

interface EmptyStateProps {
  onNewProject: () => void;
  title: string;
  subtitle: string;
  ctaLabel: string;
}

function DashboardEmptyState({
  onNewProject,
  title,
  subtitle,
  ctaLabel,
}: EmptyStateProps) {
  return (
    <div className="zen-container max-w-5xl flex flex-col items-center justify-center min-h-[60vh] gap-6">
      <div className="flex flex-col items-center gap-3 opacity-60">
        <FolderOpen size={48} strokeWidth={1} />
        <h2 className="zen-title text-2xl mb-0">{title}</h2>
        <p className="zen-subtitle text-sm opacity-60">{subtitle}</p>
      </div>
      <Button onClick={onNewProject} variant="primary" size="md">
        <Plus size={14} />
        <span>{ctaLabel}</span>
      </Button>
    </div>
  );
}

export function HomeDashboard() {
  const { dict } = useI18n();
  const { user } = useUser();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    fetch("/api/dashboard")
      .then((r) => (r.ok ? r.json() : null))
      .then((json: DashboardResponse | null) => setData(json))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const hour = new Date().getHours();
  const greetingBase =
    hour < 12
      ? dict.dashboard.greetingMorning
      : hour < 18
        ? dict.dashboard.greetingAfternoon
        : dict.dashboard.greetingEvening;
  const userName = user?.displayName || user?.username || "";
  const greeting = userName ? `${greetingBase}, ${userName}` : greetingBase;

  const handleCreateSuccess = useCallback(() => {
    setShowCreate(false);
    fetchData();
    window.dispatchEvent(
      new CustomEvent("ideon:sidebar-sync", { detail: { refreshAll: true } }),
    );
  }, [fetchData]);

  if (loading) return <DashboardSkeleton />;

  const isEmpty =
    !data ||
    (data.stats.myProjects === 0 &&
      data.stats.shared === 0 &&
      data.stats.starred === 0);

  if (isEmpty) {
    return (
      <>
        <DashboardEmptyState
          onNewProject={() => setShowCreate(true)}
          title={dict.dashboard.welcomeTitle}
          subtitle={dict.dashboard.welcomeSubtitle}
          ctaLabel={dict.dashboard.createFirstProject}
        />
        {showCreate && (
          <ProjectModal
            onClose={() => setShowCreate(false)}
            onSuccess={handleCreateSuccess}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className="zen-container max-w-5xl py-12">
        <header className="flex items-center justify-between mt-8 mb-10">
          <div>
            <h1 className="dashboard-greeting">{greeting}</h1>
            <p className="zen-subtitle text-sm opacity-40">
              {dict.dashboard.dashboardSubtitle}
            </p>
          </div>
          <Button
            onClick={() => setShowCreate(true)}
            variant="primary"
            size="md"
          >
            <Plus size={14} />
            <span>{dict.dashboard.newProject}</span>
          </Button>
        </header>

        <HomeSearch />

        <div className="dashboard-stats-row">
          <DashboardStatCard
            count={data.stats.myProjects}
            label={dict.dashboard.myProjects}
            icon={<FolderOpen size={16} />}
            href="/home?view=my-projects"
          />
          <DashboardStatCard
            count={data.stats.starred}
            label={dict.dashboard.starred}
            icon={<Star size={16} />}
            href="/home?view=starred"
          />
          <DashboardStatCard
            count={data.stats.shared}
            label={dict.dashboard.sharedWithMe}
            icon={<Users size={16} />}
            href="/home?view=shared"
          />
          <DashboardStatCard
            count={data.stats.trash}
            label={dict.dashboard.trash}
            icon={<Trash2 size={16} />}
            href="/home?view=trash"
          />
        </div>

        {data.recent.length > 0 && (
          <section className="dashboard-section">
            <div className="dashboard-section-header">
              <span className="dashboard-section-title">
                {dict.dashboard.recentProjects}
              </span>
              <a href="/home?view=recent" className="dashboard-section-link">
                {dict.dashboard.viewAll}
              </a>
            </div>
            <div className="dashboard-compact-list">
              {data.recent.map((project) => (
                <DashboardProjectCard
                  key={project.id}
                  project={project}
                  currentUserId={user?.id}
                  compact={true}
                />
              ))}
            </div>
          </section>
        )}

        {data.starred.length > 0 && (
          <section className="dashboard-section">
            <div className="dashboard-section-header">
              <span className="dashboard-section-title">
                {dict.dashboard.starredProjects}
              </span>
              <a href="/home?view=starred" className="dashboard-section-link">
                {dict.dashboard.viewAll}
              </a>
            </div>
            <div className="project-grid">
              {data.starred.map((project) => (
                <DashboardProjectCard
                  key={project.id}
                  project={project}
                  currentUserId={user?.id}
                  compact={false}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      {showCreate && (
        <ProjectModal
          onClose={() => setShowCreate(false)}
          onSuccess={handleCreateSuccess}
        />
      )}
    </>
  );
}
