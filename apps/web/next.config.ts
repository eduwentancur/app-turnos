import type { NextConfig } from "next";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // El navegador habla siempre con el mismo origen (/api/*) y Next lo reenvía a la API:
  // sin CORS y con la cookie de sesión en el mismo dominio.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
