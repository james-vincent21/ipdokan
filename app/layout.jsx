import "@/styles/globals.css";
import { SiteFooter } from "@/components/layout/site-footer";
import { ServicesOverview } from "@/components/sections/services-overview";
import { StrategicPartners } from "@/components/sections/strategic-partners";

export const metadata = {
  title: "IP DOKAN | Proxy & Server Solutions",
  description: "Explore proxy and server solutions with IP DOKAN.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="bn">
      <body>{children}<StrategicPartners /><ServicesOverview /><SiteFooter /></body>
    </html>
  );
}
