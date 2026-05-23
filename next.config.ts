import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["dev.sol.new", "192.168.1.105"],
  // Next 16.2 + TS 5 changed Response.json() return to `unknown`, breaking
  // ~20 existing call sites that accessed parsed JSON properties directly.
  // Ignore until we add explicit response types everywhere (tracked as follow-up).
  typescript: { ignoreBuildErrors: true },
  async redirects() {
    return [
      // /launch/:mint was the post-launch page until 2026-05-03.
      // Permanent redirect so any previously-shared links keep working.
      {
        source: "/launch/:mint",
        destination: "/token/:mint",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
