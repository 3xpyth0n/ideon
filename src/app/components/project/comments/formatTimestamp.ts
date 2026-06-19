export function formatTimestamp(isoTimestamp: string, now?: Date): string {
  const date = new Date(isoTimestamp);
  const currentTime = now ?? new Date();
  const elapsedMs = currentTime.getTime() - date.getTime();

  const SECONDS = 1000;
  const MINUTES = 60 * SECONDS;
  const HOURS = 60 * MINUTES;
  const DAY = 24 * HOURS;

  if (elapsedMs < DAY) {
    if (elapsedMs < MINUTES) return "just now";
    if (elapsedMs < HOURS) {
      const mins = Math.floor(elapsedMs / MINUTES);
      return `${mins} minute${mins === 1 ? "" : "s"} ago`;
    }
    const hours = Math.floor(elapsedMs / HOURS);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
