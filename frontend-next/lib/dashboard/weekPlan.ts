import "server-only";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { tryQuery } from "@/lib/data/util";
import { loadRankingData, type RankingRow } from "@/lib/ml/ranking";
import { loadTerminalData } from "@/lib/data/terminal";
import { FX_INSTRUMENTS } from "@/lib/constants/instruments";
import type { CurrencyScore, BiasDirection } from "@/lib/calc/currencyScore";
import type { CalendarEventRow } from "@/lib/supabase/types";

/**
 * "Diese Woche" — verdichtet das Q5/Q1-Ranking mit der unabhängigen
 * Kontrolle des Macro Terminals (computeCurrencyScore) und dem
 * Wirtschaftskalender zu einer Zeile pro Trade-Kandidat.
 *
 * Die Live-GVA-Nähe (HIT/PREPARE) kommt NICHT von hier — die holt das
 * Client-Widget direkt vom FastAPI-Backend (/api/screener), da sie
 * sekündlich lebt. Dieser Loader liefert die stabile Wochen-Basis.
 */

export type ControlStatus = "confirmed" | "divergent" | "neutral";

export interface WeekPlanControl {
  status: ControlStatus;
  /** Kurzbegründung, v.a. bei Divergenz: welche Währung + welcher Sub-Faktor kippt */
  detail: string;
}

export interface WeekPlanEvent {
  ccy: string;
  title: string;
  when: string; // ISO
}

export interface WeekPlanPair {
  pair: string; // Anzeige "AUD/USD" — matcht MarketData.pair
  direction: "long" | "short";
  base: string;
  quote: string;
  /** "AUD Q5 (+0.42)" */
  baseLabel: string;
  /** "USD Q1 (−0.31)" */
  quoteLabel: string;
  control: WeekPlanControl;
  events: WeekPlanEvent[];
}

export interface WeekPlanData {
  weekStart: string | null;
  pairs: WeekPlanPair[];
}

const opposite = (d: Exclude<BiasDirection, "NEUTRAL">): Exclude<BiasDirection, "NEUTRAL"> =>
  d === "LONG" ? "SHORT" : "LONG";

/**
 * Reine Kontroll-Funktion: vergleicht die Ranking-Erwartung (Q5 = stark,
 * Q1 = schwach) je Währung gegen die `direction` des Macro-Terminal-Scores.
 * Kein I/O, damit isoliert prüfbar.
 *
 * - confirmed: Macro bestätigt BEIDE Seiten
 * - divergent: Macro widerspricht mindestens einer Seite → Sub-Faktor-Drilldown
 * - neutral:   kein Widerspruch, aber Macro hat kein klares Zweitvotum
 */
export function evaluateControl(
  direction: "long" | "short",
  base: string,
  quote: string,
  macro: Record<string, CurrencyScore | undefined>,
): WeekPlanControl {
  // Erwartete Richtung je Währung aus dem Pair-Signal
  const baseExp: Exclude<BiasDirection, "NEUTRAL"> = direction === "long" ? "LONG" : "SHORT";
  const quoteExp = opposite(baseExp);

  const sides: Array<{ ccy: string; exp: Exclude<BiasDirection, "NEUTRAL"> }> = [
    { ccy: base, exp: baseExp },
    { ccy: quote, exp: quoteExp },
  ];

  const contradictions: string[] = [];
  let agreements = 0;

  for (const { ccy, exp } of sides) {
    const sc = macro[ccy];
    if (!sc || sc.direction === "NEUTRAL") continue; // kein Zweitvotum
    if (sc.direction === exp) {
      agreements += 1;
      continue;
    }
    // Widerspruch → stärksten gegenläufigen Sub-Faktor benennen
    const opp = exp === "LONG" ? -1 : 1;
    const opposing = sc.subs
      .filter((s) => s.dir === opp && s.score !== null)
      .sort((a, b) => Math.abs(b.score ?? 0) - Math.abs(a.score ?? 0))[0];
    contradictions.push(opposing ? `${ccy}: ${opposing.label} gegenläufig` : `${ccy} gegenläufig`);
  }

  if (contradictions.length > 0) {
    return { status: "divergent", detail: contradictions.join(" · ") };
  }
  if (agreements === 2) {
    return { status: "confirmed", detail: "Macro bestätigt beide Seiten" };
  }
  return { status: "neutral", detail: "Macro ohne klares Zweitvotum" };
}

function quintileTag(row: RankingRow | undefined): string {
  if (!row) return "?";
  const q = row.confidence_quintile;
  const sign = row.score > 0 ? "+" : row.score < 0 ? "−" : "";
  const val = Math.abs(row.score).toFixed(2);
  return `Q${q} (${sign}${val})`;
}

async function loadEvents(): Promise<CalendarEventRow[]> {
  return (
    (await tryQuery(async () => {
      const db = createServiceClient();
      const from = new Date();
      from.setHours(0, 0, 0, 0);
      const to = new Date(from.getTime() + 8 * 86_400_000);
      const { data } = await db
        .from("calendar_events")
        .select("*")
        .eq("impact", "High")
        .gte("event_time", from.toISOString())
        .lte("event_time", to.toISOString())
        .order("event_time", { ascending: true });
      return (data ?? []) as CalendarEventRow[];
    })) ?? []
  );
}

// Macro-Terminal-Daten teilen sich den Cache-Eintrag mit Terminal/Vergleich.
const getTerminal = unstable_cache(
  () => tryQuery(() => loadTerminalData(createServiceClient())),
  ["terminal-data-v1"],
  { revalidate: 300 },
);

export async function loadWeekPlan(): Promise<WeekPlanData> {
  const [ranking, terminal, events] = await Promise.all([
    loadRankingData(),
    getTerminal(),
    loadEvents(),
  ]);

  const scoreByCcy: Record<string, RankingRow> = {};
  for (const r of ranking.champion) scoreByCcy[r.ccy] = r;

  const macro: Record<string, CurrencyScore> = {};
  for (const c of terminal?.currencies ?? []) macro[c.ccy] = c.score;

  const eventsByCcy: Record<string, WeekPlanEvent[]> = {};
  for (const e of events) {
    if (!e.currency) continue;
    (eventsByCcy[e.currency] ??= []).push({
      ccy: e.currency,
      title: e.title,
      when: e.event_time,
    });
  }

  const instrByDisplay = new Map(FX_INSTRUMENTS.map((i) => [i.displayName, i]));

  const pairs: WeekPlanPair[] = ranking.pairIdeas.best.map((idea) => {
    const inst = instrByDisplay.get(idea.pair);
    const base = inst?.baseCcy ?? "";
    const quote = inst?.quoteCcy ?? "";
    return {
      pair: idea.pair,
      direction: idea.direction,
      base,
      quote,
      baseLabel: `${base} ${quintileTag(scoreByCcy[base])}`,
      quoteLabel: `${quote} ${quintileTag(scoreByCcy[quote])}`,
      control: evaluateControl(idea.direction, base, quote, macro),
      events: [...(eventsByCcy[base] ?? []), ...(eventsByCcy[quote] ?? [])],
    };
  });

  return { weekStart: ranking.weekStart, pairs };
}
