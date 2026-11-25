import "@/styles/globals.css";
import "@/styles/theme-light.css";
import "@/styles/theme-dark.css";
import { DEFAULT_THEME, THEME_SCRIPT } from "@/components/layout/theme-toggle";
import { CardTilt } from "@/components/ui/card-tilt";
import { DevModeBanner } from "@/components/layout/dev-mode-banner";
import { Toaster } from "@/components/layout/toaster";
import { PRELOADER_HEAD_SCRIPT, SitePreloader } from "@/components/layout/site-preloader";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

// The tab icon, Apple home-screen icon and /favicon.ico come from app/icon.png, app/apple-icon.png
// and app/favicon.ico (Next.js adds their <link> tags).
export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "IP DOKAN | Proxy & Server Solutions", template: "%s | IP DOKAN" },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: { type: "website", siteName: SITE_NAME, title: "IP DOKAN | Proxy & Server Solutions", description: SITE_DESCRIPTION, images: [{ url: "/icon.png", width: 512, height: 512, alt: SITE_NAME }] },
  twitter: { card: "summary", title: "IP DOKAN | Proxy & Server Solutions", description: SITE_DESCRIPTION, images: ["/icon.png"] },
};

// Tells Google the site's name and logo (shown next to the site in search results).
const STRUCTURED_DATA = [
  { "@context": "https://schema.org", "@type": "WebSite", name: SITE_NAME, alternateName: ["IPDokan", "IP Dokan"], url: `${SITE_URL}/` },
  { "@context": "https://schema.org", "@type": "Organization", name: SITE_NAME, url: `${SITE_URL}/`, logo: `${SITE_URL}/icon.png`, sameAs: ["https://t.me/IpDokan"] },
];

export default function RootLayout({ children }) {
  return (
    <html lang="bn" data-theme={DEFAULT_THEME} suppressHydrationWarning>
      <head>
        {/* Applies the visitor's saved theme before the first paint, so the page never flashes the wrong theme. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/* The logo is the first thing on the loading screen and in the header: fetch it first. */}
        <link rel="preload" as="image" href="/ip-dokan-logo.svg" fetchPriority="high" />
        {/* Skips the loading screen when it was already shown in this browser session. */}
        <script dangerouslySetInnerHTML={{ __html: PRELOADER_HEAD_SCRIPT }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA).replace(/</g, "\\u003c") }} />
      </head>
      <body><SitePreloader /><DevModeBanner />{children}<CardTilt /><Toaster /></body>
    </html>
  );
}
