"use client";

import { useRouter } from "next/navigation";
import { ReactNode } from "react";

interface DashboardStatCardProps {
  count: number;
  label: string;
  icon: ReactNode;
  href: string;
}

export function DashboardStatCard({
  count,
  label,
  icon,
  href,
}: DashboardStatCardProps) {
  const router = useRouter();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(href)}
      onKeyDown={(e) => e.key === "Enter" && router.push(href)}
      className="dashboard-stat-card"
    >
      <div className="dashboard-stat-icon">{icon}</div>
      <span className="dashboard-stat-count">{count}</span>
      <span className="dashboard-stat-label">{label}</span>
    </div>
  );
}
