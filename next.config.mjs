import path from "path";

const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  turbopack: {},
  experimental: {
    proxyClientMaxBodySize: "200mb",
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  allowedDevOrigins: [process.env.ALLOWED_DEV_ORIGIN].filter(Boolean),
  // this resolves the issue of yjs being imported twice
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      yjs: path.resolve(import.meta.dirname, "node_modules/yjs/dist/yjs.cjs"),
    };
    return config;
  },
};

export default nextConfig;
