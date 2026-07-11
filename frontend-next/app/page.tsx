import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export default async function RootPage() {
  const supabase = await createAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? "/dashboard" : "/login");
}
