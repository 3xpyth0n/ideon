"use client";

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import { createPortal } from "react-dom";

export interface MentionUser {
  id: string;
  username: string;
  displayName?: string | null;
  color?: string | null;
}

export interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  autoFocus?: boolean;
  collaborators: MentionUser[];
}

export interface MentionTextareaRef {
  focus: () => void;
  textarea: HTMLTextAreaElement | null;
}

/**
 * A textarea with @mention autocomplete support.
 * When the user types "@", a dropdown appears with project collaborators
 * filtered by the text after "@". Selecting a user inserts "@username".
 */
export const MentionTextarea = forwardRef<
  MentionTextareaRef,
  MentionTextareaProps
>(function MentionTextarea(
  {
    value,
    onChange,
    onKeyDown,
    placeholder,
    rows = 1,
    className = "",
    autoFocus,
    collaborators,
  },
  ref,
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mentionState, setMentionState] = useState<{
    active: boolean;
    query: string;
    startIndex: number;
  }>({ active: false, query: "", startIndex: 0 });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
    textarea: textareaRef.current,
  }));

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  const filteredUsers = mentionState.active
    ? collaborators.filter((u) => {
        const q = mentionState.query.toLowerCase();
        return (
          u.username.toLowerCase().includes(q) ||
          (u.displayName ?? "").toLowerCase().includes(q)
        );
      })
    : [];

  // Update dropdown position based on caret
  const updateDropdownPosition = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const rect = textarea.getBoundingClientRect();
    // Position below the textarea (simplified — ideal would be caret-relative)
    setDropdownPos({
      top: rect.bottom + 4,
      left: rect.left,
    });
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      const cursorPos = e.target.selectionStart;
      onChange(newValue);

      // Detect @mention trigger
      const textBeforeCursor = newValue.slice(0, cursorPos);
      const atIndex = textBeforeCursor.lastIndexOf("@");

      if (atIndex !== -1) {
        const charBeforeAt = atIndex > 0 ? textBeforeCursor[atIndex - 1] : " ";
        const textAfterAt = textBeforeCursor.slice(atIndex + 1);
        // @ must be at start or preceded by whitespace, and no space in the query
        if (
          (charBeforeAt === " " || charBeforeAt === "\n" || atIndex === 0) &&
          !textAfterAt.includes(" ")
        ) {
          setMentionState({
            active: true,
            query: textAfterAt,
            startIndex: atIndex,
          });
          setSelectedIndex(0);
          updateDropdownPosition();
          return;
        }
      }

      setMentionState({ active: false, query: "", startIndex: 0 });
    },
    [onChange, updateDropdownPosition],
  );

  const insertMention = useCallback(
    (user: MentionUser) => {
      const before = value.slice(0, mentionState.startIndex);
      const after = value.slice(
        mentionState.startIndex + 1 + mentionState.query.length,
      );
      const mention = `@${user.username} `;
      const newValue = before + mention + after;
      onChange(newValue);
      setMentionState({ active: false, query: "", startIndex: 0 });

      // Move cursor after the mention
      requestAnimationFrame(() => {
        const textarea = textareaRef.current;
        if (textarea) {
          const cursorPos = before.length + mention.length;
          textarea.setSelectionRange(cursorPos, cursorPos);
          textarea.focus();
        }
      });
    },
    [value, onChange, mentionState],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (mentionState.active && filteredUsers.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((i) => (i + 1) % filteredUsers.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex(
            (i) => (i - 1 + filteredUsers.length) % filteredUsers.length,
          );
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          insertMention(filteredUsers[selectedIndex]);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setMentionState({ active: false, query: "", startIndex: 0 });
          return;
        }
      }

      // Pass through to parent handler
      onKeyDown?.(e);
    },
    [mentionState, filteredUsers, selectedIndex, insertMention, onKeyDown],
  );

  // Auto-resize
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, [value]);

  return (
    <>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        className={className}
      />

      {mentionState.active &&
        filteredUsers.length > 0 &&
        createPortal(
          <div
            className="fixed z-99999 rounded-lg bg-gray-800 border border-gray-600 shadow-xl py-1 max-h-[160px] overflow-y-auto min-w-[180px]"
            style={{ top: dropdownPos.top, left: dropdownPos.left }}
          >
            {filteredUsers.slice(0, 8).map((user, i) => (
              <button
                key={user.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(user);
                }}
                className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors ${
                  i === selectedIndex
                    ? "bg-gray-700 text-gray-100"
                    : "text-gray-300 hover:bg-gray-700/50"
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: user.color || "#6B7280" }}
                />
                <span className="truncate">
                  {user.displayName || user.username}
                </span>
                {user.displayName && (
                  <span className="text-xs text-gray-500 truncate">
                    @{user.username}
                  </span>
                )}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
});
