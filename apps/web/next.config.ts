import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@smart-grocery/shared"],
  // standalone is for the Docker image; Vercel uses its own output handling
  output: process.env.VERCEL ? undefined : "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "localhost", port: "9000" },
    ],
  },
};

export default nextConfig;
