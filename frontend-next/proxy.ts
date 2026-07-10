import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";

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

  // ── Auth: getUser mit Fehlerbehandlung ────────────────────────────────────
  // Bei abgelaufenen / ungültigen Refresh-Tokens sauber zu /login redirecten
  // statt mit einem 500-Fehler zu crashen.
  let user: User | null = null;

  try {
    const { data, error } = await supabase.auth.getUser();

    if (error) {
      const isAuthError =
        error.message?.includes("refresh_token_not_found") ||
        error.message?.includes("invalid_grant") ||
        error.message?.includes("Invalid Refresh Token") ||
        (error as { code?: string }).code === "refresh_token_not_found";

      if (isAuthError) {
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        url.search = "";
        const redirect = NextResponse.redirect(url);
        // Auth-Cookies löschen damit der User sauber neu einloggen kann
        request.cookies.getAll().forEach((cookie) => {
          if (cookie.name.startsWith("sb-") || cookie.name.includes("supabase")) {
            redirect.cookies.delete(cookie.name);
          }
        });
        return redirect;
      }
    }

    user = data.user;
  } catch {
    // Unerwarteter Fehler → sauber zu Login
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const { pathname } = request.nextUrl;
  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/upgrade") ||
    pathname.startsWith("/agb") ||
    pathname.startsWith("/datenschutz") ||
    pathname.startsWith("/impressum");

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

  // ── Admin-Check: ADMIN_USER_IDS Env-Var ODER app_metadata.role = "admin" ─
  // Beide Systeme werden akzeptiert — wer in Supabase als Admin markiert ist
  // oder in der Env-Var steht, erhält vollen Zugriff ohne Abo-Prüfung.
  const adminIds = (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const isAdminUser = user
    ? adminIds.includes(user.id) || user.app_metadata?.role === "admin"
    : false;

  // Scanner-Bereich: nur für Admins
  const isAdminRoute =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/scanner");

  if (user && isAdminRoute && !isAdminUser) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // ── Abo-Check für normale User ────────────────────────────────────────────
  if (user && !isPublic && !isAdminUser) {
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("status, current_period_end, tier")
      .eq("user_id", user.id)
      .maybeSingle();

    const now = new Date();
    const periodValid =
      sub?.current_period_end != null
        ? new Date(sub.current_period_end) > now
        : true; // Kein Datum → Webhook noch nicht geschrieben, Benefit of Doubt

    const isActive =
      (sub?.status === "active" && periodValid) ||
      (sub?.status === "trialing" && periodValid) ||
      (sub?.status === "past_due" &&
        sub.current_period_end != null &&
        new Date(sub.current_period_end) > now);

    if (!isActive) {
      const url = request.nextUrl.clone();
      url.pathname = "/upgrade";
      url.search = "";
      return NextResponse.redirect(url);
    }

    // Journal-Bereich ist Pro-exklusiv
    if (pathname.startsWith("/journal") && sub?.tier !== "pro") {
      const url = request.nextUrl.clone();
      url.pathname = "/upgrade";
      url.search = "?tier=pro";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon\.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
