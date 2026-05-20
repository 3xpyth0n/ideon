import { beforeAll } from "vitest";
import { runMigrations } from "@lib/migrations";

// lib0 (yjs dep) probes localStorage at init; Node.js v26 emits ExperimentalWarning on that access — replace the accessor first.
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    length: 0,
    key: () => null,
  },
  writable: true,
  configurable: true,
});

beforeAll(async () => {
  // Initialize and migrate
  await runMigrations();
});
