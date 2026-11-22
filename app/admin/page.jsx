import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { AdminDashboard } from "@/components/sections/admin-dashboard";

export const metadata = { title: "Admin | IP DOKAN", description: "Manage products, users, and orders." };

export default function AdminPage() {
  return <><SiteHeader /><AdminDashboard /><SiteFooter /></>;
}
