"use client";
import React from "react";
import { getAvatarUrl } from "@lib/utils";

type UserProfileMinimal = {
  id?: string;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
};

interface AvatarProps {
  user?: UserProfileMinimal | null;
  src?: string | null;
  size?: number;
  className?: string;
  alt?: string;
}

export default function Avatar({
  user,
  src,
  size = 24,
  className = "",
  alt = "",
}: AvatarProps) {
  const imageSrc =
    src ??
    (user
      ? getAvatarUrl(user.avatarUrl || null, user.username || null)
      : undefined);
  const initials = user?.displayName
    ? user.displayName
        .split(" ")
        .map((s) => s[0])
        .slice(0, 2)
        .join("")
    : user?.username
      ? (user.username || "").slice(0, 2).toUpperCase()
      : "";

  return (
    <div
      className={`rounded-full overflow-hidden bg-white/6 flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {imageSrc ? (
        <img
          src={imageSrc}
          alt={alt || user?.displayName || user?.username || ""}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span className="text-2xs font-medium">{initials}</span>
      )}
    </div>
  );
}
