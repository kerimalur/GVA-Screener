"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NAV, MENUE, TITEL, aktiverPfad } from "./nav";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { cx } from "@/components/ui";

/**
 * Kopfzeile des Labors.
 *
 * Eine Zeile, kein zweistöckiges Konstrukt aus Modus-Icons und Tab-Leiste
 * darunter. Links die Marke, mittig die sechs Ziele, rechts das Menü.
 *
 * Der aktive Eintrag wird durch eine Linie am unteren Rand markiert, nicht
 * durch eine gefüllte Pille. Eine Füllung in der Akzentfarbe konkurriert mit
 * den Zahlen darunter — die Linie ordnet, ohne zu rufen.
 */
export default function Chrome() {
  const pfad = usePathname();
  const router = useRouter();
  const aktiv = aktiverPfad(pfad);

  const [name, setName] = useState("");
  const [offen, setOffen] = useState(false);
  const [abmeldend, setAbmeldend] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let lebt = true;
    createBrowserSupabase()
      .auth.getUser()
      .then(({ data: { user } }) => {
        if (!lebt || !user) return;
        const n =
          user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0];
        if (n) setName(String(n).split(" ")[0]);
      })
      .catch(() => {});
    return () => {
      lebt = false;
    };
  }, []);

  // Klick daneben schliesst das Menü. Ohne das bleibt es beim Navigieren
  // offen stehen und verdeckt die Seite, auf der man gerade gelandet ist.
  useEffect(() => {
    if (!offen) return;
    const zu = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOffen(false);
    };
    document.addEventListener("mousedown", zu);
    return () => document.removeEventListener("mousedown", zu);
  }, [offen]);

  const abmelden = async () => {
    setAbmeldend(true);
    try {
      await createBrowserSupabase().auth.signOut();
    } catch {
      // Auch wenn das Abmelden scheitert: zur Login-Seite. Dort merkt man
      // sofort, ob die Sitzung noch steht.
    }
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-chrome/95 backdrop-blur-md">
      <div className="mx-auto flex h-[52px] max-w-[1600px] items-center gap-6 px-4">
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-2.5"
          title="Übersicht"
        >
          {/* Marke als Zeichnung statt als Bilddatei: skaliert überall,
              lädt nicht nach, und die Akzentfarbe kommt aus dem Theme. */}
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
            <rect x="0.75" y="0.75" width="16.5" height="16.5" rx="4"
              stroke="var(--color-accent)" strokeWidth="1.5" opacity="0.55" />
            <path d="M4.5 11.5 L7.2 7.4 L9.6 10 L13.5 5.2"
              stroke="var(--color-accent)" strokeWidth="1.6"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[13px] font-semibold tracking-tight text-text">
            GVA<span className="text-faint"> Labor</span>
          </span>
        </Link>

        <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {NAV.map((i) => {
            const an = i.href === aktiv;
            return (
              <Link
                key={i.href}
                href={i.href}
                title={i.zweck}
                aria-current={an ? "page" : undefined}
                className={cx(
                  "relative shrink-0 px-3 py-[15px] text-[12.5px] transition-colors",
                  an ? "text-text" : "text-muted hover:text-text",
                )}
              >
                {i.label}
                {an && (
                  <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-accent" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={() => setOffen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={offen}
            className={cx(
              "flex h-8 items-center gap-2 rounded-[var(--radius-cell)] border px-2.5",
              "text-[12px] transition-colors",
              offen
                ? "border-accent-line bg-accent-dim text-text"
                : "border-line text-muted hover:border-line2 hover:text-text",
            )}
          >
            <span className="hidden sm:inline">{name || "Konto"}</span>
            <span className="text-[9px] leading-none">▾</span>
          </button>

          {offen && (
            <div
              role="menu"
              className="anim-rise absolute right-0 top-[38px] w-56 overflow-hidden rounded-[var(--radius-panel)] border border-line bg-raised"
            >
              {MENUE.map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  role="menuitem"
                  onClick={() => setOffen(false)}
                  className="block border-b border-line px-3 py-2.5 transition-colors last:border-b-0 hover:bg-surface"
                >
                  <div className="text-[12.5px] text-text">{i.label}</div>
                  <div className="text-[11px] text-faint">{i.zweck}</div>
                </Link>
              ))}
              <button
                type="button"
                role="menuitem"
                onClick={abmelden}
                disabled={abmeldend}
                className="w-full border-t border-line px-3 py-2.5 text-left text-[12.5px] text-muted transition-colors hover:bg-surface hover:text-down disabled:opacity-50"
              >
                {abmeldend ? "wird abgemeldet …" : "Abmelden"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Seitentitel als eigene, ruhige Zeile. Auf der Übersicht weggelassen —
          dort ist die Seite ihr eigener Titel. */}
      {aktiv && aktiv !== "/" && TITEL[aktiv] && (
        <div className="mx-auto max-w-[1600px] px-4 pb-2.5">
          <span className="lbl">{TITEL[aktiv]}</span>
        </div>
      )}
    </header>
  );
}
