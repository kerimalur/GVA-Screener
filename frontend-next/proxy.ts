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
    pathname.startsWith("/auth");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (user && pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/cockpit";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // ── Ausgeblendete Bereiche ────────────────────────────────────────────────
  // Code + Seiten bleiben im Projekt, sind aber bewusst NICHT erreichbar —
  // Fokus liegt auf Cockpit + GVA. Reaktivieren: Pfad hier rausnehmen und den
  // Nav-Eintrag in components/layout/nav.ts wieder ergänzen.
  const HIDDEN_PREFIXES = [
    "/weekly",
    "/cot",
    "/ml/season",
    "/ml/fundamental-track",
    "/ml/setup-finder",
    "/ml/modell",
    "/ml/training",
    "/ml/labor",
  ];
  // Exakt "/ml" = Daten-Check. Unterseiten (/ml/ranking, /ml/factor-lab,
  // /ml/engine-log, /ml/replay) bleiben erreichbar — daher kein Prefix-Match.
  const isHidden =
    pathname === "/ml" ||
    HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (user && isHidden) {
    const url = request.nextUrl.clone();
    url.pathname = "/cockpit";
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
    url.pathname = "/cockpit";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon\.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
