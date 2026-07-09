export interface FredObservation {
  date: string; // 'YYYY-MM-DD'
  value: number;
}

/**
 * FRED-CSV (keyless, immer Vollhistorie). '.'-Werte werden uebersprungen.
 * Liefert null bei unbekannter/eingestellter Serie (Aufrufer markiert is_stale).
 */
export async function fetchSeries(seriesId: string, timeoutMs = 8000): Promise<FredObservation[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(
      `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(seriesId)}`,
      { cache: "no-store", signal: controller.signal, headers: { "User-Agent": "Mozilla/5.0 (fx-terminal)" } },
    );
  } catch {
    return null; // timeout or network error -> treat as stale
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) return null;

  const text = await res.text();
  const lines = text.trim().split("\n");
  if (lines.length < 2 || !lines[0].toLowerCase().includes("date")) return null;

  const out: FredObservation[] = [];
  for (const line of lines.slice(1)) {
    const comma = line.indexOf(",");
    if (comma < 0) continue;
    const date = line.slice(0, comma).trim();
    const raw = line.slice(comma + 1).trim();
    if (raw === "." || raw === "") continue;
    const value = parseFloat(raw);
    if (!Number.isFinite(value) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    out.push({ date, value });
  }
  return out.length > 0 ? out : null;
}
