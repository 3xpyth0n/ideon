"use client";

import { useState, useEffect, useCallback } from "react";
import { useI18n } from "@providers/I18nProvider";
import { useUser } from "@providers/UserProvider";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@components/ui/Button";
import { Modal } from "@components/ui/Modal";
import { getAvatarUrl } from "@lib/utils";

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

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.length >= 2) {
        setLoadingSearch(true);
        fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`)
          .then((res) => (res.ok ? res.json() : []))
          .then((data) => {
            // Filter out existing collaborators from search results
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
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionId(null);
    }
  };

  const handleRemove = async (userId: string) => {
    setActionId(userId);
    try {
      const res = await fetch(`/api/projects/${projectId}/collaborators`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      if (res.ok) {
        await fetchCollaborators();
        onUpdate?.();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionId(null);
    }
  };

  const isOwner =
    collaborators.find((c) => c.id === currentUser?.id)?.role === "owner";

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={projectName}
      subtitle={`${dict.common.home} Access`}
      className="max-w-lg w-full"
    >
      {/* Search / Invite Section - Only for owners */}
      {isOwner && (
        <div className="mb-8">
          <div className="relative mb-4">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 opacity-20"></div>
            <input
              className="zen-input pl-10"
              placeholder={dict.common.searchUsers}
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
                        {user.username || dict.common.defaultUsername}
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
                      <span>{dict.common.invite}</span>
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

      {/* Collaborators List */}
      <div>
        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-40 mb-4 flex items-center gap-2">
          <span>{dict.common.currentCollaborators}</span>
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
                        {user.username || dict.common.defaultUsername}
                      </span>
                    </div>
                    <span className="text-2xs opacity-30 font-medium">
                      {user.email}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[8px] uppercase font-black tracking-[0.2em] opacity-20 px-2">
                    {user.role}
                  </span>

                  {user.role !== "owner" && (
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
