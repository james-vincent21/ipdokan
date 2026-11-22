import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { CheckoutPage } from "@/components/sections/checkout-page";

export const metadata = { title: "Product details | IP DOKAN", description: "Review product plans, details, and availability." };

export default function ProductDetailsPage() {
  return <><SiteHeader /><CheckoutPage /><SiteFooter /></>;
}
