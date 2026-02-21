"use client";

import { useState, useEffect, useCallback } from "react";
import { useI18n } from "@providers/I18nProvider";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@components/ui/Button";
import { Modal } from "@components/ui/Modal";
import { getAvatarUrl } from "@lib/utils";
import { toast } from "sonner";
import { AccessRequestsList, ProjectRequest } from "./AccessRequestsList";

import { Select } from "@components/ui/Select";

interface UserProfile {
  id: string;
  email: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

interface InviteUserModalProps {
  isOpen: boolean;
  projectId: string;
  onClose: () => void;
  isOwner?: boolean;
  currentUserRole?: string | null;
}

export function InviteUserModal({
  isOpen,
  projectId,
  onClose,
  isOwner = false,
  currentUserRole,
}: InviteUserModalProps) {
  const { dict } = useI18n();
  const [activeTab, setActiveTab] = useState<"invite" | "requests">("invite");
  const [selectedRole, setSelectedRole] = useState("editor");

  // Search state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [collaborators, setCollaborators] = useState<string[]>([]);

  // Requests state
  const [requests, setRequests] = useState<ProjectRequest[]>([]);
  const [actionId, setActionId] = useState<string | null>(null);

  // Fetch collaborators
  const fetchCollaborators = useCallback(async () => {
    if (!isOpen) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/collaborators`);
      if (res.ok) {
        const data = await res.json();
        setCollaborators(data.map((c: { id: string }) => c.id));
      } else {
        setCollaborators([]);
      }
    } catch {
      setCollaborators([]);
    }
  }, [projectId, isOpen]);

  useEffect(() => {
    fetchCollaborators();
  }, [fetchCollaborators]);

  // Fetch requests
  const fetchRequests = useCallback(async () => {
    if (!isOpen || !isOwner) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/requests`);
      if (res.ok) {
        const data = await res.json();
        setRequests(data);
      }
    } catch (err) {
      console.error("Failed to fetch requests", err);
    }
  }, [projectId, isOpen, isOwner]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Search effect
  useEffect(() => {
    if (!isOpen || activeTab !== "invite") return;
    const timer = setTimeout(() => {
      if (query.length >= 2) {
        setLoading(true);
        fetch(`/api/users/search?q=${encodeURIComponent(query)}`)
          .then((res) => (res.ok ? res.json() : []))
          .then((data) => {
            setResults(data);
            setLoading(false);
          })
          .catch(() => {
            setResults([]);
            setLoading(false);
          });
      } else {
        setResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, isOpen, activeTab]);

  const handleInvite = async (user: UserProfile) => {
    setInvitingId(user.id);
    try {
      const res = await fetch(`/api/projects/${projectId}/collaborators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, role: selectedRole }),
      });

      if (res.ok) {
        setCollaborators([...collaborators, user.id]);
        toast.success(dict.common.success || "Invitation sent");
      } else {
        toast.error(dict.common.error || "Failed to invite user");
      }
    } catch (err) {
      console.error("Failed to invite user", err);
      toast.error(dict.common.error || "Failed to invite user");
    } finally {
      setInvitingId(null);
    }
  };

  const handleRequestAction = async (
    userId: string,
    action: "approve" | "reject" | "restore",
  ) => {
    setActionId(userId);
    try {
      const res = await fetch(`/api/projects/${projectId}/requests`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action }),
      });

      if (res.ok) {
        await fetchRequests();
        if (action === "approve") {
          await fetchCollaborators();
          toast.success(dict.common.success || "Request approved");
        } else {
          toast.success(dict.common.success || "Request rejected");
        }
      } else {
        const data = await res.json();
        toast.error(data.error || dict.common.error);
      }
    } catch (err) {
      console.error(err);
      toast.error(dict.common.error || "Action failed");
    } finally {
      setActionId(null);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={dict.project.projectAccess || "Project Access"}
      className="max-w-lg w-full"
    >
      <div className="flex gap-6 border-b border-white/5 mb-6 mt-8">
        <button
          onClick={() => setActiveTab("invite")}
          className={`pb-3 px-1 text-sm font-medium transition-colors relative ${
            activeTab === "invite"
              ? "text-white"
              : "text-white/40 hover:text-white/60"
          }`}
        >
          {dict.auth.invite || "Invite"}
          {activeTab === "invite" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
        </button>
        {isOwner && (
          <button
            onClick={() => setActiveTab("requests")}
            className={`pb-3 px-1 text-sm font-medium transition-colors relative flex items-center gap-2 ${
              activeTab === "requests"
                ? "text-white"
                : "text-white/40 hover:text-white/60"
            }`}
          >
            {dict.project.accessRequests || "Access Requests"}
            {requests.length > 0 && (
              <span className="px-1.5 py-0.5 bg-primary text-[10px] rounded-full text-white font-bold leading-none">
                {requests.length}
              </span>
            )}
            {activeTab === "requests" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
            )}
          </button>
        )}
      </div>

      {activeTab === "invite" && (
        <>
          <div className="relative mb-6">
            <div className="flex gap-2 mb-4">
              <Select
                value={selectedRole}
                onChange={setSelectedRole}
                options={[
                  ...(currentUserRole === "creator"
                    ? [{ value: "owner", label: "Owner" }]
                    : []),
                  { value: "editor", label: "Editor" },
                  { value: "viewer", label: "Viewer" },
                ]}
                className="w-32"
              />
            </div>

            <input
              autoFocus
              className="zen-input pl-12"
              placeholder={dict.management.searchUsers}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="absolute left-4 top-1/2 -translate-y-1/2 opacity-20">
              <Loader2
                className={`animate-spin ${
                  loading ? "opacity-100" : "opacity-0"
                }`}
                size={16}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar min-h-[100px]">
            {results.length > 0 ? (
              results.map((user) => {
                const isCollaborator = collaborators.includes(user.id);
                return (
                  <div
                    key={user.id}
                    className="user-card flex items-center justify-between p-2 border border-white/5 bg-white/[0.02] rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-white/5 flex items-center justify-center overflow-hidden rounded-full">
                        <img
                          src={getAvatarUrl(user.avatarUrl, user.username)}
                          alt=""
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold">
                          {user.username || dict.account.defaultUsername}
                        </span>
                        <span className="text-2xs opacity-30 font-medium">
                          {user.email}
                        </span>
                      </div>
                    </div>
                    {isCollaborator ? (
                      <span className="text-xs opacity-40 px-3 py-1 flex items-center gap-1">
                        <Check size={12} />
                        {dict.project.userAdded || "Added"}
                      </span>
                    ) : (
                      <Button
                        onClick={() => handleInvite(user)}
                        disabled={invitingId === user.id}
                        variant="outline"
                        className="h-8 text-xs"
                      >
                        {invitingId === user.id ? (
                          <Loader2 className="animate-spin" size={10} />
                        ) : (
                          <span>{dict.auth.invite}</span>
                        )}
                      </Button>
                    )}
                  </div>
                );
              })
            ) : query.length >= 2 && !loading ? (
              <p className="text-xs opacity-40 text-center py-8">
                {dict.management.noUsersFound || "No users found"}
              </p>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 opacity-20 text-center">
                <p className="text-sm font-medium">
                  {dict.project.inviteUserSubtitle}
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === "requests" && isOwner && (
        <AccessRequestsList
          requests={requests}
          onAction={handleRequestAction}
          actionId={actionId}
        />
      )}
    </Modal>
  );
}
