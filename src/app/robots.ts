import { MetadataRoute } from "next";

// AI answer engines — allowed on public product pages (disallow list still applies).
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
];

/**
 * Keep crawl budget on real product pages.
 * - `/link/<code>` and `/l/<code>` always bounce → GSC "Page with redirect"
 * - Bare `/link` (create UI) stays allowed (Disallow `/link/` does not match `/link`)
 */
export default function robots(): MetadataRoute.Robots {
  const disallow = [
    "/api/",
    "/admin",
    "/admin/",
    "/images/",
    "/metadata/",
    "/l/",
    "/link/",
    "/u/",
  ];

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow,
      },
      ...AI_CRAWLERS.map((ua) => ({
        userAgent: ua,
        allow: "/",
        disallow,
      })),
    ],
    sitemap: "https://sol.new/sitemap.xml",
    host: "https://sol.new",
  };
}
