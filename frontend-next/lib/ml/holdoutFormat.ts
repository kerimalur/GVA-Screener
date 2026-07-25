/** Reine Darstellungs-Logik für Holdout und Engine-Log — ohne `server-only`,
 *  damit Client-Komponenten und das Kontrollwert-Skript sie nutzen können.
 *  Kontrollwerte: `npx tsx scripts/holdout-check.mts` */

export type HoldoutVerdict = "baseline" | "kein-nachweis" | "besser" | "schlechter" | "offen";

export interface HoldoutRow {
  runAt: string;
  runIndex: number;
  family: string;
  isBaseline: boolean;
  hitrate: number | null;
  std: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  n: number | null;
  searchHitrate: number | null;
  selectionGap: number | null;
  delta: number | null;
  deltaCiLow: number | null;
  deltaCiHigh: number | null;
  holdoutStart: string | null;
  holdoutEnd: string | null;
  verdict: HoldoutVerdict;
}

/**
 * Urteil einer Holdout-Zeile — bewusst streng.
 *
 * Schliesst das Konfidenzintervall der Differenz die Null ein, gibt es KEINEN
 * nachweisbaren Vorteil gegenüber der Baseline. Das ist der Normalfall bei
 * schwachem Signal und darf nicht durch Farbgebung als Erfolg erscheinen.
 */
export function verdictOf(r: {
  isBaseline: boolean;
  delta: number | null;
  deltaCiLow: number | null;
  deltaCiHigh: number | null;
}): HoldoutVerdict {
  if (r.isBaseline) return "baseline";
  if (r.delta === null || r.deltaCiLow === null || r.deltaCiHigh === null) return "offen";
  if (r.deltaCiLow <= 0 && r.deltaCiHigh >= 0) return "kein-nachweis";
  return r.deltaCiLow > 0 ? "besser" : "schlechter";
}

export const VERDICT_LABEL: Record<HoldoutVerdict, string> = {
  baseline: "Referenz",
  "kein-nachweis": "kein Nachweis",
  besser: "besser als Baseline",
  schlechter: "schlechter als Baseline",
  offen: "keine Baseline",
};

/**
 * Delta-Anzeige für den Engine-Log.
 *
 * Zwei Fallen, die es vorher gab: ein Delta von exakt 0 wurde als falsy
 * behandelt und gar nicht angezeigt, und winzige Abweichungen erschienen auf
 * 3 Stellen gerundet als «▲0.000» — beides irreführend. Deshalb:
 *   - exakt 0        → «±0.000» (unverändert, nicht «kein Wert»)
 *   - sehr klein     → so viele Nachkommastellen, dass es nicht 0 aussieht
 *   - unter 1e-6     → «±0.000», darunter ist es Rundungsrauschen
 */
export function formatDelta(
  d: number | null,
  minDigits = 3,
  maxDigits = 6,
): { sign: "up" | "down" | "flat"; text: string } | null {
  if (d === null || Number.isNaN(d)) return null;
  if (d === 0) return { sign: "flat", text: "±0.000" };

  const abs = Math.abs(d);
  for (let digits = minDigits; digits <= maxDigits; digits++) {
    const text = abs.toFixed(digits);
    if (Number(text) !== 0) {
      return { sign: d > 0 ? "up" : "down", text: `${d > 0 ? "▲" : "▼"}${text}` };
    }
  }
  // Kleiner als die feinste Anzeige → als unverändert führen, nicht als ▲0.000
  return { sign: "flat", text: "±0.000" };
}
