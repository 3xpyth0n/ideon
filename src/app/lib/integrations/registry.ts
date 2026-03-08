import { IntegrationManifest } from "./types";

export const integrationRegistry: Map<string, IntegrationManifest> = new Map();

export function registerIntegration(manifest: IntegrationManifest): void {
  integrationRegistry.set(manifest.id, manifest);
}

export function getIntegration(id: string): IntegrationManifest | undefined {
  return integrationRegistry.get(id);
}

export function getAllIntegrations(): IntegrationManifest[] {
  return Array.from(integrationRegistry.values());
}
