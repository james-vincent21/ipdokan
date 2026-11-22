import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { BetterAuthSignIn } from "@/components/sections/better-auth-sign-in";

export const metadata = { title: "Sign in | IP DOKAN" };

export default function SignInPage() {
  return <><SiteHeader /><BetterAuthSignIn /><SiteFooter /></>;
}
