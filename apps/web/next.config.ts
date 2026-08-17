import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@ai-ramp/game-wordle"],
  // Allow teammates on the same LAN to reach the dev server by the host's IP
  // (e.g. http://192.168.1.42:3000) without the cross-origin dev warning.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local"],
};

export default nextConfig;
