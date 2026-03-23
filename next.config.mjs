import path from "path";

const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  turbopack: {},
  serverExternalPackages: [
    "@boxyhq/saml-jackson",
    "typeorm",
    "kysely",
    "pg",
    "better-sqlite3",
    "nanoid",
    "uuid",
  ],
  outputFileTracingIncludes: {
    "**": ["./src/app/db/migrations/**/*", "./src/app/i18n/**/*"],
  },
  experimental: {
    proxyClientMaxBodySize: "200mb",
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  allowedDevOrigins: [process.env.ALLOWED_DEV_ORIGIN].filter(Boolean),
  // this resolves the issue of yjs being imported twice
  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      yjs: path.resolve(import.meta.dirname, "node_modules/yjs/dist/yjs.cjs"),
    };

    if (isServer) {
      config.ignoreWarnings = [
        { module: /node_modules\/typeorm/ },
        { module: /node_modules\/@boxyhq\/saml-jackson/ },
      ];
    }

    return config;
  },
};

export default nextConfig;
