/**
 * Simple storage abstraction prepared for S3 integration.
 * Currently uses local URLs/paths.
 */

export interface StorageResult {
  url: string;
  path: string;
  size: number;
  mimeType: string;
}

/**
 * Returns a publicly accessible URL for a given storage path.
 */
export function getStorageUrl(path: string): string {
  if (path.startsWith("http")) return path;
  // In the future, this would return an S3 signed URL or CDN URL
  return `/api/storage?path=${encodeURIComponent(path)}`;
}

/**
 * Validates if a file is allowed for upload.
 */
export function isAllowedFile(mimeType: string, size: number): boolean {
  const MAX_SIZE = 50 * 1024 * 1024; // 50MB
  const ALLOWED_TYPES = [
    "image/",
    "application/pdf",
    "text/",
    "application/zip",
    "application/x-zip-compressed",
    "video/mp4",
  ];

  if (size > MAX_SIZE) return false;
  return ALLOWED_TYPES.some((type) => mimeType.startsWith(type));
}
