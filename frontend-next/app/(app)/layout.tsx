import ModeChrome from "@/components/layout/ModeChrome";
import Prefetcher from "@/components/layout/Prefetcher";

// Shell für alle eingeloggten Seiten; /login und /auth/* bleiben ohne Chrome.
// Seit dem Modus-Umbau ohne Sidebar: die volle Breite gehört dem Inhalt.
export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen flex-col">
      <Prefetcher />
      <ModeChrome />
      <main className="flex-1 p-6 overflow-x-hidden">{children}</main>
    </div>
  );
}
