"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Smile } from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import { useUserMap } from "./UserMapContext";

interface Reaction {
  emoji: string;
  count: number;
  users: (string | { id: string; username: string })[];
}

interface BlockReactionsProps {
  reactions?: Reaction[];
  onReact: (emoji: string) => void;
  onRemoveReaction: (emoji: string) => void;
  currentUserId?: string;
  isReadOnly?: boolean;
}

const PREDEFINED_EMOJIS = ["👍", "👎", "😄", "🎉", "😕", "❤️", "🚀", "👀"];

export const BlockReactions = ({
  reactions = [],
  onReact,
  onRemoveReaction,
  currentUserId,
  isReadOnly,
}: BlockReactionsProps) => {
  const { dict, lang } = useI18n();
  const { resolveUser } = useUserMap();
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close picker when clicking outside
  useEffect(() => {
    if (!showPicker) return;

    const handleClickOutside = (event: Event) => {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setShowPicker(false);
      }
    };

    document.addEventListener("pointerdown", handleClickOutside, {
      capture: true,
    });
    document.addEventListener("mousedown", handleClickOutside, {
      capture: true,
    });
    return () => {
      document.removeEventListener("pointerdown", handleClickOutside, {
        capture: true,
      });
      document.removeEventListener("mousedown", handleClickOutside, {
        capture: true,
      });
    };
  }, [showPicker]);

  const listFormatter = useMemo(
    () => new Intl.ListFormat(lang, { style: "long", type: "conjunction" }),
    [lang],
  );

  const toggleReaction = useCallback(
    (emoji: string) => {
      if (isReadOnly) return;
      const existingReaction = reactions.find((r) => r.emoji === emoji);
      const hasReacted =
        existingReaction && currentUserId
          ? existingReaction.users.some((u) =>
              typeof u === "string"
                ? u === currentUserId
                : u.id === currentUserId,
            )
          : false;

      if (hasReacted) {
        onRemoveReaction(emoji);
      } else {
        onReact(emoji);
      }
      setShowPicker(false);
    },
    [isReadOnly, onReact, onRemoveReaction, reactions, currentUserId],
  );

  if (reactions.length === 0 && isReadOnly) return null;

  return (
    <div className="block-reactions-container">
      <div className="reactions-wrapper">
        {/* Existing Reactions */}
        {reactions.length > 0 && (
          <div className="reactions-list">
            {reactions.map((reaction) => {
              const hasReacted = currentUserId
                ? reaction.users.some((u) =>
                    typeof u === "string"
                      ? u === currentUserId
                      : u.id === currentUserId,
                  )
                : false;

              const userNames = reaction.users
                .map((u) => {
                  const userId = typeof u === "string" ? u : u.id;
                  const resolved = resolveUser(userId);
                  if (resolved) {
                    return resolved.displayName || resolved.username;
                  }
                  return typeof u === "object" ? u.username : u;
                })
                .filter((n): n is string => !!n);

              // Determine tooltip color: use first user's color if single user, otherwise black
              let tooltipColor = "#000";
              if (reaction.users.length === 1) {
                const firstUserId =
                  typeof reaction.users[0] === "string"
                    ? reaction.users[0]
                    : reaction.users[0].id;
                const resolved = resolveUser(firstUserId);
                if (resolved?.color) {
                  tooltipColor = resolved.color;
                }
              }

              return (
                <button
                  key={reaction.emoji}
                  onClick={() => toggleReaction(reaction.emoji)}
                  className={`reaction-badge ${
                    hasReacted ? "active" : "inactive"
                  } group relative`}
                  disabled={isReadOnly}
                >
                  <span>{reaction.emoji}</span>
                  <span className="font-medium">{reaction.count}</span>
                  <div
                    className="user-presence-tooltip"
                    style={
                      {
                        "--user-color": tooltipColor,
                        bottom: "100%",
                        left: "50%",
                        top: "auto",
                        marginBottom: "8px",
                        whiteSpace: "nowrap",
                      } as React.CSSProperties
                    }
                  >
                    {listFormatter.format(userNames)}
                    <div
                      className="user-presence-tooltip-arrow"
                      style={{
                        top: "100%",
                        bottom: "auto",
                        marginTop: "-3px",
                        transform: "translateX(-50%) rotate(225deg)",
                      }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Add Reaction Button */}
        {!isReadOnly && (
          <div className="add-reaction-group">
            <button
              ref={buttonRef}
              onClick={() => setShowPicker(!showPicker)}
              className={`add-reaction-btn ${showPicker ? "active" : ""}`}
              title={dict.blocks.addReaction || "Add reaction"}
            >
              <Smile size={16} />
            </button>

            {/* Emoji Picker Tooltip */}
            {showPicker && (
              <div className="emoji-picker-tooltip" ref={pickerRef}>
                {PREDEFINED_EMOJIS.map((emoji) => {
                  const existingReaction = reactions.find(
                    (r) => r.emoji === emoji,
                  );
                  const hasReacted =
                    existingReaction && currentUserId
                      ? existingReaction.users.some((u) =>
                          typeof u === "string"
                            ? u === currentUserId
                            : u.id === currentUserId,
                        )
                      : false;

                  return (
                    <button
                      key={emoji}
                      onClick={() => toggleReaction(emoji)}
                      className={`emoji-option-btn ${
                        hasReacted ? "active" : "inactive"
                      }`}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
