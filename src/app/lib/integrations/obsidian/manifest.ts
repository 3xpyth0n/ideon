import { IntegrationManifest } from "../types";

export const obsidianManifest: IntegrationManifest = {
  id: "obsidian",
  name: "Obsidian",
  description: "Import your Obsidian vault into Ideon projects",
  iconUrl:
    "https://gdm-catalog-fmapi-prod.imgix.net/ProductLogo/53c7cb96-7407-4a94-8219-60f6f5543fe3.png",
  category: "notes",
  releaseStatus: "released",
  capabilities: {
    import: {
      enabled: true,
      sources: ["zip"],
      acceptsProjectName: true,
    },
  },
  nameKey: "importFromObsidian",
  descriptionKey: "importFromObsidianDesc",
};
