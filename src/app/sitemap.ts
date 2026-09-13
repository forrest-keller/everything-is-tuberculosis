import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/solo`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/daily`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/party`, changeFrequency: "monthly", priority: 0.5 },
  ];
}
