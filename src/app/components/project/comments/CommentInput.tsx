"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { validateCommentText } from "./validation";
import {
  MentionTextarea,
  type MentionTextareaRef,
  type MentionUser,
} from "./MentionTextarea";

export interface CommentInputProps {
  onSubmit: (text: string) => void;
  onCancel: () => void;
  collaborators?: MentionUser[];
}

/**
 * CommentInput provides a textarea for creating new comment threads.
 * Supports @mention autocomplete for project collaborators.
 */
export function CommentInput({
  onSubmit,
  onCancel,
  collaborators = [],
}: CommentInputProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mentionRef = useRef<MentionTextareaRef>(null);

  useEffect(() => {
    mentionRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        if (text.trim().length === 0) {
          onCancel();
        }
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [text, onCancel]);

  const handleSubmit = useCallback(() => {
    const result = validateCommentText(text);
    if (!result.valid) {
      setError(result.reason ?? "Invalid input");
      return;
    }
    onSubmit(text);
  }, [text, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    },
    [handleSubmit, onCancel],
  );

  const handleChange = useCallback(
    (newValue: string) => {
      setText(newValue);
      if (error) setError(null);
    },
    [error],
  );

  return (
    <div ref={containerRef} className="w-full">
      <MentionTextarea
        ref={mentionRef}
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Add a comment..."
        rows={2}
        autoFocus
        collaborators={collaborators}
        className="w-full resize-none rounded border border-gray-600 bg-gray-900 px-2 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
