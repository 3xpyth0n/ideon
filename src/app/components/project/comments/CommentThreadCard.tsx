"use client";

import { useState, useCallback } from "react";
import { Trash2 } from "lucide-react";
import type { CommentThreadCardProps, CommentMessage } from "./types";
import type { MentionUser } from "./MentionTextarea";
import { MentionTextarea } from "./MentionTextarea";
import { truncateDisplayName } from "./truncateText";
import { truncateCommentText } from "./truncateText";
import { formatTimestamp } from "./formatTimestamp";
import { validateCommentText } from "./validation";

/**
 * Renders a single comment message (original or reply).
 * Shows author name with color indicator, timestamp, and text with expand toggle.
 */
function MessageDisplay({ message }: { message: CommentMessage }) {
  const [expanded, setExpanded] = useState(false);
  const { truncated, isOverflow } = truncateCommentText(message.text);
  const displayText = expanded ? message.text : truncated;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: message.authorColor }}
          aria-hidden="true"
        />
        <span className="text-xs font-medium text-gray-200 truncate">
          {truncateDisplayName(message.authorName)}
        </span>
        <span className="text-xs text-gray-400 whitespace-nowrap ml-auto">
          {formatTimestamp(message.createdAt)}
        </span>
      </div>
      <p className="text-sm text-gray-300 whitespace-pre-wrap wrap-break-word pl-4">
        {displayText}
      </p>
      {isOverflow && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors pl-4 text-left"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

/**
 * Reply input component that validates text before submission.
 * Submits on Enter (without Shift), Shift+Enter inserts newline.
 * Shows validation errors after attempted submission.
 */
function ReplyInput({
  onReply,
  collaborators = [],
}: {
  onReply: (text: string) => void;
  collaborators?: MentionUser[];
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(() => {
    const result = validateCommentText(text);
    if (!result.valid) {
      setError(result.reason ?? "Invalid input");
      return;
    }
    onReply(text);
    setText("");
    setError(null);
  }, [text, onReply]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleChange = useCallback(
    (newValue: string) => {
      setText(newValue);
      if (error) setError(null);
    },
    [error],
  );

  return (
    <div className="mt-2 pt-2 border-t border-gray-700">
      <MentionTextarea
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Reply..."
        rows={1}
        collaborators={collaborators}
        className="w-full resize-none rounded border border-gray-600 bg-gray-900 px-2 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

/**
 * CommentThreadCard displays a comment thread including the original comment
 * and all replies in chronological order. Replies are visually distinguished
 * with a left border and indentation. Scrollable when replies exceed 10.
 *
 * Includes resolve/reopen action buttons for users with Editor_Role (canResolve=true).
 * Shows reply input for users with Editor_Role (canReply=true).
 */
export function CommentThreadCard({
  thread,
  canResolve,
  canReply,
  onReply,
  onDelete,
  onHighlightHover,
  collaborators = [],
}: CommentThreadCardProps) {
  const originalMessage = thread.messages[0];
  const replies = thread.messages.slice(1);

  if (!originalMessage) return null;

  return (
    <div
      className="rounded-lg border border-gray-700 bg-gray-800 p-3 shadow-sm w-full"
      onMouseEnter={() => onHighlightHover(thread.id)}
      onMouseLeave={() => onHighlightHover(null)}
    >
      {/* Header with original comment and resolve/reopen action */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <MessageDisplay message={originalMessage} />
        </div>

        {/* Delete button: visible for editors */}
        {canResolve && (
          <button
            onClick={onDelete}
            className="shrink-0 p-1 rounded hover:bg-red-900/30 text-red-400 hover:text-red-300 transition-colors"
            title="Delete"
            aria-label="Delete thread"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Replies */}
      {replies.length > 0 && (
        <div
          className={`mt-2 border-l-2 border-gray-600 pl-3 flex flex-col gap-2 ${
            replies.length > 10 ? "overflow-y-auto max-h-[300px]" : ""
          }`}
        >
          {replies.map((reply) => (
            <MessageDisplay key={reply.id} message={reply} />
          ))}
        </div>
      )}

      {/* Reply input - only visible for editors (canReply=true) */}
      {canReply && (
        <ReplyInput onReply={onReply} collaborators={collaborators} />
      )}
    </div>
  );
}
