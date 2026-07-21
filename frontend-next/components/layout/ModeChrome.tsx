"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import {
  activeTabHref,
  modeForPath,
  LAUNCHER_HREF,
  LAUNCHER_LABEL,
  PAGE_TITLES,
} from "./nav";
import SignalsBadge from "./SignalsBadge";
import PairSearchBar from "./PairSearchBar";
import { createBrowserSupabase } from "@/lib/supabase/client";

/**
 * Kopfzeile + Tab-Leiste eines Modus. Ersetzt Sidebar und TopBar.
 *
 * Die Sidebar zeigte alle ~20 Einträge gleichzeitig und kostete auf jeder
 * Seite 248px Breite. Hier steht nur noch, was zum aktiven Modus gehört; der
 * Weg zurück zum Launcher ist Logo und „Übersicht" gleichzeitig.
 */
export default function ModeChrome() {
  const pathname = usePathname();
  const router = useRouter();
  const mode = modeForPath(pathname);
  const activeHref = activeTabHref(pathname);

  const [userName, setUserName] = useState("");
  const [userAvatar, setUserAvatar] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    const uebernehmen = (user: User | null) => {
      if (!user) {
        setUserName("");
        setUserAvatar("");
        setIsAdmin(false);
        return;
      }
      setUserName(
        user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split("@")[0] ||
          "Trader",
      );
      setUserAvatar(user.user_metadata?.avatar_url || "");
      setIsAdmin(user.app_metadata?.role === "admin");
    };

    supabase.auth.getUser().then(({ data: { user } }) => uebernehmen(user));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => uebernehmen(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const amLauncher = pathname === LAUNCHER_HREF;
  // Titel: der Modus benennt den Kontext, der Tab die Seite. Auf Seiten ohne
  // eigenen Tab (z.B. /journal/einstellungen) bleibt der Modus-Name stehen.
  const seitentitel = PAGE_TITLES[pathname] ?? mode?.label ?? LAUNCHER_LABEL;

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur-[10px]">
      <div className="flex items-center justify-between gap-4 px-6 py-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Logo = Weg zurück zur Übersicht. Auf dem Launcher selbst ist es
              kein Link, sondern nur die Marke. */}
          <Link
            href={LAUNCHER_HREF}
            title="Zurück zur Übersicht"
            className="flex items-center gap-2.5 shrink-0 rounded-lg px-1 py-1 -mx-1 hover:bg-active/50 transition-colors"
          >
            <div className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center bg-linear-135 from-accent to-accent/60">
              <div className="w-2.5 h-2.5 rounded-[3px] rotate-45 bg-bg" />
            </div>
            <span className="text-[14.5px] font-extrabold tracking-tight">FX Terminal</span>
          </Link>

          {!amLauncher && (
            <>
              <span className="text-faint text-[13px]">/</span>
              <div className="flex items-center gap-1.5 min-w-0">
                {mode && <i className={`ph-bold ${mode.icon} text-[14px] text-accent`} />}
                <span className="text-[13.5px] font-bold truncate">
                  {mode?.label ?? seitentitel}
                </span>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Suspense fallback={null}>
            <PairSearchBar />
          </Suspense>
          <div suppressHydrationWarning className="hidden md:block font-mono text-[12px] text-faint">
            {new Date().toLocaleDateString("de-DE", {
              weekday: "short",
              day: "2-digit",
              month: "2-digit",
            })}
          </div>
          {userAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={userAvatar} alt={userName} className="w-7 h-7 rounded-full shrink-0" />
          ) : (
            <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[11.5px] font-bold border border-border2 bg-surface2">
              {userName.charAt(0).toUpperCase()}
            </div>
          )}
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            title="Abmelden"
            className="p-1.5 rounded-lg text-muted hover:bg-down-dim hover:text-down transition-colors disabled:cursor-not-allowed"
          >
            <i className="ph-bold ph-sign-out text-[14px]" />
          </button>
        </div>
      </div>

      {/* Tab-Leiste: ausschliesslich die Seiten des aktiven Modus. */}
      {mode && (
        <nav className="flex items-center gap-1 px-6 overflow-x-auto">
          {mode.tabs.map((tab) => {
            const active = tab.href === activeHref;
            const locked = tab.requiresAdmin && !isAdmin;

            if (locked) {
              return (
                <span
                  key={tab.href}
                  title="Nur für Admins verfügbar"
                  className="flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-[12.5px] font-medium text-faint opacity-50 cursor-not-allowed border-b-2 border-transparent"
                >
                  {tab.label}
                  <i className="ph-bold ph-lock-simple text-[10px]" />
                </span>
              );
            }

            return (
              <Link
                key={tab.href}
                href={tab.href}
                data-tour={tab.href}
                className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-[12.5px] border-b-2 transition-colors ${
                  active
                    ? "font-semibold text-text border-accent"
                    : "font-medium text-text/70 border-transparent hover:text-text"
                }`}
              >
                {tab.label}
                {/* Unentschiedene GVA-Hits hängen am Cockpit. */}
                {tab.href === "/cockpit" && <SignalsBadge />}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
