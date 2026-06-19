import { defineConfig } from "vitest/config";

export default defineConfig({
  css: { postcss: { plugins: [] } },
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    setupFiles: ["src/test/setup.ts"],
    env: {
      SQLITE_PATH: ":memory:",
      NODE_ENV: "test",
      LOG_LEVEL: "warn",
    },
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["**/.next/**", "**/node_modules/**", "**/dist/**"],
    css: false,
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
  },
});
