/**
 * Hart gesperrte Bereiche — EINE Quelle für Sperre und Navigation.
 *
 * `proxy.ts` erzwingt die Liste, `components/layout/nav.ts` filtert die Tabs
 * damit. So kann kein sichtbarer Tab auf eine Route zeigen, die der Proxy
 * sofort wieder wegredirectet.
 *
 * SEIT DEM UMBAU ZUM LABOR (13.08.2026) IST DIE LISTE LEER.
 *
 * Sie enthielt früher `/weekly`, `/cot`, `/ml/season`, `/ml/fundamental-track`,
 * `/ml/setup-finder`, `/ml/modell`, `/ml/training` und `/ml` — also
 * ausgerechnet die Seiten, die den fundamentalen und quantitativen Teil
 * ausmachen. Damals waren sie im Weg, weil die Anwendung dem täglichen
 * Traden dienen sollte. Jetzt sind sie der Inhalt.
 *
 * Der Mechanismus bleibt bestehen: Eine Route wieder sperren heisst, ihren
 * Pfad hier einzutragen — Navigation und Proxy ziehen von selbst nach.
 */

export const HIDDEN_PREFIXES: readonly string[] = [];

/** Exakt gesperrt, ohne Unterseiten. Ebenfalls leer. */
export const HIDDEN_EXACT: readonly string[] = [];

export function isHiddenRoute(pathname: string): boolean {
  if (HIDDEN_EXACT.includes(pathname)) return true;
  return HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
