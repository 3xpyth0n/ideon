"use client";

import { useState, useEffect } from "react";
import { useI18n } from "@providers/I18nProvider";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@components/ui/Button";
import { Modal } from "@components/ui/Modal";
import { getAvatarUrl } from "@lib/utils";

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
}

export function InviteUserModal({
  isOpen,
  projectId,
  onClose,
}: InviteUserModalProps) {
  const { dict } = useI18n();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [collaborators, setCollaborators] = useState<string[]>([]);

  // Fetch current collaborators to hide them from search results
  useEffect(() => {
    if (!isOpen) return;
    fetch(`/api/projects/${projectId}/collaborators`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: { id: string }[]) => setCollaborators(data.map((c) => c.id)))
      .catch(() => setCollaborators([]));
  }, [projectId, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
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
  }, [query, isOpen]);

  const handleInvite = async (user: UserProfile) => {
    setInvitingId(user.id);
    try {
      const res = await fetch(`/api/projects/${projectId}/collaborators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, role: "editor" }),
      });

      if (res.ok) {
        setCollaborators([...collaborators, user.id]);
      }
    } catch (err) {
      console.error("Failed to invite user", err);
    } finally {
      setInvitingId(null);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={dict.management.inviteUser}
      subtitle={dict.project.inviteUserSubtitle}
    >
      <div className="relative mb-6">
        <input
          autoFocus
          className="zen-input pl-12"
          placeholder={dict.management.searchUsers}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-2">
        {loading ? (
          <div className="py-8 flex items-center justify-center opacity-20">
            <Loader2 className="animate-spin" size={24} />
          </div>
        ) : results.length > 0 ? (
          results.map((user) => {
            const isCollaborator = collaborators.includes(user.id);
            return (
              <div
                key={user.id}
                className="user-card flex items-center justify-between p-3 rounded-none border border-white/5 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/5 flex items-center justify-center overflow-hidden">
                    <img
                      src={getAvatarUrl(user.avatarUrl, user.username)}
                      alt=""
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold tracking-tight">
                      {user.displayName || user.username || "User"}
                    </span>
                    <span className="text-[10px] opacity-40 uppercase font-bold">
                      {user.email}
                    </span>
                  </div>
                </div>

                {isCollaborator ? (
                  <div className="flex items-center gap-2 text-accent opacity-50">
                    <Check size={14} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">
                      {dict.project.userAdded}
                    </span>
                  </div>
                ) : (
                  <Button
                    onClick={() => handleInvite(user)}
                    disabled={invitingId === user.id}
                    className="btn-primary !h-8 !px-4"
                  >
                    {invitingId === user.id ? (
                      <Loader2 className="animate-spin" size={14} />
                    ) : (
                      dict.project.addUser
                    )}
                  </Button>
                )}
              </div>
            );
          })
        ) : query.length >= 2 ? (
          <div className="py-12 text-center opacity-20">
            <p className="text-[10px] font-bold uppercase tracking-[0.3em]">
              {dict.management.noUsersFound}
            </p>
          </div>
        ) : (
          <div className="py-12 text-center opacity-10">
            <p className="text-[10px] font-bold uppercase tracking-[0.3em]">
              {dict.project.startTypingToSearch}
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
