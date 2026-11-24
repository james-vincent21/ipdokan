import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { ProxyStore } from "@/components/sections/proxy-store";

export const metadata = {
  title: "Proxies | IP DOKAN",
  description: "Choose a proxy type, plan, location and provider. Proxies are set up automatically after payment and arrive within 3–5 minutes.",
};

export default function ProxiesPage() {
  return <><SiteHeader /><ProxyStore /><SiteFooter /></>;
}
