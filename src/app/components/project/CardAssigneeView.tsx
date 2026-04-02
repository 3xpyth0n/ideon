"use client";
import React, { useState, useRef, useEffect } from "react";
import Avatar from "@components/ui/Avatar";
import { UserPlus } from "lucide-react";
import FloatingMenu from "./FloatingMenu";
import AssigneeCheckboxList from "./AssigneeCheckboxList";
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
  isOpen?: boolean;
  onOpen?: (pos: { x: number; y: number }) => void;
  onClose?: () => void;
}

export default function CardAssigneeView({
  collaborators,
  value = [],
  onChange,
  isOpen = false,
  onOpen,
  onClose,
}: Props) {
  const { dict } = useI18n();
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const btnRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) setMenuPos(null);
  }, [isOpen]);

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const pos = { x: Math.round(rect.left), y: Math.round(rect.bottom + 6) };
    setMenuPos(pos);
    onOpen?.(pos);
  };

  const selected = collaborators.filter((c) => value.includes(c.id));

  return (
    <div className="card-assignee-view" ref={btnRef}>
      <div
        className="flex items-center gap-1"
        onClick={handleOpen}
        role="button"
      >
        {selected.length === 0 ? (
          <div className="text-2xs opacity-50">
            <UserPlus size={16} />
          </div>
        ) : (
          selected
            .slice(0, 3)
            .map((s) => (
              <Avatar
                key={s.id}
                src={s.avatarUrl}
                alt={s.displayName || s.username || ""}
                size={20}
              />
            ))
        )}
        {selected.length > 3 && (
          <div className="text-2xs">+{selected.length - 3}</div>
        )}
      </div>

      {isOpen && menuPos && (
        <FloatingMenu
          style={{ top: menuPos.y, left: menuPos.x } as React.CSSProperties}
          onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        >
          <AssigneeCheckboxList
            collaborators={collaborators}
            value={value}
            onChange={(ids) => {
              onChange(ids);
            }}
          />
          <div className="flex justify-end gap-2 px-2 py-2">
            <button
              type="button"
              className="px-2 py-1 rounded"
              onClick={(e) => {
                e.stopPropagation();
                onClose?.();
              }}
            >
              {dict.common.close}
            </button>
          </div>
        </FloatingMenu>
      )}
    </div>
  );
}
