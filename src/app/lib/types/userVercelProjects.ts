import type { Generated } from "kysely";

export interface userVercelProjectsTable {
  id: Generated<string>;
  userId: string;
  vercelProjectId: string;
  vercelProjectName: string;
  enabled: number;
  createdAt: string;
}
