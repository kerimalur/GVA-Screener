import "server-only";
import { fetchCandlesBatch, type Candle } from "@/lib/gva/api";
import type { PairIdea } from "./ranking";
import { candleKey } from "./candleKey";
import { sinceForPair } from "./signalStart";

/**
 * Lädt die Kerzen aller Kandidaten-Pairs für BEIDE Granularitäten (Daily/Weekly)
 * serverseitig vor, damit das Umschalten im Performance-Panel ohne Ladezeit läuft
 * und die Grün/Rot-Übersicht sofort steht. Kerze/Linie sind reine Zeichenmodi
 * derselben Daten — also nur D+W je Pair.
 *
 * EIN Request (`/api/candles/batch`) statt 2 pro Pair: bei ~20 Kandidaten waren
 * das ~40 parallele Aufrufe auf Render, jeder mit eigenem OANDA-Fetch über die
 * volle Historie — das Panel lud minutenlang. Das Backend arbeitet die Liste
 * sequenziell ab, nutzt seine Tageskerzen-Cache und holt nur den von `since`
 * gebrauchten Ausschnitt. Fällt der Request aus (Render-Kaltstart, Timeout),
 * kommt eine leere Map zurück und das Panel lädt das aktive Pair clientseitig.
 */
export async function loadPerfCandles(
  pairs: PairIdea[],
  startByPair: Record<string, string>,
): Promise<Record<string, Candle[]>> {
  const items: { symbol: string; since: string }[] = [];
  for (const p of pairs) {
    const symbol = p.pair.replace("/", "");
    const since = sinceForPair(startByPair[p.pair]) ?? "";
    if (!since) continue; // neues Signal ohne Verlauf → nichts vorzuladen
    if (items.some((i) => i.symbol === symbol)) continue;
    items.push({ symbol, since });
  }
  if (items.length === 0) return {};

  let batch: Record<string, { D: Candle[]; W: Candle[] }>;
  try {
    batch = await fetchCandlesBatch(items);
  } catch {
    return {};
  }

  const out: Record<string, Candle[]> = {};
  for (const { symbol } of items) {
    const entry = batch[symbol];
    if (!entry) continue;
    out[candleKey(symbol, "D")] = entry.D;
    out[candleKey(symbol, "W")] = entry.W;
  }
  return out;
}
