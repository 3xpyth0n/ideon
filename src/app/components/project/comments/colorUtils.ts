const DEFAULT_COLOR = "#6B7280";

/**
 * Converts a hex color string to an rgba() CSS string.
 *
 * Handles:
 * - "#RRGGBB" and "RRGGBB" (with and without hash)
 * - "#RGB" and "RGB" (3-digit shorthand, expanded to 6 digits)
 * - Invalid/null/undefined values fall back to default gray (#6B7280)
 */
export function hexToRgba(
  hex: string | null | undefined,
  opacity: number,
): string {
  let sanitized = normalizeHex(hex);

  if (!sanitized) {
    sanitized = DEFAULT_COLOR.slice(1);
  }

  const r = parseInt(sanitized.slice(0, 2), 16);
  const g = parseInt(sanitized.slice(2, 4), 16);
  const b = parseInt(sanitized.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Normalizes a hex string to a 6-character hex value (no hash).
 * Returns null if the input is invalid.
 */
function normalizeHex(hex: string | null | undefined): string | null {
  if (!hex || typeof hex !== "string") {
    return null;
  }

  let value = hex.trim();

  // Remove leading hash
  if (value.startsWith("#")) {
    value = value.slice(1);
  }

  // Expand 3-digit shorthand (e.g., "F0A" → "FF00AA")
  if (value.length === 3) {
    value = value[0] + value[0] + value[1] + value[1] + value[2] + value[2];
  }

  // Validate: must be exactly 6 hex characters
  if (value.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(value)) {
    return null;
  }

  return value;
}
