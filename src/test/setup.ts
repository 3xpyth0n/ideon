import { beforeAll } from "vitest";
import { runMigrations } from "../app/lib/migrations";

beforeAll(async () => {
  // Initialize and migrate
  await runMigrations();
});
