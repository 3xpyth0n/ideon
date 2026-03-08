interface IntegrationCardProps {
  name: string;
  description: string;
  icon: string;
  enabled: boolean;
  comingSoonText: string;
}

export function IntegrationCard({
  name,
  description,
  icon,
  enabled,
  comingSoonText,
}: IntegrationCardProps) {
  return (
    <div className="integration-card integration-card-disabled">
      <div className="integration-icon-wrapper">
        <img src={icon} alt={name} width={32} height={32} />
      </div>
      <div>
        <div className="integration-name">{name}</div>
        <div className="integration-description">{description}</div>
      </div>
      {!enabled && <div className="coming-soon-overlay">{comingSoonText}</div>}
    </div>
  );
}
