export function formatDateParts(isoString?: string | null, lang = "en") {
  if (!isoString) return { date: "", time: "" };
  const date = new Date(isoString);
  const locale = lang === "fr" ? "fr-FR" : "en-US";
  const parts = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).formatToParts(date);

  const find = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const day = find("day");
  let month = find("month");
  if (lang !== "fr" && month && !month.endsWith(".")) {
    month = `${month}.`;
  }
  const year = find("year");

  const dateStr = `${day} ${month} ${year}`;

  const timeStr = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);

  return { date: dateStr, time: timeStr };
}
