import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { WalletPage } from "@/components/sections/wallet-page";

export const metadata = {
  title: "Your wallet | IP DOKAN",
  description: "Recharge your IP DOKAN wallet in USD or BDT and pay for orders from your balance.",
};

export default function Wallet() {
  return <><SiteHeader /><WalletPage /><SiteFooter /></>;
}
