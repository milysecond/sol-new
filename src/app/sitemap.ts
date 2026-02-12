import { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/token", "/nft", "/wallet", "/pay", "/dao"];
  return routes.map((route) => ({
    url: `https://sol.new${route}`,
    lastModified: new Date(),
    changeFrequency: "daily" as const,
    priority: route === "" ? 1 : 0.8,
  }));
}
