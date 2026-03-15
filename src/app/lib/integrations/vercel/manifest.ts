import { IntegrationManifest } from "../types";

export const vercelManifest: IntegrationManifest = {
  id: "vercel",
  name: "Vercel",
  description: "Deploy and monitor Vercel projects from Ideon",
  iconUrl:
    "https://assets.vercel.com/image/upload/front/favicon/vercel/180x180.png",
  category: "automation",
  releaseStatus: "beta",
  capabilities: { oauth: true },
  nameKey: "vercelIntegration",
  descriptionKey: "vercelIntegrationDesc",
};
