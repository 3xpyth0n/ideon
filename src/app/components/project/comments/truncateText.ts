/**
 * Truncates a display name to 20 characters with ellipsis if it exceeds the limit.
 */
export function truncateDisplayName(name: string): string {
  if (name.length > 20) {
    return name.slice(0, 20) + "\u2026";
  }
  return name;
}

/**
 * Truncates comment text to 300 characters with ellipsis if it exceeds the limit.
 * Returns the truncated text and whether overflow occurred.
 */
export function truncateCommentText(text: string): {
  truncated: string;
  isOverflow: boolean;
} {
  if (text.length > 300) {
    return { truncated: text.slice(0, 300) + "\u2026", isOverflow: true };
  }
  return { truncated: text, isOverflow: false };
}
