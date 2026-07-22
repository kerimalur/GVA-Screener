import "server-only";
import { fetchCandles, type Candle } from "@/lib/gva/api";
import type { PairIdea } from "./ranking";
import { candleKey } from "./candleKey";
import { sinceForPair } from "./signalStart";

/**
 * Lädt die Kerzen aller Kandidaten-Pairs für BEIDE Granularitäten (Daily/Weekly)
 * serverseitig vor, damit das Umschalten im Performance-Panel ohne Ladezeit läuft
 * und die Grün/Rot-Übersicht sofort steht. Kerze/Linie sind reine Zeichenmodi
 * derselben Daten — also nur D+W je Pair.
 *
 * Reuse von `/api/candles` (Render), das die warme Tageskerzen-Cache des Scanners
 * nutzt (W wird daraus resampled) → keine zusätzlichen OANDA-Calls. Jeder Fetch
 * ist einzeln abgesichert: fällt Render (Kaltstart) aus, fehlt nur der Eintrag,
 * das Panel lädt ihn dann clientseitig nach.
 */
export async function loadPerfCandles(
  pairs: PairIdea[],
  startByPair: Record<string, string>,
): Promise<Record<string, Candle[]>> {
  const jobs: Promise<[string, Candle[]] | null>[] = [];
  for (const p of pairs) {
    const symbol = p.pair.replace("/", "");
    const start = sinceForPair(startByPair[p.pair]) ?? "";
    if (!start) continue; // neues Signal ohne Verlauf → nichts vorzuladen
    for (const gran of ["D", "W"] as const) {
      jobs.push(
        fetchCandles(symbol, gran, start)
          .then((cs) => [candleKey(symbol, gran), cs] as [string, Candle[]])
          .catch(() => null),
      );
    }
  }
  const out: Record<string, Candle[]> = {};
  for (const r of await Promise.all(jobs)) if (r) out[r[0]] = r[1];
  return out;
}
