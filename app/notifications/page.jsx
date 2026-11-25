import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { NotificationsPage } from "@/components/sections/notifications-page";

export const metadata = {
  title: "Notifications | IP DOKAN",
  description: "Your order and wallet notifications.",
  robots: { index: false },
};

export default function Notifications() {
  return <><SiteHeader /><NotificationsPage /><SiteFooter /></>;
}
