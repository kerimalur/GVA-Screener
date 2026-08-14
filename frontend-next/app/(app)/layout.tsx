import Chrome from "@/components/layout/Chrome";
import Prefetcher from "@/components/layout/Prefetcher";

/**
 * Rahmen für alle angemeldeten Seiten; /login und /auth/* laufen ohne.
 *
 * Der Inhalt bekommt die volle Breite und begrenzt sich selbst — eine
 * Matrix mit 28 Zeilen braucht mehr Platz als ein Erklärtext, und eine
 * feste Klammer hier würde beide gleich behandeln.
 */
export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col">
      <Prefetcher />
      <Chrome />
      <main className="flex-1 overflow-x-hidden px-4 pb-16 pt-4">{children}</main>
    </div>
  );
}
