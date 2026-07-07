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

  // ── Subscription-Check ────────────────────────────────────────────────────
  // Eingeloggte User auf nicht-öffentlichen Routen: aktive Subscription prüfen.
  if (user && !isPublic) {
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("status, current_period_end")
      .eq("user_id", user.id)
      .maybeSingle();

    const now = new Date();
    const isActive =
      sub?.status === "active" ||
      sub?.status === "trialing" ||
      // kurze Kulanz bei fehlgeschlagener Zahlung: bis Period-End weiter zugänglich
      (sub?.status === "past_due" &&
        sub.current_period_end != null &&
        new Date(sub.current_period_end) > now);

    if (!isActive) {
      const url = request.nextUrl.clone();
      url.pathname = "/upgrade";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  return response;
}

export const config = {
  // /api/* ausgenommen: Cron/Backfill/Data-Routen schützen sich selbst
  // (CRON_SECRET) und müssen ohne Browser-Session erreichbar bleiben.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
