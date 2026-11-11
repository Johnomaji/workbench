import type { MetadataRoute } from "next";
import { appUrl } from "@/server/env";

export default function robots(): MetadataRoute.Robots {
  // Signed-in pages send crawlers to sign in, and every app page is marked noindex.
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
