"use client";

import { useI18n } from "@providers/I18nProvider";
import { getAvatarUrl } from "@lib/utils";
import { AccessRequestToggle } from "./AccessRequestToggle";

export interface ProjectRequest {
  id: string;
  userId: string;
  status: "pending" | "rejected";
  createdAt: string;
  email: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

interface AccessRequestsListProps {
  requests: ProjectRequest[];
  onAction: (userId: string, action: "approve" | "reject" | "restore") => void;
  actionId: string | null;
}

export function AccessRequestsList({
  requests,
  onAction,
  actionId,
}: AccessRequestsListProps) {
  const { dict } = useI18n();

  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 opacity-20">
        <p className="text-sm font-medium">
          {dict.project.noPendingRequests || "No pending requests"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
      {requests.map((req) => (
        <div
          key={req.id}
          className="user-card flex items-center justify-between p-3 border border-white/5 bg-white/[0.02] rounded-lg hover:bg-white/[0.04] transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/5 flex items-center justify-center overflow-hidden rounded-full border border-white/10">
              <img
                src={getAvatarUrl(req.avatarUrl, req.username || req.displayName)}
                alt=""
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold tracking-tight text-white/90">
                  {req.username ||
                    req.displayName ||
                    dict.account.defaultUsername}
                </span>
              </div>
              <span className="text-xs opacity-40 font-medium">
                {req.email}
              </span>
            </div>
          </div>

          <AccessRequestToggle
            status={req.status}
            onApprove={() => onAction(req.userId, "approve")}
            onReject={() => onAction(req.userId, "reject")}
            isProcessing={actionId === req.userId}
          />
        </div>
      ))}
    </div>
  );
}
