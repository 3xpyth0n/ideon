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
  configureLabel?: string;
  onConfigure?: () => void;
}

export function IntegrationCard({
  name,
  description,
  icon,
  releaseStatus,
  comingSoonText,
  actionLabel,
  onAction,
  actionLoading,
  configureLabel,
  onConfigure,
  betaText = "Beta",
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

      {!isComingSoon && (actionLabel || configureLabel) && (
        <div className="integration-card-actions">
          {actionLabel && onAction && (
            <button
              type="button"
              className="btn-primary"
              onClick={onAction}
              disabled={Boolean(actionLoading)}
            >
              {actionLoading ? "..." : actionLabel}
            </button>
          )}
          {configureLabel && onConfigure && (
            <button
              type="button"
              className="btn-primary"
              onClick={onConfigure}
              disabled={Boolean(actionLoading)}
            >
              {configureLabel}
            </button>
          )}
        </div>
      )}

      {isBeta && <div className="integration-beta-badge">{betaText}</div>}

      {isComingSoon && (
        <div className="coming-soon-overlay">{comingSoonText}</div>
      )}
    </div>
  );
}
