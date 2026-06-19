/**
 * Centralized permission logic for the comment system.
 * Provides a single source of truth for which actions are available
 * based on user role and read-only mode.
 */

export interface CommentPermissions {
  canCreateComment: boolean;
  canReply: boolean;
  canResolve: boolean;
  canReopen: boolean;
  canViewHighlights: boolean;
  canViewThreadsOnHover: boolean;
}

export function useCommentPermissions(params: {
  userRole: "creator" | "owner" | "editor" | "viewer";
  isReadOnly: boolean;
}): CommentPermissions {
  const canMutate = params.userRole !== "viewer" && !params.isReadOnly;

  return {
    canCreateComment: canMutate,
    canReply: canMutate,
    canResolve: canMutate,
    canReopen: canMutate,
    canViewHighlights: true, // Always visible (viewers too)
    canViewThreadsOnHover: true, // Always visible (viewers too)
  };
}
