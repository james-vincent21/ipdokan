import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { BetterAuthConsent } from "@/components/sections/better-auth-consent";

export const metadata = { title: "Authorize access | IP DOKAN" };
export const dynamic = "force-dynamic";

export default function ConsentPage() {
  return <><SiteHeader /><BetterAuthConsent /><SiteFooter /></>;
}
