export interface BisObservation {
  /** 'YYYY-MM-01' bei Monatsserien, 'YYYY-MM-DD' bei Tagesserien. */
  date: string;
  value: number;
}

/**
 * BIS-Periode → ISO-Datum. 'YYYY-MM' wird auf den Monatsersten gelegt,
 * 'YYYY-MM-DD' bleibt wie es ist. Null bei allem anderen (Quartale, Jahre) —
 * die werden hier nicht gebraucht und sollen nicht still falsch landen.
 */
export function bisPeriodeAlsDatum(periode: string | undefined): string | null {
  if (!periode) return null;
  if (/^\d{4}-\d{2}$/.test(periode)) return `${periode}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(periode)) return periode;
  return null;
}

/**
 * BIS SDMX-API (stats.bis.org, keyless) — Ersatzquelle für die auf FRED
 * eingestellten OECD-Serien (CPI) und als FRED-unabhängige Leitzins-Quelle.
 * `detail=dataonly` liefert schlankes CSV ohne Freitext-Attribute:
 *   FREQ,REF_AREA,(UNIT_MEASURE,)TIME_PERIOD,OBS_VALUE
 * Rückgabe: Map REF_AREA → chronologische Beobachtungen; null bei Fehler
 * (Aufrufer markiert is_stale, wie bei FRED).
 */
export async function fetchBisFlow(
  flow: string, // z.B. 'WS_LONG_CPI' | 'WS_CBPOL'
  key: string, // z.B. 'M.US+XM+GB.771' | 'M.US+XM+GB'
  startPeriod: string, // 'YYYY-MM' (Monatsserie) oder 'YYYY-MM-DD' (Tagesserie)
  timeoutMs = 30000,
): Promise<Map<string, BisObservation[]> | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(
      `https://stats.bis.org/api/v2/data/dataflow/BIS/${flow}/1.0/${encodeURIComponent(key)}` +
        `?format=csv&detail=dataonly&startPeriod=${startPeriod}`,
      { cache: "no-store", signal: controller.signal },
    );
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) return null;

  const lines = (await res.text()).trim().split("\n");
  if (lines.length < 2) return null;
  const header = lines[0].split(",").map((h) => h.trim());
  const iArea = header.indexOf("REF_AREA");
  const iPeriod = header.indexOf("TIME_PERIOD");
  const iValue = header.indexOf("OBS_VALUE");
  if (iArea < 0 || iPeriod < 0 || iValue < 0) return null;

  const out = new Map<string, BisObservation[]>();
  for (const line of lines.slice(1)) {
    const cols = line.split(",");
    const area = cols[iArea]?.trim();
    const period = cols[iPeriod]?.trim();
    const value = parseFloat(cols[iValue] ?? "");
    // Monats- ODER Tagesperiode; 'NaN'-Werte (BIS-Datenlücken) überspringen
    const datum = bisPeriodeAlsDatum(period);
    if (!area || !datum || !Number.isFinite(value)) continue;
    const arr = out.get(area) ?? [];
    arr.push({ date: datum, value });
    out.set(area, arr);
  }
  if (out.size === 0) return null;
  for (const arr of out.values()) arr.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}
