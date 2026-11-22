import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { CheckoutPage } from "@/components/sections/checkout-page";

export const metadata = { title: "Cart & checkout | IP DOKAN", description: "Choose product quantities and review your cart." };

export default function CheckoutRoute() {
  return <><SiteHeader /><CheckoutPage /><SiteFooter /></>;
}
