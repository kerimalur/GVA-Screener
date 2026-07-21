import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { isHiddenRoute } from "@/lib/nav/hidden";

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
  // "/" ist seit dem Modus-Umbau der Launcher und damit eine App-Seite —
  // vorher lag dort nur ein Redirect und die Route durfte öffentlich sein.
  const isPublic = pathname.startsWith("/login") || pathname.startsWith("/auth");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (user && pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // ── Ausgeblendete Bereiche ────────────────────────────────────────────────
  // Liste liegt in `lib/nav/hidden.ts` — dieselbe Quelle filtert die Tabs in
  // `components/layout/nav.ts`. Damit kann kein sichtbarer Tab auf eine Route
  // zeigen, die hier sofort wieder wegredirectet wird.
  if (user && isHiddenRoute(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
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
    url.pathname = "/";
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
