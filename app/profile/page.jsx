import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { UserProfile } from "@/components/sections/user-profile";

export const metadata = {
  title: "Your profile | IP DOKAN",
  description: "View and update your IP DOKAN account profile.",
};

export default function ProfilePage() {
  return <><SiteHeader /><UserProfile /><SiteFooter /></>;
}
