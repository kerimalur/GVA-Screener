import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import LandingPage from "./LandingPage";

export default async function RootPage() {
  // Eingeloggte User mit aktiver Subscription direkt ins Dashboard
  const supabase = await createAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("status")
      .eq("user_id", user.id)
      .maybeSingle();

    const isActive = sub?.status === "active" || sub?.status === "trialing";
    if (isActive) redirect("/dashboard");
  }

  return <LandingPage />;
}
