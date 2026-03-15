export type IntegrationReleaseStatus = "coming_soon" | "beta" | "released";

export type IntegrationImportSource = "zip" | "directoryPath";

export interface IntegrationImportCapability {
  enabled: boolean;
  sources: IntegrationImportSource[];
  acceptsProjectName?: boolean;
}

export interface IntegrationManifest {
  id: string;
  name: string;
  description: string;
  iconUrl: string;
  category:
    | "notes"
    | "communication"
    | "automation"
    | "design"
    | "productivity"
    | "deployment";
  releaseStatus: IntegrationReleaseStatus;
  enabled?: boolean;
  capabilities?: IntegrationCapabilities;
  nameKey: string;
  descriptionKey: string;
}

export interface IntegrationCapabilities {
  import?: boolean | IntegrationImportCapability;
  export?: boolean;
  webhooks?: boolean;
  oauth?: boolean;
  realtime?: boolean;
}

export function getIntegrationReleaseStatus(
  integration: IntegrationManifest,
): IntegrationReleaseStatus {
  if (integration.releaseStatus) {
    return integration.releaseStatus;
  }
  return integration.enabled ? "released" : "coming_soon";
}

export function getImportCapability(
  integration: IntegrationManifest,
): IntegrationImportCapability | null {
  const importCapability = integration.capabilities?.import;

  if (!importCapability) {
    return null;
  }

  if (typeof importCapability === "boolean") {
    return importCapability
      ? {
          enabled: true,
          sources: ["zip"],
          acceptsProjectName: true,
        }
      : null;
  }

  if (!importCapability.enabled) {
    return null;
  }

  return importCapability;
}
