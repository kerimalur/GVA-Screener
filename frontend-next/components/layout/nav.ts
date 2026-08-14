/**
 * Navigations-Architektur des Labors.
 *
 * HISTORIE (13.08.2026): Diese Anwendung war zwei Jahre lang ein
 * Trading-Frontend — Scanner, Cockpit, Journal, Backtest, Makro-Terminal,
 * ML-Engine, alles in einem. Genau darin lag das Problem: Entscheiden und
 * Forschen sind zwei verschiedene Tätigkeiten mit verschiedenen Rhythmen. Wer
 * morgens einen Trade sucht, will keine Konfidenzintervalle sehen; wer eine
 * Hypothese prüft, will nicht von einem blinkenden Kurs abgelenkt werden.
 *
 * Deshalb ist alles Entscheiden nach KerimOS gewandert (Cockpit, Ranking,
 * Radar, Heatmap, Journal, Backtest — siehe ../../TRADING-UMBAU.md), und was
 * hier bleibt, ist ausschliesslich **Labor**: Machine Learning, quantitative
 * Auswertung und Fundamentaldaten.
 *
 * Die drei Modi folgen der Frage, die man gerade hat:
 *
 *   Modelle   — taugt das Modell etwas?      (Suche, Holdout, Baseline)
 *   Faktoren  — welcher Faktor trägt?        (Einzelfaktor gegen Markt)
 *   Märkte    — wie ist die Lage überhaupt?  (Makro, Zinsen, COT, Termine)
 *
 * Gesperrte Routen (`lib/nav/hidden.ts`) werden hier herausgefiltert. Seit dem
 * Umbau ist die Liste leer — was früher gesperrt war (Saisonalität,
 * Fundamental-Track, Setup-Finder, COT, Weekly), ist genau der Inhalt, um den
 * es jetzt geht.
 */

import { isHiddenRoute } from "@/lib/nav/hidden";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  requiresAdmin?: boolean;
  /**
   * Nur die Route selbst markieren, keine Unterseiten.
   *
   * Nötig für Tabs, deren Pfad Präfix anderer Routen ist: "/ml" ist die
   * Datenlage, aber "/ml/ranking" und "/ml/factor-lab" sind eigene Seiten.
   * Ohne dieses Flag würde "/ml" jede unbekannte "/ml/…"-Route einsammeln und
   * die Kopfzeile behauptete, man sei auf der Datenlage — auch auf einer 404.
   */
  exact?: boolean;
}

export type ModeKey = "modelle" | "faktoren" | "maerkte";

/** Welcher Zähler auf der Modus-Kachel steht. `null` = kein Badge. */
export type ModeBadge = "letzteNacht";

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
export const LAUNCHER_LABEL = "Labor";

const RAW_MODES: AppMode[] = [
  {
    key: "modelle",
    label: "Modelle",
    icon: "ph-brain",
    base: "/ml/engine-log",
    summary: "Engine-Log · Holdout · Modell-Ranking · Training · Datenlage",
    badge: "letzteNacht",
    tabs: [
      { href: "/ml/engine-log", label: "Engine-Log", icon: "ph-list-checks" },
      { href: "/ml/ranking", label: "Modell-Ranking", icon: "ph-ranking" },
      { href: "/ml/training", label: "Training", icon: "ph-graduation-cap" },
      { href: "/ml/modell", label: "Anleitung", icon: "ph-book-open" },
      { href: "/ml", label: "Datenlage", icon: "ph-database", exact: true },
    ],
  },
  {
    key: "faktoren",
    label: "Faktoren",
    icon: "ph-flask",
    base: "/ml/factor-lab",
    summary: "Factor-Lab · Fundamental-Track · Setup-Finder · Saisonalität",
    badge: null,
    tabs: [
      { href: "/ml/factor-lab", label: "Factor-Lab", icon: "ph-flask" },
      { href: "/ml/fundamental-track", label: "Fundamental-Track", icon: "ph-chart-line" },
      { href: "/ml/setup-finder", label: "Setup-Finder", icon: "ph-magnifying-glass" },
      { href: "/ml/season", label: "Saisonalität", icon: "ph-calendar-blank" },
    ],
  },
  {
    key: "maerkte",
    label: "Märkte",
    icon: "ph-globe-hemisphere-west",
    base: "/makro/terminal",
    summary: "Macro Terminal · Real Yield · COT · Weekly · Termine",
    badge: null,
    tabs: [
      { href: "/makro/terminal", label: "Macro Terminal", icon: "ph-globe-hemisphere-west" },
      { href: "/makro/real-yield", label: "Real Yield", icon: "ph-scales" },
      { href: "/cot/intelligence", label: "COT", icon: "ph-users-three" },
      { href: "/weekly", label: "Weekly", icon: "ph-binoculars" },
      { href: "/dashboard", label: "Termine", icon: "ph-newspaper" },
    ],
  },
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
 * Route → Tab. Es gewinnt der LÄNGSTE passende Tab-Pfad, sonst würde „/ml"
 * (Datenlage) bei „/ml/ranking" mitleuchten und den falschen Tab markieren.
 */
function matchTab(pathname: string): { mode: AppMode; tab: NavItem } | null {
  let treffer: { mode: AppMode; tab: NavItem } | null = null;
  for (const mode of MODES) {
    for (const tab of mode.tabs) {
      const passt = tab.exact
        ? pathname === tab.href
        : pathname === tab.href || pathname.startsWith(tab.href + "/");
      if (passt) {
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
 * (z.B. `/makro/real-yield` aus einem Lesezeichen) den richtigen Modus mit
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
  "/ml": "Datenlage — reicht das Material für ein Modell?",
  "/ml/engine-log": "Engine-Log — Suche, Holdout und Baseline",
  "/ml/ranking": "Modell-Ranking — Wochenausgabe der Engine",
  "/ml/training": "Training — Modell und Vorhersagen",
  "/ml/modell": "Modell — Anleitung und Annahmen",
  "/ml/factor-lab": "Factor-Lab — welcher Faktor trifft?",
  "/ml/fundamental-track": "Fundamental-Track — Q-Score gegen Markt",
  "/ml/setup-finder": "Setup-Finder — Ranking gegen Outlook-Konfluenz",
  "/ml/season": "Saisonalität — Feature-Explorer",
  "/makro/terminal": "Macro Terminal — G8 Currency Bias",
  "/makro/terminal/vergleich": "Macro Terminal — Währungsvergleich",
  "/makro/real-yield": "Real Yield — Zins minus Inflation",
  "/cot/intelligence": "COT — institutionelle Positionierung",
  "/weekly": "Weekly — Wochenlage je Paar",
  "/dashboard": "Termine — Wirtschaftskalender",
  "/leitfaden": "Leitfaden",
  "/einstellungen": "Einstellungen",
};
