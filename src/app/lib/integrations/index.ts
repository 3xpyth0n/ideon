import { registerIntegration, getAllIntegrations } from "./registry";
import { obsidianManifest } from "./obsidian/manifest";
import { vercelManifest } from "./vercel/manifest";
import { getImportCapability, getIntegrationReleaseStatus } from "./types";

registerIntegration(obsidianManifest);
registerIntegration(vercelManifest);

export { getAllIntegrations };
export { getImportCapability, getIntegrationReleaseStatus };
export type {
  IntegrationManifest,
  IntegrationImportCapability,
  IntegrationReleaseStatus,
} from "./types";
