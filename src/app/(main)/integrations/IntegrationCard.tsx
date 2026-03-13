interface IntegrationCardProps {
  name: string;
  description: string;
  icon: string;
  releaseStatus: "coming_soon" | "beta" | "released";
  comingSoonText: string;
  betaText: string;
  actionLabel?: string;
  onAction?: () => void;
  actionLoading?: boolean;
}

export function IntegrationCard({
  name,
  description,
  icon,
  releaseStatus,
  comingSoonText,
  betaText,
  actionLabel,
  onAction,
  actionLoading,
}: IntegrationCardProps) {
  const isComingSoon = releaseStatus === "coming_soon";
  const isBeta = releaseStatus === "beta";

  return (
    <div
      className={`integration-card ${
        isComingSoon ? "integration-card-disabled" : ""
      }`}
    >
      <div className="integration-icon-wrapper">
        <img src={icon} alt={name} width={32} height={32} />
      </div>
      <div>
        <div className="integration-name">{name}</div>
        <div className="integration-description">{description}</div>
      </div>

      {!isComingSoon && actionLabel && onAction && (
        <div className="integration-card-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={onAction}
            disabled={Boolean(actionLoading)}
          >
            {actionLoading ? "..." : actionLabel}
          </button>
        </div>
      )}

      {isBeta && <div className="integration-beta-badge">{betaText}</div>}

      {isComingSoon && (
        <div className="coming-soon-overlay">{comingSoonText}</div>
      )}
    </div>
  );
}
