import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@smart-grocery/shared"],
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "localhost", port: "9000" },
    ],
  },
};

export default nextConfig;
