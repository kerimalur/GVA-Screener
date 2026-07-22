"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { MODES, activeTabHref, modeForPath, LAUNCHER_HREF } from "./nav";
import SignalsBadge from "./SignalsBadge";
import PairSearchBar from "./PairSearchBar";
import { createBrowserSupabase } from "@/lib/supabase/client";

/**
 * Kopfzeile: Modus-Wechsel als Icon-Reihe, darunter die Tabs des aktiven Modus.
 *
 * Ersetzt Sidebar und TopBar. Die Sidebar zeigte ~20 Einträge gleichzeitig und
 * kostete auf jeder Seite 248px Breite; hier stehen fünf Icons und die Seiten
 * genau eines Modus. Die volle Breite gehört dem Inhalt.
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

  // Avatar-Menü (Einstellungen · Leitfaden). Beide Seiten haben keinen
  // Modus-Tab mehr und sind ausschliesslich hierüber erreichbar.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Klick ausserhalb / Escape schliesst das Menü. Ein Klick auf einen Menü-
  // Eintrag schliesst über dessen onClick (siehe unten); ein Klick daneben
  // (Logo, Modus-Icons, Tabs) liegt ausserhalb von menuRef und greift hier.
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

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

  return (
    <header className="sticky top-0 z-20 bg-sidebar border-b border-border">
      <div className="flex items-center gap-4 px-6 py-3.5">
        {/* Logo = Weg zurück zur Übersicht. */}
        <Link
          href={LAUNCHER_HREF}
          title="Zurück zur Übersicht"
          aria-label="Zurück zur Übersicht"
          className="shrink-0 w-6 h-6 rounded-md rotate-45 bg-accent hover:opacity-80 transition-opacity"
        />

        {/* Modus-Wechsel: fünf Icons, immer an derselben Stelle. */}
        <nav className="flex-1 flex items-center justify-center gap-2.5">
          {MODES.map((m) => {
            const aktiv = mode?.key === m.key;
            return (
              <Link
                key={m.key}
                href={m.base}
                title={m.label}
                aria-label={m.label}
                aria-current={aktiv ? "page" : undefined}
                className={`relative w-9 h-9 rounded-[10px] flex items-center justify-center transition-colors ${
                  aktiv
                    ? "bg-accent text-sidebar"
                    : "text-text/45 hover:text-text hover:bg-active"
                }`}
              >
                <i className={`ph-bold ${m.icon} text-[17px]`} />
                {/* Unentschiedene GVA-Hits hängen am Cockpit-Modus. */}
                {m.key === "trades" && (
                  <span className="absolute -top-1 -right-1">
                    <SignalsBadge />
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <Suspense fallback={null}>
            <PairSearchBar />
          </Suspense>
          {/* Avatar öffnet das Menü zu Einstellungen und Leitfaden. */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((offen) => !offen)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title={userName}
              className="block rounded-full transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {userAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={userAvatar} alt={userName} className="w-[30px] h-[30px] rounded-full" />
              ) : (
                <span className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-[11px] font-bold bg-active text-text">
                  {userName.charAt(0).toUpperCase()}
                </span>
              )}
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1.5 min-w-[172px] rounded-lg border border-border bg-sidebar py-1 shadow-lg z-30"
              >
                <div className="px-3 py-1.5 text-[11px] text-faint truncate">{userName}</div>
                <Link
                  href="/einstellungen"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-[12.5px] text-muted hover:bg-active hover:text-text transition-colors"
                >
                  <i className="ph-bold ph-gear text-[13px]" />
                  Einstellungen
                </Link>
                <Link
                  href="/leitfaden"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-[12.5px] text-muted hover:bg-active hover:text-text transition-colors"
                >
                  <i className="ph-bold ph-book-open text-[13px]" />
                  Leitfaden
                </Link>
              </div>
            )}
          </div>

          <button
            onClick={handleSignOut}
            disabled={signingOut}
            title="Abmelden"
            className="p-1.5 rounded-lg text-faint hover:bg-down-dim hover:text-down transition-colors disabled:cursor-not-allowed"
          >
            <i className="ph-bold ph-sign-out text-[14px]" />
          </button>
        </div>
      </div>

      {/* Tab-Leiste: ausschliesslich die Seiten des aktiven Modus. */}
      {mode && (
        <div className="flex items-center justify-center gap-1.5 px-6 pb-3 overflow-x-auto">
          {mode.tabs.map((tab) => {
            const aktiv = tab.href === activeHref;
            const gesperrt = tab.requiresAdmin && !isAdmin;

            if (gesperrt) {
              return (
                <span
                  key={tab.href}
                  title="Nur für Admins verfügbar"
                  className="inline-flex items-center gap-1.5 whitespace-nowrap px-3.5 py-1.5 rounded-[7px] text-[12.5px] font-medium text-faint opacity-50 cursor-not-allowed"
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
                className={`whitespace-nowrap px-3.5 py-1.5 rounded-[7px] text-[12.5px] transition-colors ${
                  aktiv
                    ? "font-bold bg-accent-dim text-accent"
                    : "font-medium text-muted hover:text-text"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      )}
    </header>
  );
}
