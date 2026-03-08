"use client";

import { useI18n } from "@providers/I18nProvider";
import { IntegrationCard } from "./IntegrationCard";
import { getAllIntegrations } from "@lib/integrations";

export default function IntegrationsClient() {
  const { dict } = useI18n();
  const integrations = getAllIntegrations();

  return (
    <div className="management-container">
      <header className="management-header mt-6">
        <div>
          <h1 className="management-title">{dict.integrations.title}</h1>
          <p className="management-subtitle">{dict.integrations.subtitle}</p>
        </div>
      </header>

      <div className="management-content-wrapper">
        <main className="management-content">
          <div className="integration-grid">
            {integrations.map((integration) => (
              <IntegrationCard
                key={integration.id}
                name={
                  dict.integrations[
                    integration.nameKey as keyof typeof dict.integrations
                  ]
                }
                description={
                  dict.integrations[
                    integration.descriptionKey as keyof typeof dict.integrations
                  ]
                }
                icon={integration.iconUrl}
                enabled={integration.enabled}
                comingSoonText={dict.integrations.comingSoon}
              />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
