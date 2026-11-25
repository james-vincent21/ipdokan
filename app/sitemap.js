import { SITE_URL } from "@/lib/site";

// sitemap.xml: the public pages search engines should list.
export default function sitemap() {
  const now = new Date();
  return [
    { url: SITE_URL, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/catalog`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/proxies`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
  ];
}
