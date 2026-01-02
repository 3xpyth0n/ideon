import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["cjs"],
  target: "node20",
  outDir: "dist",
  clean: true,
  skipNodeModulesBundle: true,
  sourcemap: true,
  shims: true, // Inject shims for __dirname, __filename, etc.
});
