"use client";
import React from "react";
import Avatar from "@components/ui/Avatar";
import { useI18n } from "@providers/I18nProvider";

type UserProfile = {
  id: string;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
};

interface Props {
  collaborators: UserProfile[];
  value?: string[];
  onChange: (ids: string[]) => void;
}

export default function AssigneeCheckboxList({
  collaborators,
  value = [],
  onChange,
}: Props) {
  const { dict } = useI18n();
  const toggle = (id: string) => {
    const next = value.includes(id)
      ? value.filter((x) => x !== id)
      : [...value, id];
    onChange(next);
  };

  return (
    <div className="space-y-2 p-2 w-56">
      {collaborators.map((c) => (
        <label key={c.id} className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={value.includes(c.id)}
            onChange={() => toggle(c.id)}
            className="form-checkbox"
          />
          <div className="flex items-center gap-2">
            <Avatar
              src={c.avatarUrl}
              alt={c.displayName || c.username || ""}
              size={20}
            />
            <div className="text-2xs truncate">
              {c.displayName || c.username || c.id}
            </div>
          </div>
        </label>
      ))}
      {collaborators.length === 0 && (
        <div className="text-2xs opacity-50">{dict.kanban.noCollaborators}</div>
      )}
    </div>
  );
}
