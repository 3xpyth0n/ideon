import {
  getAllIntegrations,
  getIntegration,
  getIntegrationImporter,
  registerIntegration,
} from "./registry";
import { obsidianManifest } from "./obsidian/manifest";
import { obsidianImporter } from "./obsidian/importer";
import { vercelManifest } from "./vercel/manifest";

registerIntegration({
  manifest: obsidianManifest,
  importer: obsidianImporter,
});

registerIntegration(vercelManifest);

export { getAllIntegrations, getIntegration, getIntegrationImporter };
