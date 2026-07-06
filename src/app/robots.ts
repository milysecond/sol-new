import { MetadataRoute } from "next";

// AI answer engines — explicitly allowed so sol.new can be cited in their results.
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

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Keep private/transient surfaces out of the index.
        disallow: ["/api/", "/admin", "/images/", "/metadata/"],
      },
      ...AI_CRAWLERS.map((ua) => ({ userAgent: ua, allow: "/" })),
    ],
    sitemap: "https://sol.new/sitemap.xml",
    host: "https://sol.new",
  };
}
