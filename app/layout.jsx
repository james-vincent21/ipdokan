import "@/styles/globals.css";
import "@/styles/theme-light.css";
import "@/styles/theme-dark.css";
import { DEFAULT_THEME, THEME_SCRIPT } from "@/components/layout/theme-toggle";
import { CardTilt } from "@/components/ui/card-tilt";

export const metadata = {
  title: "IP DOKAN | Proxy & Server Solutions",
  description: "Explore proxy and server solutions with IP DOKAN.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="bn" data-theme={DEFAULT_THEME} suppressHydrationWarning>
      <head>
        {/* Applies the visitor's saved theme before the first paint, so the page never flashes the wrong theme. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}<CardTilt /></body>
    </html>
  );
}
