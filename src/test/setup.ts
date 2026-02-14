import { beforeAll, afterAll } from "vitest";
import { runMigrations } from "../app/lib/migrations";

beforeAll(async () => {
  // Use in-memory SQLite for tests
  process.env.SQLITE_PATH = ":memory:";
  Object.assign(process.env, { NODE_ENV: "development" });

  // Initialize and migrate
  await runMigrations();
});

afterAll(async () => {
  // Cleanup if needed
});
