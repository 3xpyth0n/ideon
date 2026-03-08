import { registerIntegration, getAllIntegrations } from "./registry";
import { obsidianManifest } from "./obsidian/manifest";

registerIntegration(obsidianManifest);

export { getAllIntegrations };
export type { IntegrationManifest } from "./types";
