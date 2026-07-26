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
      // /dev aliases the staging Pages deployment.
      {
        source: "/dev",
        destination: "https://dev.sol.new",
        permanent: false,
      },
      // /learn aliases the learn subdomain.
      {
        source: "/learn",
        destination: "https://learn.sol.new",
        permanent: false,
      },
      // /playbook aliases the playbook subdomain.
      {
        source: "/playbook",
        destination: "https://playbook.sol.new",
        permanent: false,
      },
      // /memes → meme generator app
      {
        source: "/memes",
        destination: "https://memes.metasal.xyz",
        permanent: false,
      },

      // --- GSC indexing cleanup: dead / legacy paths that were returning 404 ---
      { source: "/copyright", destination: "/privacy", permanent: true },
      { source: "/about", destination: "/", permanent: true },
      { source: "/blog", destination: "/whats-new", permanent: true },
      { source: "/blog/:path*", destination: "/whats-new", permanent: true },
      { source: "/contact", destination: "/", permanent: true },
      { source: "/faq", destination: "/docs", permanent: true },
      { source: "/pricing", destination: "/docs", permanent: true },
      { source: "/login", destination: "/wallet", permanent: true },
      { source: "/signup", destination: "/wallet", permanent: true },
      { source: "/app", destination: "/", permanent: true },
      { source: "/apps", destination: "/", permanent: true },
      { source: "/create", destination: "/token", permanent: true },
      { source: "/create-token", destination: "/token", permanent: true },
      { source: "/mint", destination: "/token", permanent: true },
      { source: "/airdrop", destination: "/get", permanent: true },
      { source: "/faucet", destination: "/get", permanent: true },
      { source: "/dao", destination: "/multisig", permanent: true },
      { source: "/nft/create", destination: "/nft", permanent: true },
      { source: "/wallet/create", destination: "/wallet", permanent: true },
      { source: "/wallet/new", destination: "/wallet", permanent: true },
      { source: "/get/wallet", destination: "/wallet/get", permanent: true },
      { source: "/sitemap", destination: "/sitemap.xml", permanent: true },
      { source: "/docs/intro", destination: "/docs", permanent: true },
      { source: "/docs/getting-started", destination: "/docs", permanent: true },
      { source: "/en", destination: "/", permanent: true },
      { source: "/en/:path*", destination: "/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
