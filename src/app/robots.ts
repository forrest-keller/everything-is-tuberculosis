import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Party sessions are per-code, ephemeral game rooms, not content worth indexing.
      disallow: "/party/",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
