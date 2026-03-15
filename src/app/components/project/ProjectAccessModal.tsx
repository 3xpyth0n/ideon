"use client";

import { useState, useEffect, useCallback } from "react";
import { useI18n } from "@providers/I18nProvider";
import { useUser } from "@providers/UserProvider";
import { Check, Loader2, Trash2 } from "lucide-react";
import { Button } from "@components/ui/Button";
import { Modal } from "@components/ui/Modal";
import { Select } from "@components/ui/Select";
import { getAvatarUrl } from "@lib/utils";
import { toast } from "sonner";
import { AccessRequestsList, ProjectRequest } from "./AccessRequestsList";

interface UserProfile {
  id: string;
  email: string;
  username: string | null;
  displayName?: string | null;
  avatarUrl: string | null;
  role?: string;
}

interface ProjectAccessModalProps {
  isOpen: boolean;
  projectId: string;
  projectName?: string;
  onClose: () => void;
  onUpdate?: () => void;
  isOwner?: boolean;
  currentUserRole?: string | null;
}

export function ProjectAccessModal({
  isOpen,
  projectId,
  projectName,
  onClose,
  onUpdate,
  isOwner: isOwnerProp,
  currentUserRole: currentUserRoleProp,
}: ProjectAccessModalProps) {
  const { dict } = useI18n();
  const { user: currentUser } = useUser();

  const [activeTab, setActiveTab] = useState<"invite" | "members">("invite");
  const [selectedRole, setSelectedRole] = useState("editor");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [invitingId, setInvitingId] = useState<string | null>(null);

  const [collaborators, setCollaborators] = useState<UserProfile[]>([]);
  const [loadingCollaborators, setLoadingCollaborators] = useState(true);

  const [requests, setRequests] = useState<ProjectRequest[]>([]);
  const [actionId, setActionId] = useState<string | null>(null);

  const derivedRole = collaborators.find((c) => c.id === currentUser?.id)?.role;
  const currentUserRole = currentUserRoleProp ?? derivedRole ?? null;
  const isOwner =
    isOwnerProp ??
    (currentUserRole === "owner" || currentUserRole === "creator");
  const isCreator = currentUserRole === "creator";

  const collaboratorIds = collaborators.map((c) => c.id);

  const fetchCollaborators = useCallback(async () => {
    if (!isOpen) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/collaborators`);
      if (res.ok) {
        const data = await res.json();
        setCollaborators(data);
      }
    } catch (err) {
      console.error("Failed to fetch collaborators", err);
    } finally {
      setLoadingCollaborators(false);
    }
  }, [projectId, isOpen]);

  useEffect(() => {
    fetchCollaborators();
  }, [fetchCollaborators]);

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
        await fetchCollaborators();
        onUpdate?.();
        toast.success(dict.common.success || "Invitation sent");
      } else {
        const data = await res.json();
        toast.error(data.error || dict.common.error);
      }
    } catch (err) {
      console.error("Failed to invite user", err);
      toast.error(dict.common.error || "Failed to invite user");
    } finally {
      setInvitingId(null);
    }
  };

  const handleUpdateRole = async (userId: string, newRole: string) => {
    setActionId(userId);
    try {
      const res = await fetch(`/api/projects/${projectId}/collaborators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: newRole }),
      });

      if (res.ok) {
        await fetchCollaborators();
        onUpdate?.();
        toast.success(dict.common.success || "Role updated");
      } else {
        const data = await res.json();
        toast.error(data.error || dict.common.error);
      }
    } catch (err) {
      console.error(err);
      toast.error(dict.common.error);
    } finally {
      setActionId(null);
    }
  };

  const handleRemove = async (userId: string) => {
    setActionId(userId);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/collaborators?userId=${userId}`,
        { method: "DELETE" },
      );

      if (res.ok) {
        await fetchCollaborators();
        onUpdate?.();
        toast.success(dict.common.success || "User removed");
      } else {
        const data = await res.json();
        toast.error(data.error || dict.common.error);
      }
    } catch (err) {
      console.error(err);
      toast.error(dict.common.error);
    } finally {
      setActionId(null);
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
          onUpdate?.();
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
      title={projectName || dict.project.projectAccess}
      subtitle={projectName ? dict.project.projectAccess : undefined}
      className="max-w-lg w-full"
    >
      <div className="flex gap-6 border-b border-white/5 mb-6 mt-8">
        <button
          onClick={() => setActiveTab("invite")}
          className={`pb-3 px-1 text-sm transition-colors ${
            activeTab === "invite"
              ? "text-white font-extrabold underline underline-offset-8 decoration-2 decoration-primary"
              : "text-white/40 font-normal hover:text-white/60"
          }`}
        >
          {dict.auth.invite || "Invite"}
        </button>
        <button
          onClick={() => setActiveTab("members")}
          className={`pb-3 px-1 text-sm transition-colors flex items-center gap-2 ${
            activeTab === "members"
              ? "text-white font-extrabold underline underline-offset-8 decoration-2 decoration-primary"
              : "text-white/40 font-normal hover:text-white/60"
          }`}
        >
          {dict.project.membersAndRequests || "Members & Requests"}
          {requests.length > 0 && (
            <span className="px-1.5 py-0.5 bg-primary text-[10px] rounded-full text-white font-bold leading-none">
              {requests.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === "invite" && (
        <>
          <div className="relative mb-6">
            <div className="flex gap-2 mb-4">
              <Select
                value={selectedRole}
                onChange={setSelectedRole}
                options={[
                  ...(isCreator ? [{ value: "owner", label: "Owner" }] : []),
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
              aria-label={dict.management.searchUsers}
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

          <div
            className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar min-h-[100px] nopan nodrag nowheel"
            onWheel={(e) => e.stopPropagation()}
          >
            {results.length > 0 ? (
              results.map((user) => {
                const isCollaborator = collaboratorIds.includes(user.id);
                return (
                  <div
                    key={user.id}
                    className="user-card flex items-center justify-between p-2 border border-white/5 bg-white/[0.02] rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-white/5 flex items-center justify-center overflow-hidden">
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

      {activeTab === "members" && (
        <>
          {isOwner && requests.length > 0 && (
            <div className="mb-8">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-40 mb-4 flex items-center gap-2">
                <span>{dict.project.accessRequests || "Access Requests"}</span>
                <span className="h-[1px] flex-1 bg-white/5" />
                <span>{requests.length}</span>
              </h3>
              <AccessRequestsList
                requests={requests}
                onAction={handleRequestAction}
                actionId={actionId}
              />
            </div>
          )}

          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-40 mb-4 flex items-center gap-2">
              <span>{dict.project.currentCollaborators}</span>
              <span className="h-[1px] flex-1 bg-white/5" />
              <span>{collaborators.length}</span>
            </h3>

            <div
              className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar nopan nodrag nowheel"
              onWheel={(e) => e.stopPropagation()}
            >
              {loadingCollaborators ? (
                <div className="py-12 flex items-center justify-center opacity-20">
                  <Loader2 className="animate-spin" size={24} />
                </div>
              ) : collaborators.length > 0 ? (
                collaborators.map((user) => (
                  <div
                    key={user.id}
                    className="user-card flex items-center justify-between p-2 border border-white/5 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-white/5 flex items-center justify-center overflow-hidden">
                        <img
                          src={getAvatarUrl(user.avatarUrl, user.username)}
                          alt=""
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold tracking-tight">
                          {user.username || dict.account.defaultUsername}
                        </span>
                        <span className="text-2xs opacity-30 font-medium">
                          {user.email}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isOwner &&
                      user.role !== "creator" &&
                      (user.role !== "owner" || isCreator) ? (
                        <div
                          className={
                            actionId === user.id
                              ? "opacity-50 pointer-events-none"
                              : ""
                          }
                        >
                          <Select
                            value={user.role || "viewer"}
                            onChange={(val) => handleUpdateRole(user.id, val)}
                            options={[
                              ...(isCreator
                                ? [{ value: "owner", label: "Owner" }]
                                : []),
                              { value: "editor", label: "Editor" },
                              { value: "viewer", label: "Viewer" },
                            ]}
                            className="w-[100px]"
                            triggerClassName="h-6 text-[10px] uppercase font-bold bg-transparent border-none hover:bg-white/5 justify-end"
                            align="right"
                          />
                        </div>
                      ) : (
                        <span className="text-[10px] uppercase font-black tracking-[0.2em] opacity-20 px-2">
                          {user.role}
                        </span>
                      )}

                      {isOwner &&
                        user.role !== "owner" &&
                        user.role !== "creator" && (
                          <button
                            onClick={() => handleRemove(user.id)}
                            disabled={actionId === user.id}
                            className="p-2 hover:bg-white/5 text-muted hover:text-red-500 transition-colors rounded-lg"
                          >
                            {actionId === user.id ? (
                              <Loader2 className="animate-spin" size={14} />
                            ) : (
                              <Trash2 size={14} />
                            )}
                          </button>
                        )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-[10px] uppercase font-bold opacity-20 text-center py-8">
                  {dict.management.noUsersFound}
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
