import { Generated } from "kysely";

export interface userGitTokensTable {
  id: Generated<string>;
  userId: string;
  provider: string;
  host: string;
  token: string;
  enabled: number;
  createdAt: string;
  updatedAt: string;
}
