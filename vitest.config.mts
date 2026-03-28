import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    setupFiles: ["src/test/setup.ts"],
    env: {
      SQLITE_PATH: ":memory:",
      NODE_ENV: "test",
    },
    include: ["src/**/*.test.ts"],
    exclude: ["**/.next/**", "**/node_modules/**", "**/dist/**"],
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
  },
});
