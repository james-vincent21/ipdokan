import { SITE_URL } from "@/lib/site";

// robots.txt: search engines may crawl the shop, not the private pages.
export default function robots() {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/checkout", "/profile", "/wallet", "/sign-in", "/consent", "/api/"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
