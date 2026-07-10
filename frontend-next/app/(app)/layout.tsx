import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import OnboardingTour from "@/components/onboarding/OnboardingTour";

// Shell für alle eingeloggten Seiten; /login und /auth/* bleiben ohne Chrome.
// OnboardingTour: interaktive Ersteinrichtungs-Tour, zeigt sich nur bei neuen Accounts.
export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 p-6 overflow-x-hidden">{children}</main>
      </div>
      <OnboardingTour />
    </div>
  );
}
