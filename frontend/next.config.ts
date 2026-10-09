import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@travel/shared"],
  agentRules: false,
  // Самодостаточная сборка для Docker; корень трассировки — монорепозиторий, чтобы попали hoisted-зависимости
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, ".."),
};

export default nextConfig;
