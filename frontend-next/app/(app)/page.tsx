import { redirect } from "next/navigation";

// Dashboard wurde nach /dashboard verschoben.
// Diese Datei leitet nur weiter, damit alte Links nicht brechen.
export default function OldRootPage() {
  redirect("/dashboard");
}
