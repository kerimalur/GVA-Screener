/**
 * Zwei-Jahres-Staatsanleihenrenditen — die Zinserwartung des Marktes.
 *
 * Warum ausgerechnet 2 Jahre: Der Leitzins sagt, wo wir stehen. Die
 * 2-Jahres-Rendite sagt, wo der Markt die Notenbank in zwei Jahren erwartet —
 * und FX handelt die Erwartung, nicht den Bestand. Sie reagiert am selben Tag
 * auf eine Inflationszahl, der Leitzins erst Wochen später.
 *
 * Jede Währung hat ihren eigenen Adapter, weil es keine kostenlose Quelle
 * gibt, die alle acht sauber liefert. Bewusste Konsequenz: **jeder Adapter
 * darf einzeln ausfallen.** Fällt einer aus, sagt der Faktor für diese Währung
 * „keine Aussage" — er weicht nicht still auf eine andere Laufzeit oder eine
 * andere Währung aus. Eine 2-Jahres-Rendite gegen eine 10-jährige zu stellen
 * wäre eine Zahl, die nichts bedeutet.
 *
 * Alle Quellen sind amtlich, kostenlos und ohne Schlüssel. Stand der Prüfung
 * am 17.08.2026 steht als Kommentar an jedem Adapter.
 */

export interface YieldObservation {
  /** "YYYY-MM-DD" */
  date: string;
  /** Rendite in Prozent. */
  value: number;
}

/** Währungen, für die es hier überhaupt einen Adapter gibt. */
export const YIELD_2Y_CCYS = ["USD", "EUR", "JPY", "CAD", "AUD"] as const;

/** Serien-ID in `fred_series`. */
export const yield2yId = (ccy: string) => `Y2_${ccy}`;

const TIMEOUT_MS = 25_000;

/* ------------------------------------------------------------- Werkzeug */

async function holeText(url: string, kopf: Record<string, string> = {}): Promise<string | null> {
  const abbruch = new AbortController();
  const uhr = setTimeout(() => abbruch.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: abbruch.signal,
      // Manche Behördenseiten antworten Bots nur mit einer Fehlerseite.
      headers: { "User-Agent": "Mozilla/5.0 (compatible; gva-screener/1.0)", ...kopf },
    });
    if (!res.ok) {
      console.error(`[yields] ${url.split("?")[0]}: HTTP ${res.status}`);
      return null;
    }
    return await res.text();
  } catch (e) {
    console.error(`[yields] ${url.split("?")[0]}: ${e instanceof Error ? e.name : "Netzfehler"}`);
    return null;
  } finally {
    clearTimeout(uhr);
  }
}

/**
 * Eine CSV-Zeile in Felder zerlegen, Anführungszeichen respektiert.
 *
 * Nötig, weil die Kopfzeile des US-Schatzamts Felder wie `"1.5 Month"`
 * enthält — ein naives `split(",")` würde die Spalten verschieben und damit
 * die falsche Laufzeit einlesen.
 */
export function csvFelder(zeile: string): string[] {
  const felder: string[] = [];
  let akt = "";
  let inAnfuehrung = false;
  for (let i = 0; i < zeile.length; i++) {
    const c = zeile[i];
    if (c === '"') {
      if (inAnfuehrung && zeile[i + 1] === '"') { akt += '"'; i++; }
      else inAnfuehrung = !inAnfuehrung;
    } else if (c === "," && !inAnfuehrung) {
      felder.push(akt.trim());
      akt = "";
    } else akt += c;
  }
  felder.push(akt.trim());
  return felder;
}

const sortiere = (o: YieldObservation[]) =>
  o.sort((a, b) => a.date.localeCompare(b.date));

const zahl = (s: string | undefined): number | null => {
  if (s === undefined) return null;
  const v = parseFloat(s.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(v) ? v : null;
};

/* ------------------------------------------------------------- USD */

/**
 * US-Schatzamt, tägliche Zinsstrukturkurve als CSV je Kalenderjahr.
 * Geprüft 17.08.2026 — Stand 2026-08-14, also tagesaktuell.
 */
async function usd(abJahr: number): Promise<YieldObservation[] | null> {
  const alle: YieldObservation[] = [];
  const jetzt = new Date().getUTCFullYear();
  let einTreffer = false;

  for (let jahr = abJahr; jahr <= jetzt; jahr++) {
    const text = await holeText(
      "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/" +
        `daily-treasury-rates.csv/${jahr}/all?type=daily_treasury_yield_curve` +
        `&field_tdr_date_value=${jahr}&page&_format=csv`,
    );
    if (!text) continue;

    const zeilen = text.trim().split(/\r?\n/);
    if (zeilen.length < 2) continue;
    const kopf = csvFelder(zeilen[0]);
    const iDatum = kopf.indexOf("Date");
    const iZwei = kopf.indexOf("2 Yr");
    if (iDatum < 0 || iZwei < 0) continue;
    einTreffer = true;

    for (const z of zeilen.slice(1)) {
      const f = csvFelder(z);
      // MM/DD/YYYY → ISO
      const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(f[iDatum] ?? "");
      const wert = zahl(f[iZwei]);
      if (!m || wert === null) continue;
      alle.push({ date: `${m[3]}-${m[1]}-${m[2]}`, value: wert });
    }
  }
  return einTreffer ? sortiere(alle) : null;
}

/* ------------------------------------------------------------- EUR */

/**
 * EZB-Datenportal, Zinsstrukturkurve der AAA-Staatsanleihen des Euroraums,
 * Kassazins 2 Jahre. Keyless, SDMX, `csvdata` liefert eine flache Tabelle.
 * Vom Prüfrechner aus durch eine Bot-Sperre nicht erreichbar — vom Server
 * aus ist dies der dokumentierte Standardweg. Fällt er aus, meldet die
 * Datenlage-Seite das, statt dass irgendetwas anderes eingesetzt wird.
 */
async function eur(abDatum: string): Promise<YieldObservation[] | null> {
  const text = await holeText(
    "https://data-api.ecb.europa.eu/service/data/YC/" +
      "B.U2.EUR.4F.G_N_A.SV_C_YM.SR_2Y" +
      `?format=csvdata&startPeriod=${abDatum}`,
  );
  if (!text) return null;

  const zeilen = text.trim().split(/\r?\n/);
  if (zeilen.length < 2) return null;
  const kopf = csvFelder(zeilen[0]);
  const iZeit = kopf.indexOf("TIME_PERIOD");
  const iWert = kopf.indexOf("OBS_VALUE");
  if (iZeit < 0 || iWert < 0) return null;

  const out: YieldObservation[] = [];
  for (const z of zeilen.slice(1)) {
    const f = csvFelder(z);
    const datum = f[iZeit] ?? "";
    const wert = zahl(f[iWert]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datum) || wert === null) continue;
    out.push({ date: datum, value: wert });
  }
  return out.length > 0 ? sortiere(out) : null;
}

/* ------------------------------------------------------------- JPY */

/**
 * Finanzministerium Japan, JGB-Kurve als CSV.
 * Geprüft 17.08.2026 — Stand 2026-08-13.
 *
 * Achtung, bewusst in Kauf genommen: Die Datei deckt nur das laufende
 * japanische Geschäftsjahr ab (April bis März). Für die Ansicht „Jetzt" und
 * die letzten Monate reicht das; ein Rückblick auf einen Trade aus dem
 * Vorjahr bekommt für JPY „keine Aussage" statt einer erfundenen Zahl.
 */
async function jpy(): Promise<YieldObservation[] | null> {
  const text = await holeText(
    "https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/jgbcme.csv",
  );
  if (!text) return null;

  const zeilen = text.trim().split(/\r?\n/);
  if (zeilen.length < 2) return null;
  const kopf = csvFelder(zeilen[0]);
  const iDatum = 0; // erste Spalte heisst je nach Jahrgang "Date" oder ist leer
  const iZwei = kopf.findIndex((h) => h.replace(/\s/g, "").toUpperCase() === "2Y");
  if (iZwei < 0) return null;

  const out: YieldObservation[] = [];
  for (const z of zeilen.slice(1)) {
    const f = csvFelder(z);
    // YYYY/M/D → ISO
    const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(f[iDatum] ?? "");
    const wert = zahl(f[iZwei]);
    if (!m || wert === null) continue;
    const mm = m[2].padStart(2, "0");
    const dd = m[3].padStart(2, "0");
    out.push({ date: `${m[1]}-${mm}-${dd}`, value: wert });
  }
  return out.length > 0 ? sortiere(out) : null;
}

/* ------------------------------------------------------------- CAD */

/**
 * Bank of Canada, Valet-API, Benchmark-Rendite 2 Jahre.
 * Geprüft 17.08.2026 — Stand 2026-08-13.
 */
async function cad(abDatum: string): Promise<YieldObservation[] | null> {
  const reihe = "BD.CDN.2YR.DQ.YLD";
  const text = await holeText(
    `https://www.bankofcanada.ca/valet/observations/${reihe}/json?start_date=${abDatum}`,
  );
  if (!text) return null;

  let json: { observations?: Array<Record<string, unknown>> };
  try {
    json = JSON.parse(text) as typeof json;
  } catch {
    return null;
  }
  const out: YieldObservation[] = [];
  for (const o of json.observations ?? []) {
    const datum = typeof o.d === "string" ? o.d : "";
    const zelle = o[reihe] as { v?: string } | undefined;
    const wert = zahl(zelle?.v);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datum) || wert === null) continue;
    out.push({ date: datum, value: wert });
  }
  return out.length > 0 ? sortiere(out) : null;
}

/* ------------------------------------------------------------- AUD */

/**
 * Reserve Bank of Australia, Tabelle F2 (Capital Market Yields), Tagesdaten.
 * Die Datei hat mehrere Kopfzeilen; die Spalte wird über die Serien-ID
 * `FCMYGBAG2D` gefunden, nicht über eine Position — RBA schiebt Spalten
 * gelegentlich um. Vom Prüfrechner aus nicht lesbar (Bot-Sperre), deshalb
 * fail-soft wie alle anderen.
 */
async function aud(): Promise<YieldObservation[] | null> {
  const text = await holeText("https://www.rba.gov.au/statistics/tables/csv/f2-data.csv");
  if (!text) return null;

  const zeilen = text.trim().split(/\r?\n/);
  let iSpalte = -1;
  const out: YieldObservation[] = [];

  for (const z of zeilen) {
    const f = csvFelder(z);
    if (iSpalte < 0) {
      const treffer = f.findIndex((h) => h.toUpperCase() === "FCMYGBAG2D");
      if (treffer > 0) iSpalte = treffer;
      continue;
    }
    // Datenzeilen: erste Spalte ist ein Datum (DD-MMM-YYYY oder DD/MM/YYYY)
    const roh = f[0] ?? "";
    const wert = zahl(f[iSpalte]);
    if (wert === null) continue;
    const iso = alsIso(roh);
    if (!iso) continue;
    out.push({ date: iso, value: wert });
  }
  return iSpalte >= 0 && out.length > 0 ? sortiere(out) : null;
}

const MONATE: Record<string, string> = {
  JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
  JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
};

/** "13-Aug-2026" oder "13/08/2026" → "2026-08-13". Null, wenn kein Datum. */
export function alsIso(roh: string): string | null {
  const a = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(roh.trim());
  if (a) {
    const mm = MONATE[a[2].toUpperCase()];
    if (mm) return `${a[3]}-${mm}-${a[1].padStart(2, "0")}`;
  }
  const b = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(roh.trim());
  if (b) return `${b[3]}-${b[2].padStart(2, "0")}-${b[1].padStart(2, "0")}`;
  const c = /^(\d{4})-(\d{2})-(\d{2})$/.exec(roh.trim());
  if (c) return roh.trim();
  return null;
}

/* ------------------------------------------------------------- Verteiler */

/**
 * Alle Adapter, jeder für sich. `abDatum` ist der Anfang des rollierenden
 * Fensters ("YYYY-MM-DD").
 */
export async function fetch2yYield(
  ccy: string, abDatum: string,
): Promise<YieldObservation[] | null> {
  switch (ccy) {
    case "USD": return usd(Number(abDatum.slice(0, 4)));
    case "EUR": return eur(abDatum);
    case "JPY": return jpy();
    case "CAD": return cad(abDatum);
    case "AUD": return aud();
    default: return null;
  }
}
