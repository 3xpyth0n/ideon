export function isValidUrl(value: string): boolean {
  if (!value || typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;

  let candidate = trimmed;
  if (/^https?:\/\//i.test(candidate)) {
    candidate = candidate.replace(/^https?:\/\//i, "");
  }

  candidate = candidate.replace(/^www\./i, "");

  const firstSegment = candidate.split("/")[0];
  const dotIndex = firstSegment.lastIndexOf(".");
  if (dotIndex === -1) return false;

  const extension = firstSegment.slice(dotIndex + 1);
  if (extension.length < 2) return false;

  return true;
}

export function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
