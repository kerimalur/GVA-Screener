import { NextResponse, type NextRequest } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/scanner-unlock
 * Prueft den Scanner-Zugangscode und setzt ein Session-Cookie.
 */
export async function POST(request: NextRequest) {
  const supabase = await createAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht eingeloggt" }, { status: 401 });

  // Nur Admins koennen den Scanner entsperren
  const adminIds = (process.env.ADMIN_USER_IDS ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  if (!adminIds.includes(user.id)) {
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  }

  const { code } = await request.json() as { code?: string };
  const expected = process.env.SCANNER_ACCESS_CODE;

  if (!expected || code !== expected) {
    return NextResponse.json({ error: "Falscher Code" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("scanner_unlocked", "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 8, // 8 Stunden
    path: "/",
  });
  return res;
}
