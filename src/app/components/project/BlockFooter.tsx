import { Lock, User } from "lucide-react";
import type { Dict } from "@providers/I18nProvider";
import { formatDateParts } from "../../../lib/formatDate";

interface BlockFooterProps {
  updatedAt?: string;
  authorName?: string;
  isLocked?: boolean;
  dict: Dict;
  lang: string;
  children?: React.ReactNode;
}

export function BlockFooter({
  updatedAt,
  authorName,
  isLocked,
  dict,
  lang,
  children,
}: BlockFooterProps) {
  const formatDate = (isoString?: string) => {
    if (!isoString) return "";
    const { date, time } = formatDateParts(isoString, lang);
    return time ? `${date} ${dict.project.at} ${time}` : date;
  };

  return (
    <div className="block-author-container mt-2 pt-3 px-4 pb-3 shrink-0">
      <div className="flex items-center justify-between w-full text-tiny">
        <div className="block-timestamp opacity-40">
          {formatDate(updatedAt || "")}
        </div>
        {children && (
          <div className="flex-1 flex justify-center">{children}</div>
        )}
        <div className="block-author-info flex items-center gap-1.5 opacity-40">
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
