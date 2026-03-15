import type { Generated } from "kysely";

export interface userVercelTokensTable {
  id: Generated<string>;
  userId: string;
  accessToken: string;
  authMethod: "oauth" | "pat";
  teamId: string | null;
  createdAt: string;
  updatedAt: string;
}
