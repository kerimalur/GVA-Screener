"use client";

import { useMemo, useState } from "react";
import Panel from "@/components/layout/Panel";
import TimeSeriesChart from "@/components/charts/TimeSeriesChart";
import RealYieldHistoryChart from "@/components/makro/RealYieldHistoryChart";
import FreshBadge from "@/components/ui/FreshBadge";
import {
  realYieldVerdict,
  VERDICT_TREND_BAND,
  type CcyRealYield,
  type RealYieldPoint,
  type RealYieldVerdict,
  type RealYieldVerdictLabel,
} from "@/lib/calc/realYield";
import type { RiskGaugeResult } from "@/lib/calc/riskGauge";

const fmtPp = (v: number, digits = 2) => `${v >= 0 ? "+" : ""}${v.toFixed(digits)}`;
const fmtMonth = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("de-CH", { month: "short", year: "2-digit" }) : "–";

// FreshBadge lebt jetzt in components/ui — dieselbe Anzeige nutzt auch das
// Cockpit (Arbeitspaket C), damit es nur EINE Frische-Darstellung gibt.

function Slope({ v }: { v: number | null }) {
  if (v === null) return <span className="text-muted">–</span>;
  const flat = Math.abs(v) < 0.1;
  return (
    <span className={`font-mono ${flat ? "text-muted" : v > 0 ? "text-up" : "text-down"}`}>
      {flat ? "→" : v > 0 ? "▲" : "▼"} {fmtPp(v)} pp
    </span>
  );
}

const VERDICT_UI: Record<RealYieldVerdictLabel, { label: string; cls: string }> = {
  bullish: { label: "BULLISH", cls: "bg-up/20 text-up border-up" },
  "leicht-bullish": { label: "LEICHT BULLISH", cls: "bg-up/10 text-up border-up/50" },
  neutral: { label: "NEUTRAL", cls: "bg-border/30 text-muted border-border" },
  "leicht-bearish": { label: "LEICHT BEARISH", cls: "bg-down/10 text-down border-down/50" },
  bearish: { label: "BEARISH", cls: "bg-down/20 text-down border-down" },
};

function VerdictRow({
  v,
  levelLabel,
  unit,
  note,
}: {
  v: RealYieldVerdict | null;
  levelLabel: string;
  unit: string;
  note?: string;
}) {
  if (!v) return <p className="text-sm text-muted">Zu wenig Historie für ein Verdikt.</p>;
  const ui = VERDICT_UI[v.verdict];
  const trendWord =
    v.trend === null
      ? "zu wenig Historie"
      : Math.abs(v.trend) <= VERDICT_TREND_BAND
        ? "seitwärts"
        : v.trend > 0
          ? "dreht nach oben"
          : "dreht nach unten";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className={`inline-block px-3 py-1 rounded border text-sm font-bold font-mono ${ui.cls}`}>
        {ui.label}
      </span>
      <span className="text-xs text-muted font-mono">
        {levelLabel} {fmtPp(v.level)} {unit} · Trend {v.trendMonths ?? "–"}M{" "}
        {v.trend !== null ? `${fmtPp(v.trend)} pp` : "–"} ({trendWord})
      </span>
      {note && <span className="text-[11px] text-muted">{note}</span>}
    </div>
  );
}

function RiskBadge({ risk }: { risk: RiskGaugeResult }) {
  const cls =
    risk.regime === "Risk-On"
      ? "bg-up/15 text-up"
      : risk.regime === "Risk-Off"
        ? "bg-down/15 text-down"
        : "bg-border/40 text-muted";
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold font-mono ${cls}`}>
      {risk.regime} · {risk.composite.toFixed(0)}/100
    </span>
  );
}

export default function RealYieldView({
  currencies,
  risk,
  vixDate,
}: {
  currencies: CcyRealYield[];
  risk: RiskGaugeResult;
  vixDate: string | null;
}) {
  const byCcy = useMemo(() => new Map(currencies.map((c) => [c.ccy, c])), [currencies]);
  const usable = currencies.filter((c) => c.realYield !== null).map((c) => c.ccy);
  const [ccyA, setCcyA] = useState(usable[0] ?? "EUR");
  const [ccyB, setCcyB] = useState(usable[1] ?? "USD");
  const [histCcy, setHistCcy] = useState(usable[0] ?? "EUR");

  const a = byCcy.get(ccyA);
  const b = byCcy.get(ccyB);
  const hist = byCcy.get(histCcy);
  const histVerdict = useMemo(
    () => (hist && hist.realYield !== null ? realYieldVerdict(hist.series) : null),
    [hist],
  );

  const pair = useMemo(() => {
    if (!a || !b || a.realYield === null || b.realYield === null) return null;
    const bByDate = new Map(b.series.map((p) => [p.date, p]));
    const chart: Array<{ date: string; [k: string]: string | number | null }> = [];
    // Differenz-Serie A−B als RealYieldPoint: rate/cpi = Differenzen, realYield = RY-Differenz
    const diffPoints: RealYieldPoint[] = [];
    for (const p of a.series) {
      const q = bByDate.get(p.date);
      if (!q) continue;
      const diff = p.realYield - q.realYield;
      diffPoints.push({ date: p.date, rate: p.rate - q.rate, cpi: p.cpi - q.cpi, realYield: diff });
      chart.push({ date: p.date, ryA: p.realYield, ryB: q.realYield, diff });
    }
    const last = diffPoints[diffPoints.length - 1];
    const idx6 = diffPoints.length - 7; // monatlich → 6 Monate zurück
    const trend6M = last && idx6 >= 0 ? last.realYield - diffPoints[idx6].realYield : null;
    return {
      chart,
      diffPoints,
      verdict: realYieldVerdict(diffPoints),
      diffNow: last?.realYield ?? null,
      trend6M,
      carry: a.rate !== null && b.rate !== null ? a.rate - b.rate : null,
    };
  }, [a, b]);

  const carryWarning =
    risk.regime === "Risk-Off"
      ? "Risk-Off: Carry-Trades sind anfällig — Safe-Haven-Währungen (JPY/CHF) werden trotz tiefem Zins gesucht. Zinsdifferenz nicht blind nutzen."
      : risk.regime === "Neutral"
        ? "Neutrales Regime: Carry funktioniert nur bedingt — auf Bestätigung durch das GVA-Setup warten."
        : "Risk-On: Umfeld begünstigt Carry (hoch verzinste Währung long gegen tief verzinste).";

  return (
    <div className="space-y-5 max-w-[1100px] mx-auto">
      <Panel
        title="Real-Yield-Ranking — stark → schwach"
        subtitle="Bias/Kontext, kein Handelssignal. Real Yield = Leitzins − CPI YoY (realized) — an Wendepunkten läuft die Anzeige der Lage 1–4 Monate hinterher."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted text-xs">
                <th className="py-1 pr-2">#</th>
                <th className="pr-3">Währung</th>
                <th className="pr-3">Leitzins</th>
                <th className="pr-3">CPI YoY</th>
                <th className="pr-3">Real Yield</th>
                <th className="pr-3">Trend 6M</th>
                <th className="pr-3">Trend 12M</th>
                <th>Datenstand</th>
              </tr>
            </thead>
            <tbody>
              {currencies.map((c, i) => (
                <tr key={c.ccy} className="border-t border-border/40">
                  <td className="py-2 pr-2 font-mono text-muted">{i + 1}</td>
                  <td className="pr-3 font-bold">{c.ccy}</td>
                  <td className="pr-3 font-mono">
                    {c.rate !== null ? `${c.rate.toFixed(2)} %` : "–"}
                    <span className="ml-1 text-[10px] text-muted">{fmtMonth(c.rateDate)}</span>
                  </td>
                  <td className="pr-3 font-mono">
                    {c.freshness === "dead" || c.cpi === null ? (
                      <span className="text-muted">–</span>
                    ) : (
                      <>
                        {c.cpi.toFixed(2)} %
                        <span className="ml-1 text-[10px] text-muted">{fmtMonth(c.cpiDate)}</span>
                      </>
                    )}
                  </td>
                  <td className={`pr-3 font-mono font-bold ${c.realYield === null ? "text-muted" : c.realYield >= 0 ? "text-up" : "text-down"}`}>
                    {c.realYield !== null ? `${fmtPp(c.realYield)} %` : "–"}
                  </td>
                  <td className="pr-3"><Slope v={c.slope6M} /></td>
                  <td className="pr-3"><Slope v={c.slope12M} /></td>
                  <td><FreshBadge f={c.freshness} ageDays={c.cpiAgeDays} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted leading-relaxed">
          <span className="font-bold text-fg">Lesen:</span> Steigender Real Yield macht eine Währung
          für Kapital attraktiver (mehr Zins nach Abzug der Inflation) — stark gegen schwach ist der
          relevante Vergleich. Quelle: BIS (Leitzinsen täglich, CPI YoY monatlich; AUD/NZD publizieren
          quartalsweise). Quartals-CPI wird als «älterer Stand» markiert, nicht kaschiert.
        </p>
      </Panel>

      <Panel
        title="Real-Yield-Verlauf je Währung"
        subtitle="Real Yield je Monat als Balken (grün ≥ 0, rot < 0), Leitzins & CPI YoY als Linien. Verdikt aus Level + Trend der letzten 2 Monate — Bias, kein Handelssignal."
        actions={
          <div className="flex flex-wrap gap-1">
            {currencies.map((c) => (
              <button
                key={c.ccy}
                onClick={() => setHistCcy(c.ccy)}
                disabled={c.realYield === null}
                title={c.realYield === null ? "keine aktuellen Daten" : undefined}
                className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-colors ${
                  histCcy === c.ccy
                    ? "bg-accent/15 text-accent border-accent"
                    : c.realYield === null
                      ? "text-muted/40 border-border/40 cursor-not-allowed"
                      : "text-muted border-border hover:border-border2"
                }`}
              >
                {c.ccy}
              </button>
            ))}
          </div>
        }
      >
        {!hist || hist.realYield === null ? (
          <p className="text-sm text-muted">
            {hist
              ? `Für ${hist.ccy} bewusst keine Anzeige — CPI-Daten tot (letzter Stand ${fmtMonth(hist.cpiDate)}).`
              : "Keine Währung mit belastbaren Daten."}
          </p>
        ) : (
          <div className="space-y-3">
            <VerdictRow v={histVerdict} levelLabel={`Real Yield ${hist.ccy}`} unit="%" />
            <RealYieldHistoryChart
              data={hist.series}
              ryLabel={`Real Yield ${hist.ccy}`}
              rateLabel="Leitzins"
              cpiLabel="CPI YoY"
            />
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
              <FreshBadge f={hist.freshness} ageDays={hist.cpiAgeDays} />
              <span>
                Datenstand: Leitzins {fmtMonth(hist.rateDate)} · CPI {fmtMonth(hist.cpiDate)}
                {hist.freshness === "old" &&
                  " — CPI publiziert verzögert (Quartalsland), Verdikt entsprechend vorsichtig lesen"}
              </span>
            </div>
          </div>
        )}
      </Panel>

      <Panel
        title="Paar-Ansicht — Real-Yield-Differenz"
        subtitle="Zwei Währungen vergleichen: Differenz + Trend, Carry-Situation und Risk-Regime als Kontext fürs GVA-Setup."
        actions={
          <div className="flex items-center gap-1.5 text-sm">
            {[
              { value: ccyA, set: setCcyA },
              { value: ccyB, set: setCcyB },
            ].map((sel, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i === 1 && <span className="text-muted text-xs">vs</span>}
                <select
                  value={sel.value}
                  onChange={(e) => sel.set(e.target.value)}
                  className="bg-surface2 border border-border rounded px-2 py-1 font-mono text-xs"
                >
                  {currencies.map((c) => (
                    <option key={c.ccy} value={c.ccy} disabled={c.realYield === null}>
                      {c.ccy}{c.realYield === null ? " (keine Daten)" : ""}
                    </option>
                  ))}
                </select>
              </span>
            ))}
          </div>
        }
      >
        {ccyA === ccyB ? (
          <p className="text-sm text-muted">Zwei unterschiedliche Währungen wählen.</p>
        ) : !pair || !a || !b ? (
          <p className="text-sm text-muted">
            Für diese Kombination fehlen belastbare Daten («keine aktuellen Daten») — bewusst keine
            Berechnung mit totem CPI.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-xs text-muted">Real-Yield-Differenz ({ccyA}−{ccyB})</div>
                <div className={`font-mono text-lg font-bold ${pair.diffNow !== null && pair.diffNow >= 0 ? "text-up" : "text-down"}`}>
                  {pair.diffNow !== null ? `${fmtPp(pair.diffNow)} pp` : "–"}
                </div>
                <div className="text-[11px] text-muted">
                  {pair.diffNow !== null && (pair.diffNow >= 0 ? `spricht für ${ccyA}` : `spricht für ${ccyB}`)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted">Trend der Differenz (6M)</div>
                <div className="font-mono text-lg"><Slope v={pair.trend6M} /></div>
                <div className="text-[11px] text-muted">
                  {pair.trend6M !== null && Math.abs(pair.trend6M) >= 0.1 &&
                    (pair.trend6M > 0 ? `Momentum Richtung ${ccyA}` : `Momentum Richtung ${ccyB}`)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted">Carry (Zinsdifferenz)</div>
                <div className="font-mono text-lg">
                  {pair.carry !== null ? `${fmtPp(pair.carry)} pp` : "–"}
                </div>
                <div className="text-[11px] text-muted">
                  {pair.carry !== null && Math.abs(pair.carry) >= 0.25 &&
                    `Carry begünstigt Long ${pair.carry > 0 ? ccyA : ccyB}`}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted">
                  Risk-Regime{vixDate ? ` (VIX-Stand ${new Date(vixDate).toLocaleDateString("de-CH")})` : ""}
                </div>
                <div className="mt-1"><RiskBadge risk={risk} /></div>
              </div>
            </div>

            <p className="text-xs text-muted leading-relaxed border-l-2 border-border pl-3">
              {carryWarning}
            </p>

            <VerdictRow
              v={pair.verdict}
              levelLabel={`RY-Differenz ${ccyA}−${ccyB}`}
              unit="pp"
              note={`BULLISH = Real-Yield-Bild spricht für ${ccyA} (gegen ${ccyB})`}
            />
            <RealYieldHistoryChart
              data={pair.diffPoints}
              ryLabel={`RY-Differenz ${ccyA}−${ccyB}`}
              rateLabel="Zinsdifferenz (Carry)"
              cpiLabel="CPI-Differenz"
              unit="pp"
            />

            <TimeSeriesChart
              data={pair.chart}
              series={[
                { key: "diff", label: `Differenz ${ccyA}−${ccyB}`, color: "var(--color-accent)" },
                { key: "ryA", label: `Real Yield ${ccyA}`, color: "var(--color-up)", dashed: true },
                { key: "ryB", label: `Real Yield ${ccyB}`, color: "var(--color-down)", dashed: true },
              ]}
              height={260}
              defaultTimeframe="Max"
              refLineY={0}
              yDigits={1}
            />
          </div>
        )}
      </Panel>

      <Panel title="Einordnung">
        <div className="text-xs text-muted leading-relaxed space-y-2">
          <p>
            <span className="font-bold text-fg">Was das ist:</span> ein fundamentales Bias-Display —
            es fliesst NICHT in den Q-Score oder das Währungs-Ranking ein. Es beantwortet nur:
            «Welche Währung bezahlt real am meisten?» Ein GVA-Setup in Richtung der Real-Yield-starken
            Währung hat fundamentalen Rückenwind; die Gegenrichtung bleibt valide, nur ohne Bonus.
          </p>
          <p>
            <span className="font-bold text-fg">Grenze:</span> gerechnet wird mit realized CPI
            (publiziert mit 1–4 Monaten Verzug), nicht mit Inflationserwartungen. An Wendepunkten
            (Zentralbank-Pivot, Inflationsknick) dreht der Markt früher als diese Anzeige.
            Trend-Spalten (6M/12M) sind deshalb wichtiger als das Niveau allein.
          </p>
        </div>
      </Panel>
    </div>
  );
}
