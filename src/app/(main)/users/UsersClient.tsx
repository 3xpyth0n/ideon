"use client";

import { useState, useEffect } from "react";
import { Trash2, Copy, Check, ChevronDown, RefreshCw } from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import { Button } from "@components/ui/Button";
import { Modal } from "@components/ui/Modal";
import { Select } from "@components/ui/Select";
import { UserDetailsModal } from "@components/users/UserDetailsModal";
import { getAvatarUrl } from "@lib/utils";
import { toast } from "sonner";

interface UserProfile {
  id: string;
  email: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  role: "superadmin" | "admin" | "member";
  createdAt: string;
  lastOnline: string | null;
  invitedByUserId: string | null;
  inviterDisplayName: string | null;
  inviterEmail: string | null;
}

interface Invitation {
  id: string;
  email: string;
  token: string;
  role: "admin" | "member";
  createdAt: string;
  expiresAt: string;
}

interface UsersClientProps {
  currentUserRole: "superadmin" | "admin";
}

export default function UsersClient({ currentUserRole }: UsersClientProps) {
  const { dict } = useI18n();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [inviting, setInviting] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [openUserRoleId, setOpenUserRoleId] = useState<string | null>(null);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [deleteInviteId, setDeleteInviteId] = useState<string | null>(null);
  const [selectedUserForModal, setSelectedUserForModal] =
    useState<UserProfile | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, invitesRes] = await Promise.all([
        fetch("/api/users"),
        fetch("/api/users/invite"),
      ]);

      if (usersRes.ok && invitesRes.ok) {
        const usersData = await usersRes.json();
        const invitesData = await invitesRes.json();
        setUsers(usersData);
        setInvitations(invitesData);
      }
    } catch (_err) {
      console.error("Failed to fetch users data", _err);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    setLastInviteUrl(null);
    setIsCopied(false);
    try {
      const res = await fetch("/api/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });

      const data = await res.json();

      if (res.ok) {
        setInviteEmail("");
        setInviteRole("member");
        setLastInviteUrl(data.inviteUrl);
        toast.success(dict.common.success);
        fetchData();
      } else {
        toast.error(data.error || dict.common.error);
      }
    } catch (_err) {
      toast.error(dict.common.error);
    } finally {
      setInviting(false);
    }
  };

  const handleUpdateRole = async (
    userId: string,
    newRole: "admin" | "member",
  ) => {
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });

      if (res.ok) {
        setUsers(
          users.map((u) => (u.id === userId ? { ...u, role: newRole } : u)),
        );
        toast.success(dict.common.success);
      }
    } catch (err) {
      console.error("Failed to update role", err);
      toast.error(dict.common.error);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setUsers(users.filter((u) => u.id !== userId));
        setDeleteUserId(null);
        toast.success(dict.common.success);
      }
    } catch (err) {
      console.error("Failed to delete user", err);
      toast.error(dict.common.error);
    }
  };

  const handleResendInvitation = async (inviteId: string) => {
    setResendingId(inviteId);
    try {
      const res = await fetch(`/api/users/invite/${inviteId}`, {
        method: "PUT",
      });

      if (res.ok) {
        const data = await res.json();
        // Update invitations list with new token/expiry if needed,
        // but fetchData is simpler and ensures consistency
        fetchData();

        // Show the fallback UI with the new URL in case email fails
        setLastInviteUrl(data.inviteUrl);
        setShowInviteModal(true);
      }
    } catch (err) {
      console.error("Failed to resend invitation", err);
    } finally {
      setResendingId(null);
    }
  };

  const handleDeleteInvitation = async (inviteId: string) => {
    try {
      const res = await fetch(`/api/users/invite/${inviteId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setInvitations(invitations.filter((i) => i.id !== inviteId));
        setDeleteInviteId(null);
      }
    } catch (err) {
      console.error("Failed to delete invitation", err);
    }
  };

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-b-2 border-text-main"></div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-12 pb-20 px-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-1">
            {dict.common.users}
          </h1>
          <p className="text-sm opacity-40">{dict.common.usersSubtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchData()}
            disabled={loading}
            title={dict.common?.refresh}
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          </button>
          <Button
            onClick={() => setShowInviteModal(true)}
            className="btn-primary"
          >
            {dict.common.inviteUser}
          </Button>
        </div>
      </div>

      <div className="space-y-16">
        {/* Active Members Section */}
        <section className="space-y-8">
          <div className="section-header-row">
            <h2 className="text-3xl font-bold tracking-tight text-text-main">
              {dict.common.activeMembers}
            </h2>
            <span className="text-[10px] font-bold">{users.length}</span>
          </div>

          <div className="flex flex-col gap-4">
            {users.map((user) => (
              <div
                key={user.id}
                className="user-card group transition-colors"
                onContextMenu={(e) => {
                  e.preventDefault();
                  setSelectedUserForModal(user);
                }}
              >
                <div className="flex items-center gap-6">
                  <div className="avatar-container bg-border/5 flex-shrink-0 border border-border/10">
                    <img
                      src={getAvatarUrl(user.avatarUrl, user.username)}
                      alt={user.username || ""}
                      className="img-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-bold tracking-tight">
                        {user.displayName ||
                          user.username ||
                          dict.common.defaultUsername}
                      </span>
                      <span
                        className={`role-badge ${
                          user.role === "superadmin"
                            ? "role-badge-superadmin"
                            : user.role === "admin"
                              ? "role-badge-admin"
                              : "role-badge-member"
                        }`}
                      >
                        {user.role === "superadmin"
                          ? dict.common.superadmin
                          : user.role === "admin"
                            ? dict.common.admin
                            : dict.common.member}
                      </span>
                    </div>
                    <div className="user-email-text">{user.email}</div>
                  </div>
                </div>

                <div className="flex items-center gap-4 opacity-0 group-hover:opacity-100 transition-all">
                  {currentUserRole === "superadmin" &&
                    user.role !== "superadmin" && (
                      <>
                        <div className="user-role-select">
                          <button
                            type="button"
                            onClick={() =>
                              setOpenUserRoleId(
                                openUserRoleId === user.id ? null : user.id,
                              )
                            }
                            className="user-role-trigger"
                          >
                            <span>
                              {user.role === "admin"
                                ? dict.common.admin
                                : dict.common.member}
                            </span>
                            <ChevronDown
                              size={10}
                              className={`transition-transform duration-200 opacity-20 ${
                                openUserRoleId === user.id ? "rotate-180" : ""
                              }`}
                            />
                          </button>

                          {openUserRoleId === user.id && (
                            <>
                              <div
                                className="fixed inset-0 z-[90]"
                                onClick={() => setOpenUserRoleId(null)}
                              />
                              <div className="user-role-dropdown">
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleUpdateRole(user.id, "member");
                                    setOpenUserRoleId(null);
                                  }}
                                  className={`select-option ${
                                    user.role === "member"
                                      ? "bg-text-main/5"
                                      : ""
                                  }`}
                                >
                                  <span className="text-[10px] uppercase font-bold tracking-tight">
                                    {dict.common.member}
                                  </span>
                                  {user.role === "member" && (
                                    <Check size={10} className="opacity-40" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleUpdateRole(user.id, "admin");
                                    setOpenUserRoleId(null);
                                  }}
                                  className={`select-option ${
                                    user.role === "admin"
                                      ? "bg-text-main/5"
                                      : ""
                                  }`}
                                >
                                  <span className="text-[10px] uppercase font-bold tracking-tight">
                                    {dict.common.admin}
                                  </span>
                                  {user.role === "admin" && (
                                    <Check size={10} className="opacity-40" />
                                  )}
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                        <button
                          onClick={() => setDeleteUserId(user.id)}
                          className="p-2 text-red-500 opacity-40 hover:opacity-100 transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Pending Invitations Section */}
        <section className="space-y-8 pt-24 border-border/5">
          <div className="section-header-row">
            <h2 className="text-3xl font-bold tracking-tight text-text-main">
              {dict.common.pendingInvites}
            </h2>
            <span className="text-[10px] font-bold">{invitations.length}</span>
          </div>

          {invitations.length === 0 ? (
            <div className="py-12 flex items-center justify-center">
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] opacity-10">
                {dict.common.noPendingInvites}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {invitations.map((invite) => (
                <div
                  key={invite.id}
                  className="user-card group transition-colors"
                >
                  <div className="flex items-baseline gap-3">
                    <span className="text-sm font-bold text-text-main leading-none">
                      {invite.email}
                    </span>
                    <span
                      className={`role-badge !m-0 !py-0.5 inline-block ${
                        invite.role === "admin"
                          ? "role-badge-admin"
                          : "role-badge-member"
                      }`}
                    >
                      {invite.role === "admin"
                        ? dict.common.admin
                        : dict.common.member}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 opacity-0 group-hover:opacity-100 transition-all">
                    <button
                      onClick={() => handleResendInvitation(invite.id)}
                      disabled={resendingId === invite.id}
                      className="p-2 opacity-40 hover:opacity-100 transition-all relative group/tooltip"
                    >
                      {resendingId === invite.id ? (
                        <div className="w-3.5 h-3.5 border-2 border-blue-500/30 border-t-blue-500 animate-spin" />
                      ) : (
                        <RefreshCw size={14} />
                      )}
                      <span className="tooltip">
                        {dict.common.resendInvite}
                      </span>
                    </button>
                    <button
                      onClick={() => setDeleteInviteId(invite.id)}
                      className="p-2 text-red-500 opacity-40 hover:opacity-100 transition-all relative group/tooltip"
                    >
                      <Trash2 size={14} />
                      <span className="tooltip">
                        {dict.common.deleteInvite}
                      </span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Invite Modal */}
      <Modal
        isOpen={showInviteModal}
        onClose={() => {
          setShowInviteModal(false);
          setLastInviteUrl(null);
        }}
        title={!lastInviteUrl ? dict.common.inviteUser : undefined}
        subtitle={!lastInviteUrl ? dict.common.usersSubtitle : undefined}
      >
        {lastInviteUrl ? (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col items-center justify-center pb-12">
              <h3 className="text-xl font-bold mb-2">
                {dict.common.inviteSuccessTitle}
              </h3>
              <p className="modal-description-center">
                {dict.common.inviteSuccessSubtitle}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <label className="modal-label">
                {dict.common.directInviteLabel}
              </label>
              <div className="relative group">
                <input
                  readOnly
                  value={lastInviteUrl}
                  className="zen-input invite-url-input"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(lastInviteUrl);
                    setIsCopied(true);
                    setTimeout(() => setIsCopied(false), 2000);
                  }}
                  className="copy-btn-absolute"
                >
                  {isCopied ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
            </div>

            <div className="modal-footer-right">
              <Button
                onClick={() => {
                  setShowInviteModal(false);
                  setLastInviteUrl(null);
                }}
                className="btn-primary"
              >
                {dict.common.close}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleInvite} className="flex flex-col gap-6">
            <div className="form-group">
              <label className="modal-label">{dict.common.email}:</label>
              <input
                type="email"
                required
                autoFocus
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="zen-input"
                placeholder={dict.common.emailPlaceholder}
              />
            </div>

            {currentUserRole === "superadmin" && (
              <div className="form-row-horizontal">
                <label className="modal-label">{dict.common.role}</label>
                <Select
                  value={inviteRole}
                  onChange={(val) => setInviteRole(val as "member" | "admin")}
                  options={[
                    { value: "member", label: dict.common.member },
                    { value: "admin", label: dict.common.admin },
                  ]}
                  align="right"
                />
              </div>
            )}

            <div className="text-right">
              <Button
                type="submit"
                disabled={inviting || !inviteEmail}
                className="btn-primary"
              >
                {inviting ? (
                  <div className="w-4 h-4 border-2 border-background/30 border-t-background animate-spin" />
                ) : (
                  dict.common.invite
                )}
              </Button>
            </div>
          </form>
        )}
      </Modal>
      {/* Delete User Confirmation Modal */}
      <Modal
        isOpen={!!deleteUserId}
        onClose={() => setDeleteUserId(null)}
        title={dict.common.deleteUserTitle}
        subtitle={dict.common.deleteUserDescription}
      >
        <div className="flex justify-end gap-3 mt-6">
          <Button
            onClick={() => handleDeleteUser(deleteUserId!)}
            className="btn-danger"
          >
            {dict.common.delete}
          </Button>
          <Button onClick={() => setDeleteUserId(null)} className="btn-ghost">
            {dict.common.cancel}
          </Button>
        </div>
      </Modal>

      {/* Delete Invitation Confirmation Modal */}
      <Modal
        isOpen={!!deleteInviteId}
        onClose={() => setDeleteInviteId(null)}
        title={dict.common.deleteInviteTitle}
        subtitle={dict.common.deleteInviteDescription}
      >
        <div className="flex justify-end gap-3 mt-6">
          <Button
            onClick={() => handleDeleteInvitation(deleteInviteId!)}
            className="btn-danger"
          >
            {dict.common.delete}
          </Button>
          <Button onClick={() => setDeleteInviteId(null)} className="btn-ghost">
            {dict.common.cancel}
          </Button>
        </div>
      </Modal>

      <UserDetailsModal
        user={selectedUserForModal}
        isOpen={!!selectedUserForModal}
        onClose={() => setSelectedUserForModal(null)}
      />
    </div>
  );
}
