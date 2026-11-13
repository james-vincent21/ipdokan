import "@/styles/globals.css";

export const metadata = {
  title: "IP DOKAN | Proxy & Server Solutions",
  description: "Explore proxy and server solutions with IP DOKAN.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="bn">
      <body>{children}</body>
    </html>
  );
}
