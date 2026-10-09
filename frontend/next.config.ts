import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@travel/shared"],
  agentRules: false,
};

export default nextConfig;
