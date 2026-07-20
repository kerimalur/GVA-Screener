import type { SupabaseClient } from "@supabase/supabase-js";
import { loadDashboardData, getFredBatch } from "./dashboard";
import { getSeasonalityStats } from "./seasonality";
import { getCotSeriesBatch, getTffSeriesBatch } from "./cot";
import { computeCotFlow, latestFlow, flowLabel, type CotFlowSummary } from "@/lib/calc/cotDelta";
import type { ScreenerVerdict } from "@/lib/calc/screenerReasoning";
import type { RiskGaugeResult } from "@/lib/calc/riskGauge";
import { sortCards } from "@/lib/weekly/sort";
import { FX_INSTRUMENTS, fromOanda } from "@/lib/constants/instruments";
import { BANK_BY_CCY } from "@/lib/constants/banks";
import type { CalendarEventRow, CbMeetingRow } from "@/lib/supabase/types";

const BTC_CFTC_CODE = "133741";

/** High-Impact-Events, die Post-Event-Drift erzeugen (CPI/NFP/Zinsentscheide). */
const DRIFT_EVENT_RE =
  /(CPI|Consumer Price|Inflation Rate|Nonfarm|Non-Farm|Payroll|Rate Decision|Interest Rate|FOMC|Monetary Policy|Cash Rate|Bank Rate)/i;

export interface WeeklyEvent {
  title: string;
  currency: string | null;
  eventTime: string;
  impact: string | null;
  actual: string | null;
  forecast: string | null;
  /** true = Drift-relevant (CPI/NFP/Zinsentscheid) */
  drift: boolean;
}

export interface WeeklyMeeting {
  bank: string;
  ccy: string;
  meetingDate: string;
  expectedChangeBps: number | null;
}

export interface WeeklyPairCard {
  instrument: string;
  displayName: string;
  base: string;
  quote: string;
  verdict: ScreenerVerdict;
  baseFlow: CotFlowSummary | null;
  quoteFlow: CotFlowSummary | null;
  basePercentile: number | null;
  quotePercentile: number | null;
  /** Saisonalität aktueller Monat */
  season: { avgReturn: number; hitRate: number; years: number } | null;
  sentimentLongPct: number | null;
  /** Δ Retail-Long-% ggü. ~1 Woche zuvor (pp) */
  sentimentDeltaPp: number | null;
  /** High-Impact-Events der kommenden 7 Tage für base/quote */
  events: WeeklyEvent[];
  /** Zentralbank-Sitzungen der kommenden 14 Tage für base/quote */
  meetings: WeeklyMeeting[];
  /** Währungen des Pairs, die durch ein Drift-Event der letzten 7 Tage "in Play" sind */
  inPlay: string[];
  /** Vorformulierter Fundamental-Text (Wizard-Autofill) */
  fundamentalText: string;
  /** Wochen in Folge, die dieses Signal (gleiche Richtung) schon besteht (aus Snapshots) */
  signalWeeks: number | null;
  /** Montag (ISO), seit dem das aktuelle Signal ununterbrochen besteht */
  signalSince: string | null;
}

export interface WeeklyBtcCard {
  flow: CotFlowSummary | null;
  levNet: number | null;
  levPercentile: number | null;
  reportDate: string | null;
  realYieldNow: number | null;
  /** Δ US-10Y-Realrendite über ~3 Monate (pp) */
  realYieldChg3m: number | null;
  breakevenNow: number | null;
  risk: RiskGaugeResult;
  bias: "LONG" | "SHORT" | null;
  reasons: Array<{ dir: -1 | 0 | 1; text: string }>;
  events: WeeklyEvent[];
  fundamentalText: string;
}

export interface WeeklyData {
  cards: WeeklyPairCard[];
  btc: WeeklyBtcCard;
  /** true = Flow-Kennzahlen basieren auf TFF (Leveraged Funds), sonst Legacy */
  usingTff: boolean;
  latestCotDate: string | null;
}

function toWeeklyEvent(r: Pick<CalendarEventRow, "title" | "currency" | "event_time" | "impact" | "actual" | "forecast">): WeeklyEvent {
  return {
    title: r.title,
    currency: r.currency,
    eventTime: r.event_time,
    impact: r.impact,
    actual: r.actual,
    forecast: r.forecast,
    drift: DRIFT_EVENT_RE.test(r.title),
  };
}

function fmtSigned(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return "–";
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}`;
}

/** Fundamental-Text einer Pair-Karte (Karte + Outlook-Wizard-Autofill).
 *
 * BEWUSST OHNE URTEIL: kein „Screener: LONG (x/y Faktoren)" mehr. Der aggregierte
 * 5-Faktor-Verdict ist out-of-sample widerlegt (siehe lib/weekly/sort.ts) — die
 * Einzel-Faktoren bleiben als FAKTEN, aber ohne gerichtete Gesamtaussage. */
function buildFundamentalText(
  card: Omit<WeeklyPairCard, "fundamentalText" | "signalWeeks" | "signalSince">,
  usingTff: boolean,
): string {
  const lines: string[] = [];
  const v = card.verdict;
  lines.push(`Faktenlage ${card.displayName} (${v.factors.length} Faktoren, kein aggregiertes Urteil):`);
  for (const f of v.factors) {
    const arrow = f.dir === 1 ? "▲" : f.dir === -1 ? "▼" : "•";
    lines.push(`${arrow} ${f.name}: ${f.text}`);
  }
  const src = usingTff ? "Leveraged Funds (TFF)" : "Non-Commercials (Legacy)";
  if (card.baseFlow || card.quoteFlow) {
    lines.push(
      `• COT-Δ 1W (${src}, % OI): ${card.base} ${fmtSigned(card.baseFlow?.delta1wPctOi)} (${flowLabel(card.baseFlow?.deltaPercentile ?? null)}), ${card.quote} ${fmtSigned(card.quoteFlow?.delta1wPctOi)} (${flowLabel(card.quoteFlow?.deltaPercentile ?? null)}).`,
    );
  }
  if (card.inPlay.length > 0) {
    lines.push(`• In Play (Post-Event-Drift): ${card.inPlay.join(", ")} — Drift-Event in den letzten 7 Tagen.`);
  }
  const driftAhead = card.events.filter((e) => e.drift);
  if (driftAhead.length > 0) {
    lines.push(
      `• Event-Risiko diese Woche: ${driftAhead
        .map((e) => `${e.currency ?? "?"} ${e.title} (${new Date(e.eventTime).toLocaleDateString("de-DE")})`)
        .join("; ")}.`,
    );
  }
  for (const m of card.meetings) {
    lines.push(
      `• ${m.bank}-Sitzung am ${new Date(m.meetingDate).toLocaleDateString("de-DE")}${
        m.expectedChangeBps !== null && m.expectedChangeBps !== 0
          ? ` (erwartet: ${m.expectedChangeBps > 0 ? "+" : ""}${m.expectedChangeBps} bps)`
          : ""
      }.`,
    );
  }
  return lines.join("\n");
}

export async function loadWeeklyData(db: SupabaseClient): Promise<WeeklyData> {
  const now = new Date();
  const past7 = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const next8 = new Date(now.getTime() + 8 * 86_400_000).toISOString();
  const next14 = new Date(now.getTime() + 14 * 86_400_000).toISOString().slice(0, 10);
  const past9 = new Date(now.getTime() - 9 * 86_400_000).toISOString();
  const fredSince = new Date(now.getTime() - 400 * 86_400_000).toISOString().slice(0, 10);

  // Signal-Historie der letzten ~30 Wochen für die "seit n Wochen"-Anzeige
  const snapshotSince = new Date(now.getTime() - 30 * 7 * 86_400_000).toISOString().slice(0, 10);

  const [dashboard, seasonality, eventsRes, meetingsRes, sentRes, fredSeries, btcTff, btcLegacy, snapRes] =
    await Promise.all([
      loadDashboardData(db),
      getSeasonalityStats(db),
      db
        .from("calendar_events")
        .select("title, currency, event_time, impact, actual, forecast")
        .gte("event_time", past7)
        .lte("event_time", next8)
        .eq("impact", "High")
        .order("event_time"),
      db
        .from("cb_meetings")
        .select("*")
        .gte("meeting_date", now.toISOString().slice(0, 10))
        .lte("meeting_date", next14)
        .order("meeting_date"),
      db
        .from("sentiment_snapshots")
        .select("pair, captured_at, long_pct")
        .gte("captured_at", past9)
        .order("captured_at", { ascending: false }),
      getFredBatch(db, ["DFII10", "T10YIE"], fredSince),
      getTffSeriesBatch(db, [BTC_CFTC_CODE]),
      getCotSeriesBatch(db, [BTC_CFTC_CODE]),
      db
        .from("weekly_outlook_snapshots")
        .select("instrument, week_start, direction")
        .gte("week_start", snapshotSince)
        .order("week_start", { ascending: false }),
    ]);

  // Signal-Streak je Instrument: von der neuesten Woche rückwärts zählen,
  // solange die Richtung gleich bleibt (und nicht null ist).
  const snapsByInstrument = new Map<string, Array<{ week: string; direction: string | null }>>();
  for (const r of snapRes.data ?? []) {
    const arr = snapsByInstrument.get(r.instrument) ?? [];
    arr.push({ week: r.week_start, direction: r.direction });
    snapsByInstrument.set(r.instrument, arr);
  }
  function signalStreak(instrument: string, direction: "LONG" | "SHORT" | null) {
    if (!direction) return { weeks: null as number | null, since: null as string | null };
    const rows = snapsByInstrument.get(instrument) ?? []; // bereits absteigend nach Woche
    let weeks = 0;
    let since: string | null = null;
    for (const row of rows) {
      if (row.direction !== direction) break;
      weeks++;
      since = row.week;
    }
    return { weeks: weeks > 0 ? weeks : null, since };
  }

  const nowIso = now.toISOString();
  const allEvents = (eventsRes.data ?? []).map(toWeeklyEvent);
  const upcoming = allEvents.filter((e) => e.eventTime >= nowIso);
  const pastDrift = allEvents.filter((e) => e.eventTime < nowIso && e.drift);
  const inPlayCcys = new Set(pastDrift.map((e) => e.currency).filter((c): c is string => Boolean(c)));

  const meetings: WeeklyMeeting[] = ((meetingsRes.data ?? []) as CbMeetingRow[]).map((m) => {
    const bankDef = [...BANK_BY_CCY.values()].find((b) => b.bank === m.bank);
    return {
      bank: m.bank,
      ccy: bankDef?.ccy ?? "",
      meetingDate: m.meeting_date,
      expectedChangeBps: m.expected_change_bps,
    };
  });

  // Sentiment: neuester + ältester Snapshot im 9-Tage-Fenster je Pair
  const sentLatest = new Map<string, number>();
  const sentOldest = new Map<string, number>();
  for (const r of sentRes.data ?? []) {
    if (r.long_pct === null) continue;
    if (!sentLatest.has(r.pair)) sentLatest.set(r.pair, r.long_pct);
    sentOldest.set(r.pair, r.long_pct); // absteigend sortiert -> letzter Schreiber = ältester
  }

  const flowByCcy = new Map(dashboard.cotFlows.map((f) => [f.ccy, f]));
  const pctByCcy = new Map(dashboard.cotPercentiles.map((p) => [p.ccy, p.percentile]));
  const verdictByInstrument = new Map(dashboard.verdicts.map((v) => [v.instrument, v]));
  const currentMonth = now.getMonth() + 1;

  // TFF gilt als aktiv, wenn mindestens eine Währung TFF-Daten hat (Fallback-Erkennung
  // steckt in loadDashboardData; hier nur fürs Label). BTC-Serie zählt mit.
  const usingTff = (btcTff.get(BTC_CFTC_CODE)?.length ?? 0) > 0;

  const unsortedCards: WeeklyPairCard[] = FX_INSTRUMENTS.map((inst) => {
    const base = inst.baseCcy!;
    const quote = inst.quoteCcy!;
    const verdict = verdictByInstrument.get(inst.instrument);
    if (!verdict) return null;

    const seasonStat = seasonality.get(inst.instrument)?.months.find((m) => m.month === currentMonth);
    const pairKey = fromOanda(inst.instrument);
    const longPct = sentLatest.get(pairKey) ?? null;
    const oldPct = sentOldest.get(pairKey) ?? null;

    const partial: Omit<WeeklyPairCard, "fundamentalText" | "signalWeeks" | "signalSince"> = {
      instrument: inst.instrument,
      displayName: inst.displayName,
      base,
      quote,
      verdict,
      baseFlow: flowByCcy.get(base) ?? null,
      quoteFlow: flowByCcy.get(quote) ?? null,
      basePercentile: pctByCcy.get(base) ?? null,
      quotePercentile: pctByCcy.get(quote) ?? null,
      season:
        seasonStat && seasonStat.years > 0
          ? { avgReturn: seasonStat.avgReturn, hitRate: seasonStat.hitRate, years: seasonStat.years }
          : null,
      sentimentLongPct: longPct,
      sentimentDeltaPp: longPct !== null && oldPct !== null ? longPct - oldPct : null,
      events: upcoming.filter((e) => e.currency === base || e.currency === quote),
      meetings: meetings.filter((m) => m.ccy === base || m.ccy === quote),
      inPlay: [base, quote].filter((c) => inPlayCcys.has(c)),
    };

    // Signal-Streak bleibt als FAKT (wie lange die aufgezeichnete Screener-Richtung
    // schon anhält) — reine Anzeige, keine Handelsempfehlung.
    const streak = signalStreak(inst.instrument, verdict.direction);

    return {
      ...partial,
      fundamentalText: buildFundamentalText(partial, usingTff),
      signalWeeks: streak.weeks,
      signalSince: streak.since,
    };
  }).filter((c): c is WeeklyPairCard => c !== null);

  // FAKTISCHE Default-Sortierung (Ereignisse dieser Woche). KEINE Signal-Sortierung:
  // der alte Score (alignedCount*10 + flowGap + inPlay) wie auch Q5/Q1 sind
  // out-of-sample widerlegt — Details in lib/weekly/sort.ts. Client kann faktisch
  // umschalten; Signal-Sortierung erst wieder mit einer Metrik nachweislich >50 %.
  const cards = sortCards(unsortedCards, "events");

  // ===== BTC-Karte =====
  const btcTffSeries = btcTff.get(BTC_CFTC_CODE) ?? [];
  const btcLegacySeries = btcLegacy.get(BTC_CFTC_CODE) ?? [];
  const btcFlowInput = btcTffSeries.length
    ? btcTffSeries.map((p) => ({ date: p.date, net: p.levNet, openInterest: p.openInterest }))
    : btcLegacySeries.map((p) => ({ date: p.date, net: p.net, openInterest: p.openInterest }));
  const btcFlow = latestFlow(computeCotFlow(btcFlowInput));
  const btcLast = btcTffSeries[btcTffSeries.length - 1] ?? null;

  const realYield = fredSeries.get("DFII10") ?? [];
  const breakeven = fredSeries.get("T10YIE") ?? [];
  const ryNow = realYield.length ? realYield[realYield.length - 1].value : null;
  const cutoff3m = new Date(now.getTime() - 91 * 86_400_000).toISOString().slice(0, 10);
  const ryPast = [...realYield].reverse().find((p) => p.date <= cutoff3m)?.value ?? null;
  const ryChg = ryNow !== null && ryPast !== null ? ryNow - ryPast : null;

  const btcReasons: Array<{ dir: -1 | 0 | 1; text: string }> = [];
  if (btcFlow?.delta4wPctOi != null) {
    const d = btcFlow.delta4wPctOi;
    const dir: -1 | 0 | 1 = d >= 3 ? 1 : d <= -3 ? -1 : 0;
    btcReasons.push({
      dir,
      text: `Leveraged-Funds-Flow 4W: ${fmtSigned(d)} % OI (${flowLabel(btcFlow.deltaPercentile)}).`,
    });
  }
  if (ryChg !== null) {
    const dir: -1 | 0 | 1 = ryChg <= -0.15 ? 1 : ryChg >= 0.15 ? -1 : 0;
    btcReasons.push({
      dir,
      text: `US-10Y-Realrendite 3M: ${fmtSigned(ryChg * 100, 0)} bps (${ryNow?.toFixed(2)} %) — ${
        dir === 1 ? "fallende Realrenditen stützen BTC" : dir === -1 ? "steigende Realrenditen belasten BTC" : "neutral"
      }.`,
    });
  }
  {
    const dir: -1 | 0 | 1 =
      dashboard.risk.regime === "Risk-On" ? 1 : dashboard.risk.regime === "Risk-Off" ? -1 : 0;
    btcReasons.push({
      dir,
      text: `Risk-Gauge: ${dashboard.risk.regime} (${dashboard.risk.composite.toFixed(0)}/100) — BTC handelt als Risk-Asset.`,
    });
  }
  const btcVote = btcReasons.reduce((s, r) => s + r.dir, 0);
  const btcBias: "LONG" | "SHORT" | null = btcVote >= 2 ? "LONG" : btcVote <= -2 ? "SHORT" : null;
  const btcEvents = upcoming.filter((e) => e.currency === "USD");

  const btcFundamental = [
    btcBias ? `BTC-Bias: ${btcBias} (${btcReasons.filter((r) => r.dir !== 0).length} Faktoren).` : "BTC: kein klarer Bias.",
    ...btcReasons.map((r) => `• ${r.text}`),
    ...(btcEvents.filter((e) => e.drift).length
      ? [
          `• USD-Event-Risiko: ${btcEvents
            .filter((e) => e.drift)
            .map((e) => `${e.title} (${new Date(e.eventTime).toLocaleDateString("de-DE")})`)
            .join("; ")}.`,
        ]
      : []),
  ].join("\n");

  return {
    cards,
    btc: {
      flow: btcFlow,
      levNet: btcLast?.levNet ?? null,
      levPercentile: btcLast?.levPercentile ?? null,
      reportDate: btcLast?.date ?? (btcLegacySeries[btcLegacySeries.length - 1]?.date ?? null),
      realYieldNow: ryNow,
      realYieldChg3m: ryChg,
      breakevenNow: breakeven.length ? breakeven[breakeven.length - 1].value : null,
      risk: dashboard.risk,
      bias: btcBias,
      reasons: btcReasons,
      events: btcEvents,
      fundamentalText: btcFundamental,
    },
    usingTff,
    latestCotDate: [...flowByCcy.values()].reduce<string | null>(
      (acc, f) => (!acc || f.date > acc ? f.date : acc),
      null,
    ),
  };
}
