import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["dev.sol.new", "192.168.1.105"],
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
