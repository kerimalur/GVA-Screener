import { NextResponse, type NextRequest } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic = "force-dynamic";

/** GET /api/auth/scanner-status — prueft ob scanner_unlocked Cookie gesetzt ist. */
export async function GET(request: NextRequest) {
  const supabase = await createAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ unlocked: false });

  const cookie = request.cookies.get("scanner_unlocked");
  const unlocked = cookie?.value === "1";
  return NextResponse.json({ unlocked });
}
