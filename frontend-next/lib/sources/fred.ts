export interface FredObservation {
  date: string; // 'YYYY-MM-DD'
  value: number;
}

const API_URL = "https://api.stlouisfed.org/fred/series/observations";

/**
 * Offizielle FRED-API (series/observations, JSON) — ersetzt den
 * fredgraph.csv-Transport (seit ~2026-07 blockiert, Timeouts).
 * Key ausschliesslich aus Env FRED_API_KEY — niemals hardcoden, niemals
 * die Request-URL loggen (enthält den Key).
 *
 * Verhalten wie zuvor: immer Vollhistorie (aufsteigend), '.'-Werte werden
 * übersprungen, null bei fehlendem Key / toter Serie / API-Fehler —
 * der Aufrufer markiert is_stale, der nächste Cron-Lauf heilt selbst.
 * Rate-Limit der API: 120 Requests/min pro Key; ein Katalog-Lauf
 * (~80 Serien parallel) bleibt darunter. Bei 429/5xx/Netzfehler 1 Retry.
 */
export async function fetchSeries(
  seriesId: string,
  timeoutMs = 15000,
): Promise<FredObservation[] | null> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    console.error(`[fred] ${seriesId}: FRED_API_KEY fehlt in der Env — Serie übersprungen`);
    return null;
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));
    const result = await fetchOnce(seriesId, apiKey, timeoutMs);
    if (result.ok) return result.observations;
    if (!result.retryable) return null;
  }
  return null;
}

type FetchResult =
  | { ok: true; observations: FredObservation[] | null }
  | { ok: false; retryable: boolean };

async function fetchOnce(seriesId: string, apiKey: string, timeoutMs: number): Promise<FetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    const params = new URLSearchParams({
      series_id: seriesId,
      api_key: apiKey,
      file_type: "json",
      limit: "100000",
    });
    res = await fetch(`${API_URL}?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (e) {
    console.error(`[fred] ${seriesId}: Netzwerk/Timeout (${e instanceof Error ? e.name : "unbekannt"})`);
    return { ok: false, retryable: true };
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let msg = "";
    try {
      const body = (await res.json()) as { error_message?: string };
      msg = String(body?.error_message ?? "").slice(0, 120);
    } catch {
      // Body nicht lesbar — Status reicht fürs Log
    }
    console.error(`[fred] ${seriesId}: HTTP ${res.status} ${msg}`.trim());
    // 400 = unbekannte/eingestellte Serie oder Key-Problem -> kein Retry
    return { ok: false, retryable: res.status === 429 || res.status >= 500 };
  }

  let json: { observations?: Array<{ date?: string; value?: string }> };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    console.error(`[fred] ${seriesId}: Antwort kein gültiges JSON`);
    return { ok: false, retryable: false };
  }
  if (!Array.isArray(json.observations)) {
    console.error(`[fred] ${seriesId}: Antwort ohne observations-Array`);
    return { ok: true, observations: null };
  }

  const out: FredObservation[] = [];
  for (const o of json.observations) {
    if (!o?.date || !/^\d{4}-\d{2}-\d{2}$/.test(o.date)) continue;
    if (o.value === "." || o.value === "" || o.value == null) continue;
    const value = parseFloat(o.value);
    if (!Number.isFinite(value)) continue;
    out.push({ date: o.date, value });
  }
  return { ok: true, observations: out.length > 0 ? out : null };
}
