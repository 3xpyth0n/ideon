import type { Generated } from "kysely";

export interface apiKeysTable {
  id: Generated<string>;
  userId: string;
  name: string;
  keyHash: string;
  keyHint: string;
  lastUsedAt: number | null;
  createdAt: number;
}
