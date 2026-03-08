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
    | "productivity";
  enabled: boolean;
  nameKey: string;
  descriptionKey: string;
}

export interface IntegrationCapabilities {
  import?: boolean;
  export?: boolean;
  webhooks?: boolean;
  oauth?: boolean;
  realtime?: boolean;
}
