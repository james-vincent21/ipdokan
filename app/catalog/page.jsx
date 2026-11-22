import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { ProductCatalogPage } from "@/components/sections/product-catalog-page";

export const metadata = {
  title: "Catalog | IP DOKAN",
  description: "Browse proxy and VPN products from IP DOKAN.",
};

export default function CatalogPage() {
  return <><SiteHeader /><ProductCatalogPage /><SiteFooter /></>;
}
