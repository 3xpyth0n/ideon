import { defineConfig } from "tsup";

const externalPackages = [
  "next",
  "better-sqlite3",
  "argon2",
  "pg-native",
  "classic-level",
  "node-pty",
];

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["cjs"],
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  shims: true,
  outExtension({ format }) {
    return {
      js: format === "cjs" ? ".cjs" : ".js",
    };
  },
  external: externalPackages,
  noExternal: [new RegExp(`^(?!(${externalPackages.join("|")})($|/))`)],
});
