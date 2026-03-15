"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@providers/I18nProvider";
import { IntegrationCard } from "./IntegrationCard";
import {
  getAllIntegrations,
  getImportCapability,
  getIntegrationReleaseStatus,
} from "@lib/integrations";
import IntegrationImportModal from "./IntegrationImportModal";
import VercelConfigModal from "./VercelConfigModal";

export default function IntegrationsClient() {
  const { dict } = useI18n();
  const integrations = getAllIntegrations();
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<
    string | null
  >(null);
  const [configIntegrationId, setConfigIntegrationId] = useState<string | null>(
    null,
  );

  const selectedIntegration = useMemo(
    () =>
      integrations.find(
        (integration) => integration.id === selectedIntegrationId,
      ) || null,
    [integrations, selectedIntegrationId],
  );

  const selectedCapability = selectedIntegration
    ? getImportCapability(selectedIntegration)
    : null;

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
            {integrations.map((integration) =>
              (() => {
                const releaseStatus = getIntegrationReleaseStatus(integration);
                const importCapability = getImportCapability(integration);
                const canOpenImport =
                  Boolean(importCapability) && releaseStatus !== "coming_soon";

                return (
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
                    releaseStatus={releaseStatus}
                    comingSoonText={dict.integrations.comingSoon}
                    betaText={dict.integrations.beta}
                    actionLabel={
                      canOpenImport ? dict.integrations.importAction : undefined
                    }
                    onAction={
                      canOpenImport
                        ? () => setSelectedIntegrationId(integration.id)
                        : undefined
                    }
                    configureLabel={
                      integration.capabilities?.oauth
                        ? dict.integrations.vercelConfigure || "Configure"
                        : undefined
                    }
                    onConfigure={
                      integration.capabilities?.oauth
                        ? () => setConfigIntegrationId(integration.id)
                        : undefined
                    }
                  />
                );
              })(),
            )}
          </div>
        </main>
      </div>

      {selectedIntegration && selectedCapability && (
        <IntegrationImportModal
          integration={selectedIntegration}
          capability={selectedCapability}
          onClose={() => setSelectedIntegrationId(null)}
        />
      )}

      {configIntegrationId === "vercel" && (
        <VercelConfigModal onClose={() => setConfigIntegrationId(null)} />
      )}
    </div>
  );
}
