"use client";

import { useRouter } from "next/navigation";
import { Calendar, Users } from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import type { DashboardProject } from "@/api/dashboard/route";

interface DashboardProjectCardProps {
  project: DashboardProject;
  currentUserId: string | undefined;
  compact?: boolean;
}

export function DashboardProjectCard({
  project,
  currentUserId,
  compact = true,
}: DashboardProjectCardProps) {
  const { dict } = useI18n();
  const router = useRouter();
  const isOwner = project.ownerId === currentUserId;
  const formattedDate = new Date(project.updatedAt).toLocaleDateString(
    undefined,
    { day: "2-digit", month: "2-digit", year: "numeric" },
  );
  const collabCount = Number(project.collaboratorCount) + 1;

  const handleClick = () => router.push(`/project/${project.id}`);
  const handleKeyDown = (e: React.KeyboardEvent) =>
    e.key === "Enter" && handleClick();

  if (compact) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className="dashboard-compact-card"
      >
        <div className="dashboard-compact-left">
          <span className="dashboard-compact-name">{project.name}</span>
          {project.description && (
            <span className="dashboard-compact-desc">
              {project.description}
            </span>
          )}
        </div>
        <div className="dashboard-compact-meta">
          <span
            className={`project-card-tag ${
              isOwner ? "badge-owner" : "badge-collaborator"
            }`}
          >
            {isOwner ? dict.dashboard.statusMine : dict.dashboard.statusShared}
          </span>
          <span className="project-card-tag">
            <Calendar size={10} strokeWidth={3} />
            <span>{formattedDate}</span>
          </span>
          <span className="project-card-tag">
            <Users size={10} strokeWidth={3} />
            <span>{collabCount}</span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="project-card"
    >
      <h3 className="project-card-title mb-0">{project.name}</h3>
      <p className="project-card-desc">{project.description ?? ""}</p>
      <div className="project-card-footer">
        <span className="project-card-tag">
          <Calendar size={10} strokeWidth={3} />
          <span>{formattedDate}</span>
        </span>
        <span
          className={`project-card-tag ${
            isOwner ? "badge-owner" : "badge-collaborator"
          }`}
        >
          {isOwner ? dict.dashboard.statusMine : dict.dashboard.statusShared}
        </span>
        <span className="project-card-tag">
          <Users size={10} strokeWidth={3} />
          <span>{collabCount}</span>
        </span>
      </div>
    </div>
  );
}
