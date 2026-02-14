"use client";

import { useState, useEffect, useCallback } from "react";
import { useI18n } from "@providers/I18nProvider";
import { Loader2, Check } from "lucide-react";
import { getAvatarUrl } from "@lib/utils";
import { Modal } from "@components/ui/Modal";

interface UserProfile {
  id: string;
  email: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  role?: string;
  color?: string;
}

interface TransferBlockModalProps {
  blockId: string | null;
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  currentOwnerId?: string;
  onTransfer: (blockId: string, newOwnerId: string) => Promise<void>;
}

export function TransferBlockModal({
  blockId,
  isOpen,
  onClose,
  projectId,
  currentOwnerId,
  onTransfer,
}: TransferBlockModalProps) {
  const { dict } = useI18n();
  const [collaborators, setCollaborators] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCollaborators = useCallback(async () => {
    if (!projectId || !isOpen) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/collaborators`);
      if (res.ok) {
        const data = await res.json();
        // Filter out the current owner
        setCollaborators(
          data.filter((c: UserProfile) => c.id !== currentOwnerId),
        );
      }
    } catch (err) {
      console.error("Failed to fetch collaborators", err);
    } finally {
      setLoading(false);
    }
  }, [projectId, currentOwnerId, isOpen]);

  useEffect(() => {
    fetchCollaborators();
  }, [fetchCollaborators]);

  const handleTransfer = (user: UserProfile) => {
    if (blockId) {
      onTransfer(blockId, user.id);
    }
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={dict.modals.transferTitle}
      subtitle={dict.modals.transferDescription}
      className="max-w-lg w-full"
    >
      <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
        {loading ? (
          <div className="py-8 flex items-center justify-center opacity-20">
            <Loader2 className="animate-spin" size={24} />
          </div>
        ) : collaborators.length > 0 ? (
          collaborators.map((user) => (
            <div
              key={user.id}
              className="user-card flex items-center justify-between p-3 border border-white/5 bg-white/[0.02] hover:border-white/20 transition-colors cursor-pointer"
              onClick={() => handleTransfer(user)}
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
                  <span className="text-xs font-bold">
                    {user.displayName ||
                      user.username ||
                      dict.account.defaultUsername}
                  </span>
                  <span className="text-2xs opacity-30 font-medium">
                    {user.email}
                  </span>
                </div>
              </div>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                <Check size={16} className="text-text-main" />
              </div>
            </div>
          ))
        ) : (
          <div className="py-8 text-center opacity-30 text-xs uppercase tracking-widest font-bold">
            {dict.management.noUsersFound}
          </div>
        )}
      </div>
    </Modal>
  );
}
