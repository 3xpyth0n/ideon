import path from "path";

/**
 * Sanitizes a filename to prevent directory traversal attacks.
 * Removes directory separators and ensures the filename contains only safe characters.
 *
 * @param fileName
 * @returns
 */
export function sanitizeFileName(fileName: string): string {
  const baseName = path.basename(fileName);

  // Remove any remaining non-safe characters
  const safeName = baseName.replace(/[^a-zA-Z0-9.\-_ ]/g, "_");

  // Prevent hidden files (starting with dot)
  if (safeName.startsWith(".")) {
    return `_${safeName.substring(1)}`;
  }

  // Ensure it's not empty
  if (!safeName || safeName.trim() === "") {
    return "unnamed_file";
  }

  return safeName;
}
