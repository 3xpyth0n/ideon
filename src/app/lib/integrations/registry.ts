import { IntegrationManifest } from "./types";
import type { IntegrationImporter } from "./import/types";

export interface RegisteredIntegration {
  manifest: IntegrationManifest;
  importer?: IntegrationImporter;
}

type RegisterInput =
  | IntegrationManifest
  | { manifest: IntegrationManifest; importer?: IntegrationImporter };

export const integrationRegistry: Map<string, RegisteredIntegration> =
  new Map();

export function registerIntegration(input: RegisterInput): void {
  if ("id" in input) {
    integrationRegistry.set(input.id, { manifest: input });
    return;
  }

  integrationRegistry.set(input.manifest.id, {
    manifest: input.manifest,
    importer: input.importer,
  });
}

export function getIntegration(id: string): IntegrationManifest | undefined {
  return integrationRegistry.get(id)?.manifest;
}

export function getIntegrationImporter(
  id: string,
): IntegrationImporter | undefined {
  return integrationRegistry.get(id)?.importer;
}

export function getAllIntegrations(): IntegrationManifest[] {
  return Array.from(integrationRegistry.values(), (entry) => entry.manifest);
}
