/**
 * Hart gesperrte Bereiche — EINE Quelle für Sperre und Navigation.
 *
 * Vorher stand die Liste nur in `proxy.ts`. Ein Nav-Eintrag konnte damit auf
 * eine Route zeigen, die der Proxy sofort wieder wegredirectet — sichtbarer
 * Tab, der ins Leere führt. Jetzt lesen beide Seiten dieselbe Liste:
 * `proxy.ts` erzwingt sie, `components/layout/nav.ts` filtert die Tabs damit.
 *
 * Code und Seiten bleiben im Projekt. Wieder aktivieren = Pfad hier streichen
 * und den Tab in `nav.ts` ergänzen.
 */

export const HIDDEN_PREFIXES = [
  "/weekly",
  "/cot",
  "/ml/season",
  "/ml/fundamental-track",
  "/ml/setup-finder",
  "/ml/modell",
  "/ml/training",
  "/ml/labor",
] as const;

/**
 * Exakt gesperrt, ohne Unterseiten: "/ml" ist der Daten-Check.
 * `/ml/ranking`, `/ml/factor-lab`, `/ml/engine-log`, `/ml/replay` bleiben
 * erreichbar — deshalb hier kein Prefix-Match.
 */
export const HIDDEN_EXACT = ["/ml"] as const;

export function isHiddenRoute(pathname: string): boolean {
  if ((HIDDEN_EXACT as readonly string[]).includes(pathname)) return true;
  return HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
