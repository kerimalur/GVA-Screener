import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Auth-Guard: alles außer /login und /auth/* erfordert eine Google-Session.
// Refresht nebenbei die Supabase-Session-Cookies (Pattern aus Supabase-SSR-Doku).
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Kein Code zwischen createServerClient und getUser — sonst Session-Bugs.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic =
    pathname === "/" ||                   // Landing Page
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/upgrade") ||
    pathname.startsWith("/agb") ||
    pathname.startsWith("/datenschutz") ||
    pathname.startsWith("/impressum");
  // Hinweis: /api/* ist laut matcher bereits ausgenommen (inkl. /api/stripe/webhook)

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (user && pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // ── Admin-Only-Routen ────────────────────────────────────────────────────
  // /admin/* nur für User-IDs in ADMIN_USER_IDS (kommagetrennt).
  if (user && pathname.startsWith("/admin")) {
    const adminIds = (process.env.ADMIN_USER_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!adminIds.includes(user.id)) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  // ── Subscription-Check ────────────────────────────────────────────────────
  // Eingeloggte User auf nicht-öffentlichen Routen: aktive Subscription prüfen.
  // Admin-User überspringen — kein Stripe-Abo nötig.
  const adminIdsForSub = (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const isAdminUser = user ? adminIdsForSub.includes(user.id) : false;

  if (user && !isPublic && !isAdminUser) {
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("status, cu