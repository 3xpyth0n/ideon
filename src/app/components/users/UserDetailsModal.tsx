"use client";

import React from "react";
import { useI18n } from "@providers/I18nProvider";
import { Modal } from "@components/ui/Modal";
import { getAvatarUrl } from "@lib/utils";

interface User {
  id: string;
  email: string;
  username: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  role: string;
  createdAt: string;
  lastOnline: string | null;
  invitedByUserId?: string | null;
  inviterDisplayName?: string | null;
  inviterEmail?: string | null;
}

interface UserDetailsModalProps {
  user: User | null;
  isOpen: boolean;
  onClose: () => void;
}

export function UserDetailsModal({
  user,
  isOpen,
  onClose,
}: UserDetailsModalProps) {
  const { dict } = useI18n();

  if (!user) return null;

  const formatDate = (isoString: string | null | undefined) => {
    if (!isoString) return "—";
    const date = new Date(isoString);
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "superadmin":
        return dict.management.superadmin;
      case "admin":
        return dict.management.admin;
      default:
        return dict.management.member;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={dict.management.userDetails}
      subtitle={user.email}
      className="max-w-2xl w-full"
    >
      <div className="user-details-container">
        <div className="user-details-header">
          <div className="user-details-avatar">
            <img
              src={getAvatarUrl(
                user.avatarUrl,
                user.displayName || user.username,
              )}
              alt={user.displayName || user.username || ""}
            />
          </div>
          <div className="user-details-info">
            <h3 className="user-details-name">
              {user.displayName || user.username}
            </h3>
            <span className="user-details-username">@{user.username}</span>
            <div className="user-details-role">
              <span className="user-details-role-badge">
                {getRoleLabel(user.role)}
              </span>
            </div>
          </div>
        </div>

        <div className="user-details-grid">
          <div className="user-details-item">
            <label className="user-details-label">
              {dict.management.memberSince}
            </label>
            <p className="user-details-value">{formatDate(user.createdAt)}</p>
          </div>

          <div className="user-details-item">
            <label className="user-details-label">
              {dict.management.lastOnline}
            </label>
            <p className="user-details-value">{formatDate(user.lastOnline)}</p>
          </div>

          <div className="user-details-item">
            <label className="user-details-label">
              {dict.management.invitedBy}
            </label>
            <div className="user-details-value">
              {user.invitedByUserId ? (
                <div className="user-details-inviter">
                  <span className="user-details-inviter-name">
                    {user.inviterDisplayName ||
                      user.inviterEmail ||
                      user.invitedByUserId}
                  </span>
                  {user.inviterEmail && (
                    <span className="user-details-inviter-email">
                      {user.inviterEmail}
                    </span>
                  )}
                </div>
              ) : (
                <span className="user-details-manual">
                  {dict.auth.manualSignup}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
