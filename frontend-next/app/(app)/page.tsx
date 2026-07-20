import { redirect } from "next/navigation";

// Startseite = Cockpit (Trades der Woche). News-Dashboard liegt unter /dashboard.
export default function OldRootPage() {
  redirect("/cockpit");
}
