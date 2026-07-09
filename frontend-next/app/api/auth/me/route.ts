import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/me
 * Gibt {id, email, isAdmin} zurück.
 * isAdmin = User-ID in der ADMIN_USER_IDS-Umgebungsvariable (kommagetrennt).
 */
export async function GET() {
  const supabase = await createAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminIds = (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const isAdmin = adminIds.includes(user.id);

  return NextResponse.json({ id: user.id, email: user.email, isAdmin });
}
