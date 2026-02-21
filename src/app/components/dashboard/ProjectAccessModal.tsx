"use client";

import { useState, useEffect, useCallback } from "react";
import { useI18n } from "@providers/I18nProvider";
import { useUser } from "@providers/UserProvider";
import { Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@components/ui/Button";
import { Modal } from "@components/ui/Modal";
import { getAvatarUrl } from "@lib/utils";
import {
  AccessRequestsList,
  ProjectRequest,
} from "@components/project/AccessRequestsList";

import { Select } from "@components/ui/Select";

interface UserProfile {
  id: string;
  email: string;
  username: string | null;
  avatarUrl: string | null;
  role?: string;
}

interface ProjectAccessModalProps {
  projectId: string;
  projectName: string;
  onClose: () => void;
  onUpdate?: () => void;
}

export function ProjectAccessModal({
  projectId,
  projectName,
  onClose,
  onUpdate,
}: ProjectAccessModalProps) {
  const { dict } = useI18n();
  const { user: currentUser } = useUser();

  const [collaborators, setCollaborators] = useState<UserProfile[]>([]);
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [requests, setRequests] = useState<ProjectRequest[]>([]);
  const [loadingCollaborators, setLoadingCollaborators] = useState(true);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);

  const fetchCollaborators = useCallback(async () => {
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
  }, [projectId]);

  useEffect(() => {
    fetchCollaborators();
  }, [fetchCollaborators]);

  const isOwner =
    collaborators.find((c) => c.id === currentUser?.id)?.role === "owner" ||
    collaborators.find((c) => c.id === currentUser?.id)?.role === "creator";
  const currentUserRole = collaborators.find((c) => c.id === currentUser?.id)
    ?.role;
  const isCreator = currentUserRole === "creator";

  const fetchRequests = useCallback(async () => {
    if (!isOwner) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/requests`);
      if (res.ok) {
        const data = await res.json();
        setRequests(data);
      } else {
        throw new Error("Failed to fetch requests");
      }
    } catch (err) {
      console.error("Failed to fetch requests", err);
      toast.error(dict.common.error || "Failed to fetch requests");
    }
  }, [projectId, isOwner, dict.common.error]);

  useEffect(() => {
    if (isOwner) {
      fetchRequests();
    }
  }, [isOwner, fetchRequests]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.length >= 2) {
        setLoadingSearch(true);
        fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`)
          .then((res) => (res.ok ? res.json() : []))
          .then((data) => {
            const filtered = data.filter(
              (user: UserProfile) =>
                !collaborators.some((c) => c.id === user.id),
            );
            setSearchResults(filtered);
            setLoadingSearch(false);
          })
          .catch(() => {
            setSearchResults([]);
            setLoadingSearch(false);
          });
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, collaborators]);

  const handleInvite = async (user: UserProfile) => {
    setActionId(user.id);
    try {
      const res = await fetch(`/api/projects/${projectId}/collaborators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, role: "editor" }),
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
      console.error(err);
      toast.error(dict.common.error);
    } finally {
      setActionId(null);
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
        {
          method: "DELETE",
        },
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
      isOpen={true}
      onClose={onClose}
      title={projectName}
      subtitle={dict.project.projectAccess}
      className="max-w-lg w-full"
    >
      {/* Search / Invite Section - Only for owners */}
      {isOwner && (
        <div className="mb-8">
          <div className="relative mb-4">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 opacity-20"></div>
            <input
              className="zen-input pl-10"
              placeholder={dict.management.searchUsers}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto pr-2 custom-scrollbar">
            {loadingSearch ? (
              <div className="py-4 flex items-center justify-center opacity-20">
                <Loader2 className="animate-spin" size={20} />
              </div>
            ) : searchResults.length > 0 ? (
              searchResults.map((user) => (
                <div
                  key={user.id}
                  className="user-card flex items-center justify-between p-2 border border-white/5 bg-white/[0.02]"
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
                  <Button
                    onClick={() => handleInvite(user)}
                    disabled={actionId === user.id}
                    variant="outline"
                    className="h-8"
                  >
                    {actionId === user.id ? (
                      <Loader2 className="animate-spin" size={10} />
                    ) : (
                      <span>{dict.auth.invite}</span>
                    )}
                  </Button>
                </div>
              ))
            ) : searchQuery.length >= 2 ? (
              <p className="text-[10px] uppercase font-bold opacity-20 text-center py-4">
                No users found
              </p>
            ) : null}
          </div>
        </div>
      )}

      {/* Access Requests List */}
      {isOwner && requests.length > 0 && (
        <div className="mb-8">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-40 mb-4 flex items-center gap-2">
            <span>{dict.project.accessRequests || "Access Requests"}</span>
            <span className="h-[1px] flex-1 bg-white/5"></span>
            <span>{requests.length}</span>
          </h3>

          <AccessRequestsList
            requests={requests}
            onAction={handleRequestAction}
            actionId={actionId}
          />
        </div>
      )}

      {/* Collaborators List */}
      <div>
        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-40 mb-4 flex items-center gap-2">
          <span>{dict.project.currentCollaborators}</span>
          <span className="h-[1px] flex-1 bg-white/5"></span>
          <span>{collaborators.length}</span>
        </h3>

        <div className="flex flex-col gap-2 max-h-[240px] overflow-y-auto pr-2 custom-scrollbar">
          {loadingCollaborators ? (
            <div className="py-12 flex items-center justify-center opacity-20">
              <Loader2 className="animate-spin" size={24} />
            </div>
          ) : collaborators.length > 0 ? (
            collaborators.map((user) => (
              <div
                key={user.id}
                className="user-card flex items-center justify-between p-2 border border-white/5"
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
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold tracking-tight">
                        {user.username || dict.account.defaultUsername}
                      </span>
                    </div>
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

                  {user.role !== "owner" && user.role !== "creator" && (
                    <button
                      onClick={() => handleRemove(user.id)}
                      disabled={actionId === user.id}
                      className="p-2 hover:bg-white/5 text-muted hover:text-red-500 transition-colors"
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
              No collaborators found
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
