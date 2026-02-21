import { beforeAll } from "vitest";
import { runMigrations } from "@lib/migrations";

beforeAll(async () => {
  // Initialize and migrate
  await runMigrations();
});
