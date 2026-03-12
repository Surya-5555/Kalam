import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      canvas: { browser: "./empty-module.js" },
    },
  },
  webpack: (config) => {
    // pdfjs-dist optionally imports `canvas` for server-side rendering.
    // In the browser we don't need it — replace with an empty module so
    // webpack doesn't warn / fail the build.
    config.resolve.alias = {
      ...(config.resolve.alias as Record<string, string>),
      canvas: false,
    };
    return config;
  },
};

export default nextConfig;
