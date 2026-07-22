/**
 * Navigations-Architektur: fünf Modi statt einer Sidebar mit ~20 Einträgen.
 *
 * Die Sidebar zeigte alles gleichzeitig — sechs Gruppen, von überall aus
 * erreichbar. Das ist keine Navigation, sondern eine Auswahl, und sie musste
 * bei jedem Seitenaufruf neu getroffen werden. Jetzt beantwortet der Launcher
 * einmal die Frage „was mache ich heute?"; innerhalb eines Modus sind nur noch
 * dessen eigene Seiten sichtbar.
 *
 * Keine Route wurde gelöscht oder umbenannt — es ändert sich nur, wie man
 * hinkommt. Gesperrte Routen (`lib/nav/hidden.ts`) werden hier herausgefiltert,
 * damit kein Tab auf etwas zeigt, das der Proxy sofort wegredirectet.
 */

import { isHiddenRoute } from "@/lib/nav/hidden";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  requiresAdmin?: boolean;
}

export type ModeKey = "trades" | "journal" | "backtest" | "labor";

/** Welcher Zähler auf der Modus-Kachel steht. `null` = kein Badge. */
export type ModeBadge = "offeneHits" | "ohneAdherence" | "offeneReplays" | "letzteNacht";

export interface AppMode {
  key: ModeKey;
  label: string;
  icon: string;
  /** Einstiegsroute des Modus — Ziel der Kachel im Launcher. */
  base: string;
  /** Eine Zeile mit den enthaltenen Seiten (Launcher-Kachel). */
  summary: string;
  badge: ModeBadge | null;
  tabs: NavItem[];
}

/** Startseite mit den Modus-Kacheln. Immer erreichbar, nie automatisch übersprungen. */
export const LAUNCHER_HREF = "/";
export const LAUNCHER_LABEL = "Übersicht";

const RAW_MODES: AppMode[] = [
  {
    key: "trades",
    label: "Trades finden",
    icon: "ph-crosshair",
    base: "/cockpit",
    summary: "Cockpit · Währungs-Ranking · Radar · Heatmap",
    badge: "offeneHits",
    tabs: [
      { href: "/cockpit", label: "Cockpit", icon: "ph-crosshair" },
      { href: "/ml/ranking", label: "Währungs-Ranking", icon: "ph-ranking" },
      { href: "/scanner/radar", label: "Visuelles Radar", icon: "ph-radar", requiresAdmin: true },
      { href: "/scanner/heatmap", label: "Heatmap 28", icon: "ph-grid-nine", requiresAdmin: true },
    ],
  },
  {
    key: "journal",
    label: "Journalieren",
    icon: "ph-notebook",
    base: "/journal/dashboard",
    summary: "Dashboard · Trades · Equity · Outlook · Kalender · Strategien",
    badge: "ohneAdherence",
    tabs: [
      { href: "/journal/dashboard", label: "Dashboard", icon: "ph-squares-four" },
      { href: "/journal", label: "Trades", icon: "ph-notebook" },
      { href: "/journal/equity", label: "Equity", icon: "ph-chart-line-up" },
      // Eigenes Icon: Cockpit (ph-crosshair) = Lebenszyklus & Entscheidung,
      // Outlook (ph-binoculars) = Detailebene darüber.
      { href: "/journal/outlook", label: "Outlook", icon: "ph-binoculars" },
      { href: "/journal/kalender", label: "Trade-Kalender", icon: "ph-calendar-heart" },
      // Strategien sitzt direkt hinter dem Kalender: definierte Setups gehören
      // zum Journalieren, nicht mehr in einen eigenen System-Modus.
      { href: "/journal/strategie", label: "Strategien", icon: "ph-strategy" },
    ],
  },
  {
    key: "backtest",
    label: "Backtesten",
    icon: "ph-rewind",
    base: "/journal/backtest",
    summary: "Backtest-Lab · Replay (GVA-Hits)",
    badge: "offeneReplays",
    tabs: [
      { href: "/journal/backtest", label: "Backtest-Lab", icon: "ph-flask" },
      { href: "/ml/replay", label: "Replay (GVA-Hits)", icon: "ph-rewind" },
    ],
  },
  {
    // Faktor-Detail-Ansichten + Auto-News: erklären das „Warum", sind aber
    // keine tägliche Entscheidungsquelle. Bewusst ein eigener Modus, damit sie
    // den täglichen Weg nicht mehr verstellen.
    key: "labor",
    label: "Labor",
    icon: "ph-microscope",
    base: "/ml/factor-lab",
    summary: "Factor-Lab · Engine-Log · Macro Terminal · Real Yield · News",
    badge: "letzteNacht",
    tabs: [
      { href: "/ml/factor-lab", label: "Factor-Lab", icon: "ph-flask" },
      { href: "/ml/engine-log", label: "Engine-Log", icon: "ph-list-checks" },
      { href: "/makro/terminal", label: "Macro Terminal", icon: "ph-globe-hemisphere-west" },
      { href: "/makro/real-yield", label: "Real Yield", icon: "ph-scales" },
      { href: "/dashboard", label: "News", icon: "ph-newspaper" },
    ],
  },
  // Kein „System"-Modus mehr: Strategien liegt jetzt im Journalieren-Modus,
  // Einstellungen und Leitfaden hängen am Avatar-Menü der Kopfzeile
  // (components/layout/ModeChrome.tsx). Beide Routen bleiben unverändert
  // erreichbar, nur ohne eigenen Modus-Tab — modeForPath() liefert für sie
  // `null`, die Kopfzeile rendert dort keine Tab-Leiste.
];

/**
 * Die Modi, wie die Oberfläche sie sieht: ohne gesperrte Routen. Ein Modus,
 * dessen Seiten alle gesperrt wären, fiele komplett weg (aktuell tritt der
 * Fall nicht ein — die Regel steht trotzdem, damit eine spätere Sperre nicht
 * still einen toten Tab hinterlässt).
 */
export const MODES: AppMode[] = RAW_MODES.map((m) => ({
  ...m,
  tabs: m.tabs.filter((t) => !isHiddenRoute(t.href)),
})).filter((m) => m.tabs.length > 0);

export function modeByKey(key: string): AppMode | null {
  return MODES.find((m) => m.key === key) ?? null;
}

/**
 * Route → Tab. Es gewinnt der LÄNGSTE passende Tab-Pfad, sonst würde
 * „/journal" (Trades) bei „/journal/backtest" mitleuchten und den falschen
 * Modus aufziehen.
 */
function matchTab(pathname: string): { mode: AppMode; tab: NavItem } | null {
  let treffer: { mode: AppMode; tab: NavItem } | null = null;
  for (const mode of MODES) {
    for (const tab of mode.tabs) {
      if (pathname === tab.href || pathname.startsWith(tab.href + "/")) {
        if (!treffer || tab.href.length > treffer.tab.href.length) {
          treffer = { mode, tab };
        }
      }
    }
  }
  return treffer;
}

/**
 * Modus zu einer Route. Damit rendert auch der direkte Aufruf einer Unterseite
 * (z.B. `/journal/equity` aus einem Lesezeichen) den richtigen Modus mit
 * korrekt markiertem Tab. `null` = kein Modus (Launcher oder unbekannte Route).
 */
export function modeForPath(pathname: string): AppMode | null {
  if (pathname === LAUNCHER_HREF) return null;
  return matchTab(pathname)?.mode ?? null;
}

/** Aktiver Tab innerhalb des Modus — `null`, wenn die Route zu keinem gehört. */
export function activeTabHref(pathname: string): string | null {
  if (pathname === LAUNCHER_HREF) return null;
  return matchTab(pathname)?.tab.href ?? null;
}

/**
 * Seitentitel für die Kopfzeile. Modus-Name und Tab-Label ergeben ihn
 * normalerweise selbst; hier stehen nur die Fälle, in denen der Tab-Name zu
 * knapp wäre, plus die Routen ohne eigenen Tab.
 */
export const PAGE_TITLES: Record<string, string> = {
  "/cockpit": "Cockpit — Trades der Woche",
  "/dashboard": "News — Wirtschaftskalender",
  "/weekly": "Weekly Outlook — Sonntags-Cockpit",
  "/cot/intelligence": "COT Intelligence — Institutionelle Positionierung",
  "/makro/terminal": "Macro Terminal — G8 Currency Bias",
  "/makro/terminal/vergleich": "Macro Terminal — Währungsvergleich",
  "/makro/real-yield": "Real Yield — Valuation-Bias (Zins − Inflation)",
  "/scanner/radar": "Visuelles Radar",
  "/scanner/heatmap": "Heatmap 28",
  "/journal": "Trade-Journal",
  "/journal/dashboard": "Journal-Dashboard",
  "/journal/equity": "Equity-Kurve",
  "/journal/outlook": "Outlook — Details & eigene Thesen",
  "/journal/kalender": "Trade-Kalender",
  "/journal/strategie": "Strategie-Builder",
  "/journal/backtest": "Backtest-Lab",
  "/ml": "Machine Learning — Daten-Check",
  "/ml/training": "ML-Training — Modell & Predictions",
  "/ml/ranking": "Währungs-Ranking — ML-Engine",
  "/ml/fundamental-track": "Fundamental-Track — Q-Score vs. Markt",
  "/ml/setup-finder": "Setup-Finder — Ranking vs. Outlook-Konfluenz",
  "/ml/factor-lab": "Factor-Lab — welcher Faktor trifft?",
  "/ml/replay": "Backtest-Replay — GVA-Hits bewerten",
  "/ml/engine-log": "Engine-Log — Nächtliche Experiment-Suche",
  "/ml/modell": "ML-Modell — Anleitung",
  "/ml/season": "Saisonalität 2.0 — Feature-Explorer",
  "/leitfaden": "Leitfaden",
  "/einstellungen": "Einstellungen",
};
