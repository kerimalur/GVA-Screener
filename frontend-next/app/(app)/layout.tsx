import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import Prefetcher from "@/components/layout/Prefetcher";

// Shell für alle eingeloggten Seiten; /login und /auth/* bleiben ohne Chrome.
export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen">
      <Prefetcher />
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 p-6 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
