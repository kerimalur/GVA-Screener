import type { SeriesPoint } from "./seriesMath";
import type { SeasonalityResult } from "./seasonality";
import { MONTH_LABELS } from "./seasonality";
import type { InstrumentDef } from "@/lib/constants/instruments";

export interface ScreenerFactor {
  name: string;
  dir: -1 | 0 | 1; // -1 Short, +1 Long (bezogen auf das Pair)
  text: string;
}

export interface ScreenerVerdict {
  instrument: string;
  displayName: string;
  direction: "LONG" | "SHORT" | null;
  alignedCount: number;
  factors: ScreenerFactor[];
  summary: string;
}

export interface ScreenerInputs {
  /** aktuelles NonComm-Perzentil je Währung (USD über Dollar-Index-Future) */
  cotPercentileByCcy: Map<string, number>;
  /** Leitzins-Serien je Währung */
  policyByCcy: Map<string, SeriesPoint[]>;
  /** 10Y-Serien je Währung */
  yield10ByCcy: Map<string, SeriesPoint[]>;
  /** Saisonalität je Instrument */
  seasonalityByInstrument: Map<string, SeasonalityResult>;
  /** Retail Long-% je Pair (Myfxbook-Notation EURUSD) */
  sentimentByPair: Map<string, number>;
  /** aktueller Monat 1–12 */
  currentMonth: number;
}

function latest(series: SeriesPoint[] | undefined): number | null {
  return series && series.length > 0 ? series[series.length - 1].value : null;
}

function valueMonthsAgo(series: SeriesPoint[] | undefined, months: number): number | null {
  if (!series || series.length === 0) return null;
  const cutoff = new Date(series[series.length - 1].date);
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const past = [...series].reverse().find((p) => p.date <= cutoffStr);
  return past?.value ?? null;
}

/** Long/Short-Einschätzung eines Pairs aus 5 unabhängigen Faktoren. */
export function evaluatePair(inst: InstrumentDef, inputs: ScreenerInputs): ScreenerVerdict {
  const base = inst.baseCcy!;
  const quote = inst.quoteCcy!;
  const factors: ScreenerFactor[] = [];

  // 1) Zinsdifferenz (Niveau + Drehung)
  {
    const rb = latest(inputs.policyByCcy.get(base));
    const rq = latest(inputs.policyByCcy.get(quote));
    const rb6 = valueMonthsAgo(inputs.policyByCcy.get(base), 6);
    const rq6 = valueMonthsAgo(inputs.policyByCcy.get(quote), 6);
    if (rb !== null && rq !== null) {
      const diff = rb - rq;
      const diffChange = rb6 !== null && rq6 !== null ? diff - (rb6 - rq6) : 0;
      let dir: -1 | 0 | 1 = 0;
      if (diff > 0.25 || diffChange > 0.2) dir = 1;
      else if (diff < -0.25 || diffChange < -0.2) dir = -1;
      const changeText =
        Math.abs(diffChange) > 0.1
          ? `, Tendenz ${diffChange > 0 ? "zugunsten" : "zulasten"} ${base} (${diffChange > 0 ? "+" : ""}${(diffChange * 100).toFixed(0)} bps in 6M)`
          : "";
      factors.push({
        name: "Zinsdifferenz",
        dir,
        text: `Leitzins ${base} ${rb.toFixed(2)} % vs. ${quote} ${rq.toFixed(2)} % → Differenz ${diff > 0 ? "+" : ""}${diff.toFixed(2)} pp${changeText}.`,
      });
    }
  }

  // 2) COT-Positionierung (Perzentil-Differenz Basis vs. Quote)
  {
    const pb = inputs.cotPercentileByCcy.get(base);
    const pq = inputs.cotPercentileByCcy.get(quote);
    if (pb !== undefined && pq !== undefined) {
      const gap = pb - pq;
      const dir: -1 | 0 | 1 = gap >= 30 ? 1 : gap <= -30 ? -1 : 0;
      const extreme =
        pb >= 90 ? ` ${base} im Extrem-Long (Konträr-Risiko!).` :
        pb <= 10 ? ` ${base} im Extrem-Short.` : "";
      factors.push({
        name: "COT",
        dir,
        text: `Non-Commercials: ${base} im ${pb.toFixed(0)}., ${quote} im ${pq.toFixed(0)}. Perzentil — Smart-Money ${
          dir === 1 ? `bevorzugt ${base}` : dir === -1 ? `bevorzugt ${quote}` : "ohne klare Präferenz"
        }.${extreme}`,
      });
    }
  }

  // 3) Saisonalität (aktueller Monat)
  {
    const season = inputs.seasonalityByInstrument.get(inst.instrument);
    const stat = season?.months.find((m) => m.month === inputs.currentMonth);
    if (stat && stat.years >= 8) {
      let dir: -1 | 0 | 1 = 0;
      if (stat.avgReturn >= 0.3 && stat.hitRate >= 60) dir = 1;
      else if (stat.avgReturn <= -0.3 && stat.hitRate <= 40) dir = -1;
      factors.push({
        name: "Saisonalität",
        dir,
        text: `${MONTH_LABELS[inputs.currentMonth - 1]} historisch Ø ${stat.avgReturn > 0 ? "+" : ""}${stat.avgReturn.toFixed(2)} % (${stat.hitRate.toFixed(0)} % positive Jahre, ${stat.years} Jahre Basis).`,
      });
    }
  }

  // 4) 10Y-Spread-Trend (3 Monate)
  {
    const yb = inputs.yield10ByCcy.get(base);
    const yq = inputs.yield10ByCcy.get(quote);
    const nowB = latest(yb);
    const nowQ = latest(yq);
    const pastB = valueMonthsAgo(yb, 3);
    const pastQ = valueMonthsAgo(yq, 3);
    if (nowB !== null && nowQ !== null && pastB !== null && pastQ !== null) {
      const spread = nowB - nowQ;
      const change = spread - (pastB - pastQ);
      const dir: -1 | 0 | 1 = change >= 0.15 ? 1 : change <= -0.15 ? -1 : 0;
      factors.push({
        name: "Yield-Spread",
        dir,
        text: `10Y-Spread ${base}−${quote}: ${spread > 0 ? "+" : ""}${spread.toFixed(2)} pp, in 3M ${change >= 0 ? "+" : ""}${(change * 100).toFixed(0)} bps ${change >= 0 ? "gestiegen" : "gefallen"}.`,
      });
    }
  }

  // 5) Retail-Sentiment (konträr)
  {
    const pair = inst.instrument.replace("_", "");
    const longPct = inputs.sentimentByPair.get(pair);
    if (longPct !== undefined) {
      const dir: -1 | 0 | 1 = longPct >= 65 ? -1 : longPct <= 35 ? 1 : 0;
      factors.push({
        name: "Retail-Sentiment",
        dir,
        text: `Retail ist ${longPct.toFixed(0)} % long — ${
          dir === -1
            ? "überfüllte Long-Seite, konträr Short-Signal."
            : dir === 1
              ? "überfüllte Short-Seite, konträr Long-Signal."
              : "ausgeglichen, kein Konträr-Signal."
        }`,
      });
    }
  }

  const longCount = factors.filter((f) => f.dir === 1).length;
  const shortCount = factors.filter((f) => f.dir === -1).length;
  let direction: "LONG" | "SHORT" | null = null;
  let alignedCount = 0;
  if (longCount >= 2 && longCount > shortCount) {
    direction = "LONG";
    alignedCount = longCount;
  } else if (shortCount >= 2 && shortCount > longCount) {
    direction = "SHORT";
    alignedCount = shortCount;
  }

  const supporting = factors.filter(
    (f) => f.dir === (direction === "LONG" ? 1 : -1),
  );
  const summary = direction
    ? `${direction} ${inst.displayName}: ${supporting.map((f) => f.name).join(" + ")} stützen die ${
        direction === "LONG" ? "Long" : "Short"
      }-These (${alignedCount} von ${factors.length} Faktoren).`
    : `Kein Signal für ${inst.displayName} — weniger als 2 gleichgerichtete Faktoren.`;

  return {
    instrument: inst.instrument,
    displayName: inst.displayName,
    direction,
    alignedCount,
    factors,
    summary,
  };
}
