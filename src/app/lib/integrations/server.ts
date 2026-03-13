import {
  getAllIntegrations,
  getIntegration,
  getIntegrationImporter,
  registerIntegration,
} from "./registry";
import { obsidianManifest } from "./obsidian/manifest";
import { obsidianImporter } from "./obsidian/importer";

registerIntegration({
  manifest: obsidianManifest,
  importer: obsidianImporter,
});

export { getAllIntegrations, getIntegration, getIntegrationImporter };
