import { Check, X } from "lucide-react";
import { useI18n } from "@providers/I18nProvider";

interface AccessRequestToggleProps {
  status: "pending" | "rejected";
  onApprove: () => void;
  onReject: () => void;
  isProcessing?: boolean;
}

export function AccessRequestToggle({
  status,
  onApprove,
  onReject,
  isProcessing,
}: AccessRequestToggleProps) {
  const { dict } = useI18n();

  return (
    <div className="theme-toggle pointer-events-auto">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onReject();
        }}
        className={`theme-btn ${
          status === "rejected" ? "active text-red-500" : "hover:text-red-500"
        }`}
        title={dict.common.reject || "Reject"}
        disabled={isProcessing}
      >
        <X size={16} />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onApprove();
        }}
        className={`theme-btn hover:text-green-500`}
        title={dict.common.approve || "Approve"}
        disabled={isProcessing}
      >
        <Check size={16} />
      </button>
    </div>
  );
}
