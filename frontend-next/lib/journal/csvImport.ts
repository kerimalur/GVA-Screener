/**
 * CSV-Import von Broker-Exporten (MT4/MT5/Vantage) — reine Parsing-/Dedup-Logik
 * ohne I/O, Muster wie lib/journal/budget.ts. Kontrollwerte in
 * scripts/csv-import-check.mts.
 *
 * Bewusst KEINE Schema-Änderung: die Duplikat-Erkennung läuft über einen
 * zusammengesetzten Schlüssel aus vorhandenen Feldern (Pair · Datum · Richtung ·
 * Entry · Profit). Damit dedupliziert der Import gegen ALLE bestehenden Trades
 * — auch von Hand erfasste — ohne eine Broker-Ticket-Spalte einzuführen.
 *
 * Session wird aus der Eintritts-Uhrzeit abgeleitet (siehe sessionFromHour):
 * eine Heuristik über die Zeitstempel-Stunde (Broker-Serverzeit). Sie speist die
 * Zeit-Muster-Analyse; der User kann einen Trade später korrigieren.
 */

export interface ParsedTrade {
  pair: string;
  direction: "long" | "short";
  /** Schlussdatum "YYYY-MM-DD". */
  date: string;
  result: "win" | "loss" | "breakeven";
  rMultiple: number;
  profitAmount?: number;
  entryPrice?: number;
  exitPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  lotSize?: number;
  /** "london" | "newyork" | "asia" | "" — aus der Eintritts-Uhrzeit. */
  session: string;
}

// ---------------------------------------------------------------------------
// Zahlen / Datum / Zeit
// ---------------------------------------------------------------------------

/** Tolerantes Zahlen-Parsing: Währungssymbole, Tausender, Komma-Dezimal. */
export function num(raw: string | undefined): number | undefined {
  if (raw == null) return undefined;
  let s = raw.trim().replace(/["']/g, "");
  if (!s) return undefined;
  s = s.replace(/[^0-9.,\-]/g, ""); // Symbole/Leerzeichen raus
  if (!s || s === "-" || s === "." || s === ",") return undefined;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) {
    // Komma ist Dezimaltrenner (europäisch): Punkte sind Tausender.
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    // Punkt ist Dezimaltrenner: Kommas sind Tausender.
    s = s.replace(/,/g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/** "2026.07.15 14:30:00" / "2026-07-15" / "15.07.2026" → "YYYY-MM-DD" | "". */
export function parseDate(raw: string | undefined): string {
  if (!raw) return "";
  const yFirst = raw.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (yFirst) return `${yFirst[1]}-${yFirst[2].padStart(2, "0")}-${yFirst[3].padStart(2, "0")}`;
  const dFirst = raw.match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/);
  if (dFirst) return `${dFirst[3]}-${dFirst[2].padStart(2, "0")}-${dFirst[1].padStart(2, "0")}`;
  return "";
}

/** Stunde (0–23) aus einem Zeitstempel, sonst null. */
export function parseHour(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = raw.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  return h >= 0 && h <= 23 ? h : null;
}

/** Session aus der Eintritts-Stunde (Broker-Serverzeit, Heuristik). */
export function sessionFromHour(hour: number | null): string {
  if (hour == null) return "";
  if (hour >= 0 && hour < 7) return "asia";
  if (hour >= 7 && hour < 13) return "london";
  if (hour >= 13 && hour < 22) return "newyork";
  return "asia"; // 22–24 Uhr: Übergang, Asien öffnet
}

// ---------------------------------------------------------------------------
// CSV-Tokenizer
// ---------------------------------------------------------------------------

function detectDelimiter(line: string): string {
  const cand: [string, number][] = [",", ";", "\t"].map((d) => [d, line.split(d).length]);
  cand.sort((a, b) => b[1] - a[1]);
  return cand[0][1] > 1 ? cand[0][0] : ",";
}

function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

// ---------------------------------------------------------------------------
// Header-Klassifizierung
// ---------------------------------------------------------------------------

type Field =
  | "symbol" | "type" | "openTime" | "closeTime" | "openPrice" | "closePrice"
  | "sl" | "tp" | "profit" | "lots" | "ticket";

export function classifyHeader(cell: string): Field | null {
  const c = cell.toLowerCase().replace(/\s+/g, " ").trim();
  if (!c) return null;
  const has = (s: string) => c.includes(s);
  if (has("close") && has("time")) return "closeTime";
  if (has("close") && has("price")) return "closePrice";
  if (has("open") && has("time")) return "openTime";
  if (has("open") && has("price")) return "openPrice";
  if (c === "symbol" || c === "pair" || has("instrument") || has("ticker") || has("symbol")) return "symbol";
  if (c === "type" || c === "side" || c === "cmd" || has("action") || has("direction")) return "type";
  if (c === "s/l" || c === "s / l" || c === "sl" || has("stop")) return "sl";
  if (c === "t/p" || c === "t / p" || c === "tp" || has("take")) return "tp";
  if (has("profit") || c === "p/l" || has("p / l") || has("pnl") || has("net")) return "profit";
  if (has("lot") || has("volume") || has("size") || has("qty") || has("quantit")) return "lots";
  if (has("ticket") || has("order") || has("deal") || has("position") || c === "id" || c === "#") return "ticket";
  if (has("time")) return "openTime";
  if (has("price")) return "openPrice";
  return null;
}

function normalizePair(raw: string): string {
  return raw.trim().toUpperCase().replace(/\.(RAW|PRO|ECN|MICRO|STD)$/i, "").replace(/[^A-Z0-9]/g, "");
}

function directionOf(raw: string): "long" | "short" | null {
  const c = raw.toLowerCase();
  if (c.includes("buy") || c.includes("long") || c.trim() === "0") return "long";
  if (c.includes("sell") || c.includes("short") || c.trim() === "1") return "short";
  return null;
}

function rMultipleFrom(
  direction: "long" | "short",
  entry?: number,
  sl?: number,
  exit?: number,
): number {
  if (entry == null || sl == null || exit == null) return 0;
  const risk = Math.abs(entry - sl);
  if (risk === 0) return 0;
  const move = direction === "long" ? exit - entry : entry - exit;
  return Math.round((move / risk) * 100) / 100;
}

function resultFrom(profit: number | undefined): "win" | "loss" | "breakeven" {
  if (profit == null || profit === 0) return "breakeven";
  return profit > 0 ? "win" : "loss";
}

/**
 * Parst einen Broker-CSV-Text in Trades. Vorspann-Zeilen vor dem Header werden
 * übersprungen; Summenzeilen ohne erkennbares Pair/Richtung fallen raus.
 */
export function parseTradesCsv(text: string): ParsedTrade[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];

  // Header = erste Zeile, die Symbol UND (Typ oder Profit) klassifiziert.
  let headerIdx = -1;
  let delim = ",";
  let cols: (Field | null)[] = [];
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const d = detectDelimiter(lines[i]);
    const classified = splitLine(lines[i], d).map(classifyHeader);
    const hasSymbol = classified.includes("symbol");
    const hasTypeOrProfit = classified.includes("type") || classified.includes("profit");
    if (hasSymbol && hasTypeOrProfit) {
      headerIdx = i; delim = d; cols = classified;
      break;
    }
  }
  if (headerIdx === -1) return [];

  const idx = (f: Field) => cols.indexOf(f);
  const iSymbol = idx("symbol"), iType = idx("type");
  const iOpenT = idx("openTime"), iCloseT = idx("closeTime");
  const iOpenP = idx("openPrice"), iCloseP = idx("closePrice");
  const iSl = idx("sl"), iTp = idx("tp"), iProfit = idx("profit"), iLots = idx("lots");

  const at = (row: string[], i: number) => (i >= 0 && i < row.length ? row[i] : undefined);
  const out: ParsedTrade[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const row = splitLine(lines[i], delim);
    const pair = normalizePair(at(row, iSymbol) ?? "");
    const direction = directionOf(at(row, iType) ?? "");
    if (!pair || !direction) continue; // Summen-/Leerzeile

    const closeT = at(row, iCloseT) ?? at(row, iOpenT);
    const date = parseDate(closeT);
    if (!date) continue;

    const entry = num(at(row, iOpenP));
    const exit = num(at(row, iCloseP));
    const sl = num(at(row, iSl));
    const tp = num(at(row, iTp));
    const profit = num(at(row, iProfit));

    out.push({
      pair,
      direction,
      date,
      result: resultFrom(profit),
      rMultiple: rMultipleFrom(direction, entry, sl, exit),
      profitAmount: profit,
      entryPrice: entry,
      exitPrice: exit,
      stopLoss: sl,
      takeProfit: tp,
      lotSize: num(at(row, iLots)),
      session: sessionFromHour(parseHour(at(row, iOpenT) ?? closeT)),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Duplikat-Erkennung
// ---------------------------------------------------------------------------

interface DedupeFields {
  pair: string;
  date: string;
  direction: "long" | "short";
  entryPrice?: number;
  profitAmount?: number;
}

/** Zusammengesetzter Schlüssel gegen bestehende Trades — ohne Schema-Änderung. */
export function dedupeKey(t: DedupeFields): string {
  const e = t.entryPrice != null ? t.entryPrice.toFixed(5) : "";
  const p = t.profitAmount != null ? t.profitAmount.toFixed(2) : "";
  return `${t.pair}|${t.date}|${t.direction}|${e}|${p}`;
}

export interface MarkedTrade {
  trade: ParsedTrade;
  duplicate: boolean;
}

/**
 * Markiert Duplikate: gegen bestehende Trades UND innerhalb des Imports (zwei
 * gleiche Zeilen → die zweite ist Duplikat). Reihenfolge bleibt erhalten.
 */
export function markDuplicates(parsed: ParsedTrade[], existing: DedupeFields[]): MarkedTrade[] {
  const seen = new Set(existing.map(dedupeKey));
  return parsed.map((trade) => {
    const key = dedupeKey(trade);
    const duplicate = seen.has(key);
    if (!duplicate) seen.add(key);
    return { trade, duplicate };
  });
}
