import type { Editor } from "@tiptap/react";
import type { MentionUser } from "./MentionTextarea";

/**
 * Utility type for user author info used across comment operations.
 */
export type Author = { id: string; name: string; color: string };

/**
 * A single message within a comment thread (original comment or reply).
 */
export interface CommentMessage {
  id: string;
  authorId: string;
  authorName: string;
  authorColor: string;
  text: string;
  createdAt: string;
}

/**
 * A comment thread attached to a specific text range in a NoteBlock.
 */
export interface CommentThread {
  id: string;
  blockId: string;
  from: number;
  to: number;
  status: "open" | "resolved";
  messages: CommentMessage[];
  resolvedBy?: string;
  resolvedByName?: string;
  resolvedAt?: string;
  createdAt: string;
}

/**
 * Return type for the useCommentStore hook.
 */
export interface UseCommentStoreReturn {
  threads: CommentThread[];
  activeThreads: CommentThread[];
  createThread: (params: {
    from: number;
    to: number;
    text: string;
    author: Author;
  }) => CommentThread | null;
  addReply: (
    threadId: string,
    params: { text: string; author: Author },
  ) => void;
  resolveThread: (
    threadId: string,
    resolver: { id: string; name: string },
  ) => void;
  reopenThread: (threadId: string) => void;
  deleteThread: (threadId: string) => void;
  getThread: (threadId: string) => CommentThread | undefined;
}

/**
 * Props for the CommentTrigger button component.
 */
export interface CommentTriggerProps {
  editor: Editor;
  isReadOnly: boolean;
  userRole: "creator" | "owner" | "editor" | "viewer";
  onTrigger: (selection: { from: number; to: number }) => void;
}

/**
 * Props for the CommentPanel container component.
 */
export interface CommentPanelProps {
  blockId: string;
  blockRef: React.RefObject<HTMLDivElement | null>;
  editor: Editor | null;
  isReadOnly: boolean;
  userRole: "creator" | "owner" | "editor" | "viewer";
  currentUser: { id: string; username: string; displayName?: string | null };
  zoom: number;
}

/**
 * Props for the CommentThreadCard display component.
 */
export interface CommentThreadCardProps {
  thread: CommentThread;
  isReadOnly: boolean;
  canResolve: boolean;
  canReply: boolean;
  onReply: (text: string) => void;
  onResolve: () => void;
  onReopen: () => void;
  onDelete: () => void;
  onHighlightHover: (threadId: string | null) => void;
  collaborators?: MentionUser[];
}
