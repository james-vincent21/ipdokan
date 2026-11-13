import { SiteHeader } from "@/components/layout/site-header";
import { HeroSection } from "@/components/sections/hero-section";
import { ServiceCatalog } from "@/components/sections/service-catalog";
import { TrustAbout } from "@/components/sections/trust-about";
import { SupportChat } from "@/components/ui/support-chat";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="main-container">
        <HeroSection />
        <ServiceCatalog />
        <TrustAbout />
      </main>
      <SupportChat />
    </>
  );
}
