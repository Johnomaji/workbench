import type { MetadataRoute } from "next";
import { MARKETING_PATHS } from "@/lib/site";
import { appUrl } from "@/server/env";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = appUrl();
  return MARKETING_PATHS.map((path) => ({
    url: path === "/" ? base : `${base}${path}`,
    changeFrequency: "monthly",
    priority: path === "/" ? 1 : path === "/pricing" ? 0.8 : 0.3,
  }));
}
