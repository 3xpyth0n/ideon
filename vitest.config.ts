import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    setupFiles: ["src/test/setup.ts"],
    env: {
      SQLITE_PATH: ":memory:",
      NODE_ENV: "development",
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
