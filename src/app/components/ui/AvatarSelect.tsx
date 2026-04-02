"use client";
import React from "react";
import Avatar from "./Avatar";
import { Select } from "@components/ui/Select";
import { getAvatarUrl } from "@lib/utils";
import { useI18n } from "@providers/I18nProvider";

type UserProfile = {
  id: string;
  email?: string;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  role?: string;
  color?: string;
};

interface AvatarSelectProps {
  value: string;
  collaborators: UserProfile[];
  currentUserId?: string;
  onChange: (value: string) => void;
  className?: string;
  triggerClassName?: string;
  dropdownClassName?: string;
  optionClassName?: string;
  hideChevron?: boolean;
  // Optional custom selected value and label (used when a task has a custom name)
  selectedCustomValue?: string;
  selectedCustomLabel?: string | null;
}

export default function AvatarSelect({
  value,
  collaborators,
  onChange,
  currentUserId,
  className = "",
  triggerClassName = "!p-0",
  dropdownClassName = "",
  optionClassName = "",
  hideChevron = true,
  selectedCustomValue,
  selectedCustomLabel,
}: AvatarSelectProps) {
  const { dict } = useI18n();
  const options = collaborators.map((u) => ({
    value: u.id,
    label: (
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 bg-white/5 rounded-full overflow-hidden shrink-0">
          <img
            src={getAvatarUrl(u.avatarUrl || null, u.username || null)}
            alt=""
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        </div>
        <div className="flex flex-col leading-none min-w-0">
          <span className="text-2xs font-medium truncate">
            {u.displayName || u.username}
          </span>
          <span className="text-2xs opacity-40 truncate">
            @{u.username || u.displayName || dict.common.user}
          </span>
        </div>
      </div>
    ),
    triggerLabel: (
      <div title={u.displayName || `@${u.username || dict.common.user}`}>
        <Avatar user={u} size={20} />
      </div>
    ),
  }));

  // Put current user first in options if present
  let orderedOptions = options;
  if (currentUserId) {
    const idx = options.findIndex((o) => o.value === currentUserId);
    if (idx > 0) {
      const [cur] = options.splice(idx, 1);
      orderedOptions = [cur, ...options];
    }
  }

  if (selectedCustomValue && selectedCustomLabel) {
    options.push({
      value: selectedCustomValue,
      label: <span className="text-2xs truncate">{selectedCustomLabel}</span>,
      triggerLabel: (
        <div title={selectedCustomLabel}>
          <Avatar user={{ displayName: selectedCustomLabel }} size={20} />
        </div>
      ),
    });
  }

  options.push({
    value: "__custom__",
    label: (
      <span className="text-2xs opacity-50">+ {dict.common.customName}</span>
    ),
    triggerLabel: (
      <div title={dict.common.customName}>
        <Avatar src={null} size={20} />
      </div>
    ),
  });

  return (
    <div className={`avatar-select ${className}`}>
      <Select
        value={value}
        options={orderedOptions}
        onChange={(v) => onChange(v)}
        triggerClassName={triggerClassName}
        dropdownClassName={dropdownClassName}
        optionClassName={optionClassName}
        hideChevron={hideChevron}
      />
    </div>
  );
}
