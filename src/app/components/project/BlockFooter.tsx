import { Lock, User } from "lucide-react";
import type { Dict } from "@providers/I18nProvider";

interface BlockFooterProps {
  updatedAt?: string;
  authorName?: string;
  isLocked?: boolean;
  dict: Dict;
  lang: string;
}

export function BlockFooter({
  updatedAt,
  authorName,
  isLocked,
  dict,
  lang,
}: BlockFooterProps) {
  const formatDate = (isoString: string) => {
    if (!isoString) return "";
    const date = new Date(isoString);
    const options: Intl.DateTimeFormatOptions = {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    };

    const formatted = new Intl.DateTimeFormat(
      lang === "fr" ? "fr-FR" : "en-US",
      options,
    ).format(date);

    return formatted.replace(",", "").replace(" ", ` ${dict.project.at} `);
  };

  return (
    <div className="block-author-container mt-2 pt-3 px-4 pb-3 shrink-0">
      <div className="flex items-center justify-between w-full text-tiny opacity-40">
        <div className="block-timestamp">{formatDate(updatedAt || "")}</div>
        <div className="block-author-info flex items-center gap-1.5">
          {isLocked && <Lock size={10} className="block-lock-icon" />}
          <div className="flex items-center gap-1 underline underline-offset-2">
            <User size={10} />
            <div className="author-name text-[10px] font-medium">
              {(authorName || dict.project.anonymous).toLowerCase()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
