import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["dev.sol.new", "192.168.1.105"],
  // Keep fat browser/WASM stacks out of the Cloudflare Worker bundle
  serverExternalPackages: [
    "privacycash",
    "@lightprotocol/hasher.rs",
    "three",
    "gsap",
    "canvas-confetti",
  ],
  async redirects() {
    return [
      {
        source: "/launch/:mint",
        destination: "/token/:mint",
        permanent: true,
      },
      {
        source: "/dev",
        destination: "https://dev.sol.new",
        permanent: false,
      },
      {
        source: "/learn",
        destination: "https://learn.sol.new",
        permanent: false,
      },
      {
        source: "/playbook",
        destination: "https://starter.sol.new",
        permanent: false,
      },
      // /memes is now a first-party page using memes.sol.new API
      {
        source: "/frame",
        destination: "/home",
        permanent: true,
      },
      {
        source: "/frame/:path*",
        destination: "/home",
        permanent: true,
      },
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
