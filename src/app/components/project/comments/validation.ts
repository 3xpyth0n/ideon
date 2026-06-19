/**
 * Result of comment text validation.
 */
export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Maximum allowed characters for a comment or reply.
 */
const MAX_COMMENT_LENGTH = 2000;

/**
 * Regex matching strings composed entirely of whitespace characters,
 * including standard whitespace and zero-width spaces (\u200B, \uFEFF).
 */
const WHITESPACE_ONLY_REGEX = /^[\s\u200B\uFEFF]*$/;

/**
 * Validates comment or reply text before submission.
 *
 * - Rejects empty strings
 * - Rejects whitespace-only strings (spaces, tabs, newlines, zero-width spaces)
 * - Rejects text exceeding 2000 characters
 * - Accepts valid text with at least one non-whitespace character and ≤2000 chars
 */
export function validateCommentText(text: string): ValidationResult {
  if (text.length === 0 || WHITESPACE_ONLY_REGEX.test(text)) {
    return { valid: false, reason: "Comment cannot be empty" };
  }

  if (text.length > MAX_COMMENT_LENGTH) {
    return { valid: false, reason: "Comment exceeds 2000 character limit" };
  }

  return { valid: true };
}
