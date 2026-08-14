/**
 * Navigation des Labors — eine flache Leiste, keine Modi mehr.
 *
 * HISTORIE. Erst gab es eine Sidebar mit ~20 Einträgen. Die wurde durch fünf
 * „Modi" ersetzt, weil zwanzig gleichzeitig sichtbare Ziele keine Navigation
 * sind, sondern eine Entscheidung, die man bei jedem Seitenaufruf neu treffen
 * muss. Dann zog alles Handeln nach KerimOS um, und es blieben drei Modi mit
 * je vier Tabs — für zwölf Seiten zwei Ebenen. Das war eine Ebene zu viel:
 * Man klickte in „Faktoren", um dann noch einmal zu wählen.
 *
 * Nach dem Zuschnitt vom 14.08.2026 sind es sechs Seiten. Sechs Ziele passen
 * in eine Zeile und brauchen keine Zwischenebene. Was selten gebraucht wird
 * (Datenlage, Leitfaden, Einstellungen), hängt am Menü rechts.
 *
 * Der Aufbau folgt der Reihenfolge der Arbeit:
 *
 *   Übersicht   Was ist seit gestern passiert?
 *   Markt       Wie steht es fundamental — und wo widerspricht sich das?
 *   Strategien  Trägt eine Regel über zehn Jahre?
 *   Engine      Was hat die nächtliche Suche gefunden?
 *   Ranking     Wie gut lag das Modell zuletzt wirklich?
 *   Training    Woraus besteht das Modell?
 */

export interface NavItem {
  href: string;
  label: string;
  /** Ein Satz für die Übersicht und den Tooltip. */
  zweck: string;
  /** Nur diese Route markieren, keine Unterseiten. */
  exact?: boolean;
}

export const HOME = "/";

/** Die Leiste. Reihenfolge = Reihenfolge der Arbeit, nicht Alphabet. */
export const NAV: NavItem[] = [
  { href: "/", label: "Übersicht", zweck: "Was seit dem letzten Blick passiert ist", exact: true },
  { href: "/markt", label: "Markt", zweck: "Fundamentale Lage aller Währungen und Paare" },
  { href: "/strategien", label: "Strategien", zweck: "Regeln über zehn Jahre prüfen" },
  { href: "/ml/engine-log", label: "Engine", zweck: "Nächtliche Suche, Holdout, Baseline" },
  { href: "/ml/ranking", label: "Ranking", zweck: "Wochenausgabe des Modells und ihre Treffer" },
  { href: "/ml/training", label: "Training", zweck: "Woraus das Modell besteht" },
];

/** Selten gebraucht — hängt am Menü rechts, nicht in der Leiste. */
export const MENUE: NavItem[] = [
  { href: "/ml", label: "Datenlage", zweck: "Reicht das Material für ein Modell?", exact: true },
  { href: "/leitfaden", label: "Leitfaden", zweck: "Wozu das Labor da ist" },
  { href: "/einstellungen", label: "Einstellungen", zweck: "Konto und Zugang" },
];

const ALLE = [...NAV, ...MENUE];

function passt(item: NavItem, pfad: string): boolean {
  return item.exact ? pfad === item.href : pfad === item.href || pfad.startsWith(item.href + "/");
}

/**
 * Aktiver Eintrag. Der längste Treffer gewinnt — sonst würde „/ml" bei
 * „/ml/ranking" mitleuchten. „/" und „/ml" tragen deshalb zusätzlich
 * `exact`, damit sie unbekannte Unterpfade nicht einsammeln und die
 * Kopfzeile auf einer 404 nicht behauptet, man sei irgendwo.
 */
export function aktiverPfad(pfad: string): string | null {
  return (
    ALLE.filter((i) => passt(i, pfad))
      .map((i) => i.href)
      .sort((a, b) => b.length - a.length)[0] ?? null
  );
}

export function navItem(pfad: string): NavItem | null {
  const treffer = aktiverPfad(pfad);
  return ALLE.find((i) => i.href === treffer) ?? null;
}

/**
 * Seitentitel für die Kopfzeile. Nur wo das Nav-Label zu knapp wäre oder
 * die Route gar keinen Eintrag hat.
 */
export const TITEL: Record<string, string> = {
  "/": "Übersicht",
  "/markt": "Markt — fundamentale Lage",
  "/strategien": "Strategien — Regeln über zehn Jahre",
  "/ml/engine-log": "Engine — Suche, Holdout, Baseline",
  "/ml/ranking": "Ranking — Wochenausgabe und Treffer",
  "/ml/training": "Training — Aufbau des Modells",
  "/ml": "Datenlage",
  "/leitfaden": "Leitfaden",
  "/einstellungen": "Einstellungen",
};
