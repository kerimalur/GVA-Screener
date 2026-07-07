
export interface OutlookSymbol {
  name: string; // 'EURUSD'
  longPercentage: number;
  shortPercentage: number;
  longVolume: number;
  shortVolume: number;
  longPositions: number;
  shortPositions: number;
}

const BASE = "https://www.myfxbook.com/api";
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) fx-terminal" };

/**
 * Community Outlook: Login -> Outlook -> Logout.
 * Liefert null bei jedem Fehler (Graceful Degradation — Myfxbook blockt
 * gelegentlich Non-Browser-Clients; Aufrufer loggt 'skipped').
 */
export async function fetchOutlook(): Promise<OutlookSymbol[] | null> {
  const email = process.env.MYFXBOOK_EMAIL;
  const password = process.env.MYFXBOOK_PASSWORD;
  if (!email || !password) return null;

  let session: string | null = null;
  try {
    const loginRes = await fetch(
      `${BASE}/login.json?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`,
      { cache: "no-store", headers: UA },
    );
    if (!loginRes.ok) return null;
    const login = (await loginRes.json()) as { error: boolean; session?: string };
    if (login.error || !login.session) return null;
    session = login.session;

    // Myfxbook liefert die Session bereits URL-encoded — nicht nochmal encoden.
    const outlookRes = await fetch(
      `${BASE}/get-community-outlook.json?session=${session}`,
      { cache: "no-store", headers: UA },
    );
    if (!outlookRes.ok) return null;
    const outlook = (await outlookRes.json()) as {
      error: boolean;
      symbols?: Array<Record<string, unknown>>;
    };
    if (outlook.error || !Array.isArray(outlook.symbols)) return null;

    return outlook.symbols
      .map((s) => ({
        name: String(s.name ?? ""),
        longPercentage: Number(s.longPercentage ?? NaN),
        shortPercentage: Number(s.shortPercentage ?? NaN),
        longVolume: Number(s.longVolume ?? 0),
        shortVolume: Number(s.shortVolume ?? 0),
        longPositions: Number(s.longPositions ?? 0),
        shortPositions: Number(s.shortPositions ?? 0),
      }))
      .filter((s) => s.name && Number.isFinite(s.longPercentage));
  } catch {
    return null;
  } finally {
    if (session) {
      // Best effort — Session-Limit bei Myfxbook nicht ausschöpfen
      fetch(`${BASE}/logout.json?session=${session}`, {
        cache: "no-store",
        headers: UA,
      }).catch(() => {});
    }
  }
}
