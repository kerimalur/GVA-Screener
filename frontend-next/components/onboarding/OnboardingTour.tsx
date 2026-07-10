"use client";

/**
 * Interaktive Onboarding-Tour für neue Accounts.
 *
 * Startet automatisch NUR beim allerersten Login eines neuen Accounts
 * (nach Stripe-Kauf + Aktivierung). Der Status wird in `user_preferences`
 * (Key: "onboarding_tour") gespeichert — nach Abschluss oder Überspringen
 * erscheint die Tour nie wieder automatisch.
 *
 * Bestandsaccounts (älter als NEW_ACCOUNT_WINDOW) bekommen die Tour nicht;
 * sie kann aber über Einstellungen → "Tour erneut ansehen" neu gestartet
 * werden (setzt completed:false, siehe app/(app)/einstellungen/page.tsx).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { loadPref, savePref } from "@/lib/journal/prefs";

export const ONBOARDING_PREF_KEY = "onboarding_tour";

/** Accounts, die jünger sind als dieses Fenster, gelten als "neu". */
const NEW_ACCOUNT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // 14 Tage

interface OnboardingPref {
  completed: boolean;
  at?: string;
  skipped?: boolean;
  /** true = automatisch als Bestandsaccount markiert, Tour nie gezeigt */
  auto?: boolean;
  version?: number;
}

interface TourStep {
  key: string;
  /** CSS-Selector des Sidebar-Elements; ohne target → zentrierte Karte */
  target?: string;
  badge?: string;
  title: string;
  body: string;
}

const STEPS: TourStep[] = [
  {
    key: "welcome",
    title: "Willkommen im FX Terminal",
    body: "Dein Account ist aktiviert — schön, dass du dabei bist. In rund zwei Minuten zeigen wir dir die wichtigsten Bereiche: von den Analysen über den Kalender bis zu deinem Trade-Journal. Du kannst die Tour jederzeit überspringen.",
  },
  {
    key: "dashboard",
    target: '[data-tour="/dashboard"]',
    title: "Dashboard",
    body: "Dein täglicher Startpunkt: die Pair-Übersicht mit Currency-Bias, Währungs-Stärke, Risk-Gauge und Screener. Hier siehst du auf einen Blick, wo gerade etwas läuft.",
  },
  {
    key: "weekly",
    target: '[data-tour="/weekly"]',
    title: "Weekly Outlook",
    body: "Das Sonntags-Cockpit für deine Wochenplanung: alle Analysen pro Pair verdichtet. Von hier kannst du mit einem Klick einen Outlook fürs Journal vorbefüllen.",
  },
  {
    key: "cot",
    target: '[data-tour="/cot"]',
    title: "COT-Analyse",
    body: "Commitment of Traders: die Positionierung der grossen Marktteilnehmer aus den offiziellen CFTC-Reports — mit Historie, Kontrakt-Vergleich und COT-Backtests.",
  },
  {
    key: "makro",
    target: '[data-tour="/makro"]',
    title: "Makro & Zinsen",
    body: "Fundamentaldaten und Zentralbanken: Zinsen, Inflation und Wachstum (FRED), Zins-Spreads und Markterwartungen — Regionen direkt im Vergleich.",
  },
  {
    key: "sentiment",
    target: '[data-tour="/sentiment"]',
    title: "Retail Sentiment",
    body: "Wie die Retail-Trader positioniert sind (Myfxbook) — oft ein Kontra-Indikator. Inklusive Verlauf pro Pair.",
  },
  {
    key: "intermarket",
    target: '[data-tour="/intermarket"]',
    title: "Intermarket",
    body: "Zusammenhänge zwischen den Märkten: Korrelations-Matrix, DXY-Analyse und Overlay-Charts, um dein Pair gegen andere Märkte zu legen.",
  },
  {
    key: "saisonalitaet",
    target: '[data-tour="/saisonalitaet"]',
    title: "Saisonalität",
    body: "Wie sich Pairs historisch in bestimmten Monaten verhalten — als Heatmap über alle Pairs und als Detail-Ansicht pro Pair.",
  },
  {
    key: "kalender",
    target: '[data-tour="/kalender"]',
    title: "Wirtschaftskalender",
    body: "Alle wichtigen Wirtschafts-Events im Blick — damit dich kein High-Impact-Termin auf dem falschen Fuss erwischt.",
  },
  {
    key: "vergleich",
    target: '[data-tour="/vergleich"]',
    title: "Vergleich",
    body: "Das Vergleichs-Tool: beliebige Datenreihen übereinanderlegen — Preise, COT-Positionierung, Makro-Serien und Sentiment — und Zusammenhänge selbst prüfen.",
  },
  {
    key: "scanner",
    target: '[data-tour-group="Markt-Scanner"]',
    badge: "Beta",
    title: "Markt-Scanner",
    body: "Dieser Bereich ist ein privater Testbereich (Beta) und aktuell nicht Teil des regulären Abos. Er wird intern getestet und ist deshalb gesperrt.",
  },
  {
    key: "journal",
    target: '[data-tour="/journal"]',
    title: "Trade-Journal",
    body: "Dein Journal: Richte zuerst dein Konto ein (Startkapital und Währung), danach journalierst du Trades mit Strategie, Confluences, R-Multiple und Screenshot. Eigene Confluences kannst du direkt im Trade-Formular anlegen.",
  },
  {
    key: "outlook",
    target: '[data-tour="/journal/outlook"]',
    title: "Outlooks",
    body: "Hier hältst du deine Trading-Thesen pro Pair fest und siehst, wie sie aufgehen. Am schnellsten erstellst du einen Outlook direkt aus dem Weekly Outlook — dann werden COT, Makro, Sentiment und Saisonalität automatisch vorbefüllt.",
  },
  {
    key: "daten",
    title: "Worauf die Daten basieren",
    body: "Preise kommen von OANDA, COT-Reports von der CFTC, Makro-Daten von FRED, Retail-Sentiment von Myfxbook, dazu der Wirtschaftskalender. Alles wird automatisch täglich um 06:30 Uhr (Schweizer Zeit) geladen und aufbereitet.",
  },
  {
    key: "einstellungen",
    target: '[data-tour="/einstellungen"]',
    title: "Einstellungen",
    body: "Hier verwaltest du dein Abo (Stripe-Kundenportal) und siehst den Daten-Status: wann welcher Datensatz zuletzt aktualisiert wurde und ab wann Historie verfügbar ist.",
  },
  {
    key: "finish",
    title: "Das war's — viel Erfolg!",
    body: "Starte am besten im Dashboard und wirf einen Blick auf den Weekly Outlook. Du kannst diese Tour jederzeit in den Einstellungen erneut ansehen.",
  },
];

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export default function OnboardingTour() {
  const [active, setActive] = useState(false);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const finishedRef = useRef(false);

  // ---- Erststart-Erkennung -------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createBrowserSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;

        const pref = await loadPref<OnboardingPref | null>(ONBOARDING_PREF_KEY, null);
        if (cancelled) return;
        if (pref?.completed) return;

        if (!pref) {
          // Kein Flag vorhanden: nur wirklich neue Accounts bekommen die Tour.
          const created = user.created_at ? new Date(user.created_at).getTime() : 0;
          const isNew = created > 0 && Date.now() - created < NEW_ACCOUNT_WINDOW_MS;
          if (!isNew) {
            // Bestandsaccount: still markieren, damit die Tour nie auftaucht.
            savePref(ONBOARDING_PREF_KEY, {
              completed: true,
              at: new Date().toISOString(),
              auto: true,
              version: 1,
            }).catch(() => {});
            return;
          }
        }
        // Neuer Account ohne Flag ODER expliziter Neustart (completed:false)
        setActive(true);
      } catch {
        // Im Zweifel keine Tour zeigen — nie den App-Zugang blockieren.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const finish = useCallback((skipped: boolean) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setActive(false);
    savePref(ONBOARDING_PREF_KEY, {
      completed: true,
      at: new Date().toISOString(),
      skipped,
      version: 1,
    }).catch(() => {});
  }, []);

  // ---- Ziel-Element vermessen ---------------------------------------------
  const step = STEPS[idx];

  useEffect(() => {
    if (!active) return;
    const update = () => {
      if (!step.target) {
        setRect(null);
        return;
      }
      const el = document.querySelector(step.target) as HTMLElement | null;
      if (!el) {
        setRect(null);
        return;
      }
      el.scrollIntoView({ block: "nearest" });
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [active, step.target]);

  // ---- Scroll-Lock + Tastatur ----------------------------------------------
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish(true);
      if (e.key === "ArrowRight" || e.key === "Enter")
        setIdx((i) => Math.min(i + 1, STEPS.length - 1));
      if (e.key === "ArrowLeft") setIdx((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [active, finish]);

  if (!active) return null;

  const isLast = idx === STEPS.length - 1;
  const isFirst = idx === 0;
  const highlighted = !!(step.target && rect);

  // Karte rechts neben der Sidebar, sonst zentriert
  const CARD_W = 360;
  const cardStyle: React.CSSProperties = highlighted
    ? {
        position: "fixed",
        left: Math.min(rect!.left + rect!.width + 18, Math.max(16, window.innerWidth - CARD_W - 16)),
        top: Math.min(Math.max(rect!.top - 24, 16), Math.max(16, window.innerHeight - 300)),
        width: CARD_W,
        transition: "top 250ms ease, left 250ms ease",
      }
    : {
        position: "fixed",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        width: Math.min(CARD_W + 60, typeof window !== "undefined" ? window.innerWidth - 32 : CARD_W),
      };

  const mono = "'Geist Mono', monospace";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100 }} aria-modal="true" role="dialog">
      {/* Spotlight bzw. Backdrop */}
      {highlighted ? (
        <div
          style={{
            position: "fixed",
            top: rect!.top - 5,
            left: rect!.left - 5,
            width: rect!.width + 10,
            height: rect!.height + 10,
            borderRadius: 10,
            border: "2px solid var(--color-accent, #6c8cff)",
            boxShadow: "0 0 0 9999px rgba(5, 7, 11, 0.8)",
            transition: "all 250ms ease",
            pointerEvents: "none",
          }}
        />
      ) : (
        <div style={{ position: "fixed", inset: 0, background: "rgba(5, 7, 11, 0.8)" }} />
      )}

      {/* Karte */}
      <div
        style={{
          ...cardStyle,
          background: "#0E131A",
          border: "1px solid #232D3A",
          borderRadius: 14,
          padding: "22px 24px 18px 24px",
          boxShadow: "0 18px 50px rgba(0,0,0,0.55)",
        }}
      >
        {/* Kopfzeile: Fortschritt + Schliessen */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.16em", color: "#566273", textTransform: "uppercase" }}>
            Tour {idx + 1} / {STEPS.length}
          </span>
          <button
            type="button"
            onClick={() => finish(true)}
            title="Tour überspringen (Esc)"
            style={{ background: "transparent", border: "none", color: "#566273", cursor: "pointer", fontSize: 15, lineHeight: 1, padding: 4 }}
          >
            <i className="ph-bold ph-x" />
          </button>
        </div>

        {/* Titel */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em", color: "#F4F8FC", margin: 0 }}>
            {step.title}
          </h2>
          {step.badge && (
            <span
              style={{
                fontFamily: mono,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.12em",
                padding: "2px 7px",
                borderRadius: 5,
                background: "rgba(216,164,48,.15)",
                color: "#D8A430",
                border: "1px solid rgba(216,164,48,.3)",
                textTransform: "uppercase",
              }}
            >
              {step.badge}
            </span>
          )}
        </div>

        {/* Text */}
        <p style={{ fontSize: 13.5, lineHeight: 1.65, color: "#AAB6C4", margin: "0 0 18px 0" }}>
          {step.body}
        </p>

        {/* Fortschrittsbalken */}
        <div style={{ height: 3, borderRadius: 2, background: "#1A222D", marginBottom: 16, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${((idx + 1) / STEPS.length) * 100}%`,
              background: "var(--color-accent, #6c8cff)",
              transition: "width 250ms ease",
            }}
          />
        </div>

        {/* Aktionen */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button
            type="button"
            onClick={() => finish(true)}
            style={{ background: "transparent", border: "none", color: "#566273", cursor: "pointer", fontSize: 12.5, padding: "6px 0" }}
          >
            Überspringen
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            {!isFirst && (
              <button
                type="button"
                onClick={() => setIdx((i) => Math.max(i - 1, 0))}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  background: "transparent",
                  border: "1px solid #2E3844",
                  color: "#C7D1DD",
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Zurück
              </button>
            )}
            <button
              type="button"
              onClick={() => (isLast ? finish(false) : setIdx((i) => i + 1))}
              style={{
                padding: "8px 18px",
                borderRadius: 8,
                background: "var(--color-accent, #6c8cff)",
                border: "1px solid transparent",
                color: "#0A0B0E",
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {isLast ? "Los geht's" : isFirst ? "Tour starten" : "Weiter"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
