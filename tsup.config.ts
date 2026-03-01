import { defineConfig } from "tsup";

const externalPackages = [
  "next",
  "better-sqlite3",
  "argon2",
  "pg-native",
  "classic-level",
];

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["cjs"],
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  shims: true,
  external: externalPackages,
  noExternal: [new RegExp(`^(?!(${externalPackages.join("|")})($|/))`)],
});
