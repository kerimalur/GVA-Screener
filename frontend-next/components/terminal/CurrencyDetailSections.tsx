"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import CotSnapshotTable from "@/components/cot/CotSnapshotTable";
import CotHistoryChart from "@/components/cot/CotHistoryChart";
import SentimentGrid from "@/components/sentiment/SentimentGrid";
import SentimentHistory from "@/components/sentiment/SentimentHistory";
import SeasonalityDetail from "@/components/saisonalitaet/SeasonalityDetail";
import OverlayChart from "@/components/intermarket/OverlayChart";
import { Metric } from "@/components/ui/terminal";
import type { TerminalCurrency } from "@/lib/data/terminal";
import type { SubScore } from "@/lib/calc/currencyScore";

/**
 * Die 4 Sub-Score-Sektionen (COT · Zinsen · Saisonalität · Retail) +
 * Intermarket-Panel einer Währung. Wird vom Detail-Modal und der
 * Vergleichsseite gemeinsam genutzt. Schwere Charts laden erst beim
 * Aufklappen (lazy mount), über die bestehenden Daten-APIs.
 */

/** Sub-Score-Anzeige ganzzahlig auf −100…+100 (wie der Total-Score). */
function fmtScore(v: number | null): string {
  if (v === null) return "–";
  const scaled = v * 100;
  return `${scaled > 0 ? "+" : ""}${scaled.toFixed(0)}`;
}

function scoreCls(v: number | null): string {
  if (v === null) return "text-faint";
  if (v >= 0.15) return "text-up";
  if (v <= -0.15) return "text-down";
  return "text-muted";
}

/** Score-Balken −1…+1 mit Nulllinie in der Mitte. */
function ScoreBar({ score }: { score: number | null }) {
  const pct = score === null ? 0 : Math.min(50, Math.abs(score) * 50);
  return (
    <div className="relative h-2 w-24 bg-surface rounded-sm overflow-hidden shrink-0">
      {score !== null && (
        <div
          className={`absolute top-0 h-full ${score >= 0 ? "bg-up/70 left-1/2" : "bg-down/70 right-1/2"}`}
          style={{ width: `${pct}%` }}
        />
      )}
      <div className="absolute left-1/2 top-0 h-full w-px bg-faint/60" />
    </div>
  );
}

/** Sektion mit Sub-Score-Kopf. */
function Section({ sub, children }: { sub: SubScore; children: ReactNode }) {
  return (
    <section className="border border-border rounded-lg bg-surface2 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 border-b border-border/60">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-black uppercase tracking-widest">{sub.label}</span>
          <span className="text-[11px] text-muted truncate hidden md:inline">{sub.text}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ScoreBar score={sub.score} />
          <span className={`text-[13px] font-mono font-bold w-12 text-right ${scoreCls(sub.score)}`}>
            {fmtScore(sub.score)}
          </span>
        </div>
      </div>
      <div className="p-3.5 space-y-3">{children}</div>
    </section>
  );
}

/** Aufklappbereich, der seinen Inhalt erst beim Öffnen mountet (lazy fetch). */
function Collapse({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border/60 rounded">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left px-3 py-2 text-[11px] font-bold font-mono text-muted hover:text-text transition-colors cursor-pointer"
      >
        {open ? "▾" : "▸"} {label}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

function sub(c: TerminalCurrency, key: string): SubScore {
  return c.score.subs.find((s) => s.key === key)!;
}

// ── COT ─────────────────────────────────────────────────────────────────────
function TffMiniTable({ c }: { c: TerminalCurrency }) {
  const t = c.cot.tffLatest;
  if (!t) return null;
  const p = c.cot.tffPrev;
  const rows = [
    {
      name: "Dealer",
      net: (t.dealer_long ?? 0) - (t.dealer_short ?? 0),
      prev: p ? (p.dealer_long ?? 0) - (p.dealer_short ?? 0) : null,
    },
    {
      name: "Asset Manager",
      net: (t.asset_mgr_long ?? 0) - (t.asset_mgr_short ?? 0),
      prev: p ? (p.asset_mgr_long ?? 0) - (p.asset_mgr_short ?? 0) : null,
    },
    {
      name: "Leveraged Funds",
      net: (t.lev_money_long ?? 0) - (t.lev_money_short ?? 0),
      prev: p ? (p.lev_money_long ?? 0) - (p.lev_money_short ?? 0) : null,
    },
  ];
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-faint mb-1">
        TFF-Report (Financial Futures) · {new Date(t.report_date).toLocaleDateString("de-DE")}
      </div>
      <table className="w-full text-[12px] font-mono">
        <tbody>
          {rows.map((r) => {
            const d = r.prev !== null ? r.net - r.prev : null;
            return (
              <tr key={r.name} className="border-b border-border/40">
                <td className="py-1 font-sans text-muted">{r.name}</td>
                <td className={`py-1 text-right font-bold ${r.net >= 0 ? "text-up" : "text-down"}`}>
                  {r.net.toLocaleString("de-DE")}
                </td>
                <td className={`py-1 pl-3 text-right ${d === null ? "text-faint" : d > 0 ? "text-up" : d < 0 ? "text-down" : "text-muted"}`}>
                  {d === null ? "–" : `${d > 0 ? "+" : ""}${d.toLocaleString("de-DE")} Δ1W`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CotSection({ c }: { c: TerminalCurrency }) {
  const pct = c.cot.percentile;
  const extreme = pct !== null && (pct >= 90 || pct <= 10);
  return (
    <Section sub={sub(c, "cot")}>
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
        {pct !== null && (
          <span
            className={`px-1.5 py-0.5 rounded border font-bold ${
              extreme
                ? pct >= 90
                  ? "bg-up/15 text-up border-up/40"
                  : "bg-down/15 text-down border-down/40"
                : "text-muted border-border"
            }`}
          >
            {extreme ? (pct >= 90 ? "⚠ EXTREM-LONG · " : "⚠ EXTREM-SHORT · ") : ""}
            {pct.toFixed(0)}. Perzentil (5J)
          </span>
        )}
        {c.cot.flow?.delta1wPctOi != null && (
          <span className="text-muted">
            Δ1W {c.cot.flow.delta1wPctOi > 0 ? "+" : ""}
            {c.cot.flow.delta1wPctOi.toFixed(1)} % OI
          </span>
        )}
        {c.cot.contractLabel && <span className="text-faint">{c.cot.contractLabel}</span>}
      </div>

      {c.cot.divergence && (
        <p
          className={`text-[11px] leading-snug border rounded px-2.5 py-1.5 ${
            c.cot.divergence.dir === 1
              ? "text-up border-up/40 bg-up/10"
              : "text-down border-down/40 bg-down/10"
          }`}
        >
          {c.cot.divergence.text}
        </p>
      )}

      {c.cot.legacyLatest ? (
        <CotSnapshotTable latest={c.cot.legacyLatest} prev={c.cot.legacyPrev} />
      ) : (
        <p className="text-muted text-[12px] font-mono">Kein Legacy-Report vorhanden.</p>
      )}

      <TffMiniTable c={c} />

      {c.cot.contractCode && (
        <Collapse label="Historie: Netto-Positionen + Perzentil-Verlauf">
          <CotHistoryChart code={c.cot.contractCode} />
        </Collapse>
      )}

      <Link
        href={`/cot/intelligence/${c.ccy}`}
        className="inline-block text-[11px] font-mono text-accent hover:underline"
      >
        → COT Intelligence {c.ccy}
      </Link>
    </Section>
  );
}

// ── Zinsen ──────────────────────────────────────────────────────────────────
const STANCE_STYLE: Record<string, string> = {
  HAWKISH: "bg-up-dim text-up border-up/30",
  DOVISH: "bg-down-dim text-down border-down/30",
  NEUTRAL: "bg-neutral-dim text-muted border-border",
};

function ZinsenSection({ c }: { c: TerminalCurrency }) {
  const r = c.rates;
  const momentum =
    r.delta6mBps === null
      ? "unbekannt"
      : r.delta6mBps > 10
        ? `hiking (+${r.delta6mBps} bps in 6M)`
        : r.delta6mBps < -10
          ? `cutting (${r.delta6mBps} bps in 6M)`
          : "on hold (±0 in 6M)";
  return (
    <Section sub={sub(c, "zinsen")}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="bg-surface border border-border/60 rounded-(--radius-tag) p-2">
          <Metric label="Rate" valueClassName="text-[15px]">
            {r.policyRate !== null ? `${r.policyRate.toFixed(2)} %` : "–"}
          </Metric>
        </div>
        <div className="bg-surface border border-border/60 rounded-(--radius-tag) p-2">
          <Metric
            label="Momentum"
            valueClassName={`text-[12px] ${
              r.delta6mBps === null ? "text-faint" : r.delta6mBps > 10 ? "text-up" : r.delta6mBps < -10 ? "text-down" : "text-muted"
            }`}
          >
            {momentum}
          </Metric>
        </div>
        <div className="bg-surface border border-border/60 rounded-(--radius-tag) p-2">
          <Metric label="10Y" valueClassName="text-[15px]">
            {r.y10 !== null ? `${r.y10.toFixed(2)} %` : "–"}
          </Metric>
        </div>
        <div className="bg-surface border border-border/60 rounded-(--radius-tag) p-2">
          <div className="text-[9px] uppercase tracking-widest text-faint">CB-Haltung</div>
          <span
            className={`inline-block mt-1 px-1.5 py-0.5 rounded-(--radius-tag) border text-[10px] font-black font-mono uppercase tracking-wider ${STANCE_STYLE[r.stance.label]}`}
          >
            {r.stance.label}
          </span>
        </div>
      </div>

      <p className="text-[11px] text-muted leading-snug">
        <span className="font-bold text-text">{r.bankName} ({r.bank}):</span> {r.stance.rationale}
        {r.lastChangeBps !== null && (
          <>
            {" "}· Letzte Änderung: {r.lastChangeBps > 0 ? "+" : ""}
            {r.lastChangeBps} bps
            {r.lastChangeDate ? ` am ${new Date(r.lastChangeDate).toLocaleDateString("de-DE")}` : ""}
          </>
        )}
      </p>

      {r.nextMeeting && (
        <div className="text-[11px] font-mono bg-surface border border-border/60 rounded px-2.5 py-1.5">
          Nächster Zinsentscheid: {new Date(r.nextMeeting.date).toLocaleDateString("de-DE")} —{" "}
          <span
            className={
              r.nextMeeting.expectedBps === null || r.nextMeeting.expectedBps === 0
                ? "text-muted"
                : r.nextMeeting.expectedBps > 0
                  ? "text-up font-bold"
                  : "text-down font-bold"
            }
          >
            {r.nextMeeting.expectedBps === null
              ? "Erwartung n/a"
              : r.nextMeeting.expectedBps === 0
                ? "±0 bps erwartet"
                : `${r.nextMeeting.expectedBps > 0 ? "+" : ""}${r.nextMeeting.expectedBps} bps erwartet`}
          </span>
        </div>
      )}

      <div>
        <div className="text-[10px] uppercase tracking-widest text-faint mb-1">
          Differenzen zu den anderen G8 ({c.ccy} − …)
        </div>
        <table className="w-full text-[11px] font-mono">
          <thead>
            <tr className="text-[9px] uppercase tracking-widest text-faint border-b border-border/60">
              <th className="text-left py-1">CCY</th>
              <th className="text-right py-1 px-2">Leitzins-Diff</th>
              <th className="text-right py-1">10Y-Diff</th>
            </tr>
          </thead>
          <tbody>
            {r.diffs.map((d) => (
              <tr key={d.ccy} className="border-b border-border/30">
                <td className="py-1 font-bold">{d.ccy}</td>
                <td className={`py-1 px-2 text-right ${d.rateDiff === null ? "text-faint" : d.rateDiff > 0 ? "text-up" : d.rateDiff < 0 ? "text-down" : "text-muted"}`}>
                  {d.rateDiff !== null ? `${d.rateDiff > 0 ? "+" : ""}${d.rateDiff.toFixed(2)} pp` : "–"}
                </td>
                <td className={`py-1 text-right ${d.y10Diff === null ? "text-faint" : d.y10Diff > 0 ? "text-up" : d.y10Diff < 0 ? "text-down" : "text-muted"}`}>
                  {d.y10Diff !== null ? `${d.y10Diff > 0 ? "+" : ""}${d.y10Diff.toFixed(2)} pp` : "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// ── Saisonalität ────────────────────────────────────────────────────────────
function SaisonSection({ c }: { c: TerminalCurrency }) {
  const s = c.season;
  const hasData = s.months.some((m) => m.years > 0);
  const yearsCovered = Math.max(...s.months.map((m) => m.years), 0);
  return (
    <Section sub={sub(c, "saison")}>
      {(s.longPairs.length > 0 || s.shortPairs.length > 0) && (
        <div className="text-[11px] font-mono leading-relaxed">
          <span className="text-faint uppercase tracking-wider text-[9px] mr-2">
            {s.monthLabel} (konsistente Muster, ≥8 Jahre)
          </span>
          {s.longPairs.length > 0 && (
            <span className="text-up">pro {c.ccy}: {s.longPairs.join(", ")}. </span>
          )}
          {s.shortPairs.length > 0 && (
            <span className="text-down">contra {c.ccy}: {s.shortPairs.join(", ")}.</span>
          )}
        </div>
      )}
      {hasData ? (
        <SeasonalityDetail
          displayName={`${c.ccy} (Ø über Pairs)`}
          months={s.months}
          yearsCovered={yearsCovered}
        />
      ) : (
        <p className="text-muted text-[12px] font-mono">Keine Saisonalitäts-Daten.</p>
      )}
    </Section>
  );
}

// ── Retail ──────────────────────────────────────────────────────────────────
function RetailSection({ c }: { c: TerminalCurrency }) {
  const r = c.retail;
  return (
    <Section sub={sub(c, "retail")}>
      {r.avgLongPct !== null ? (
        <p className="text-[11px] text-muted leading-snug">
          Retail ist über die {c.ccy}-Pairs Ø{" "}
          <span className="font-mono font-bold text-text">{r.avgLongPct.toFixed(0)} % long</span> in{" "}
          {c.ccy} — die Mehrheit liegt an Wendepunkten häufig falsch (Konträr-Indikator).
        </p>
      ) : (
        <p className="text-muted text-[12px] font-mono">Keine Sentiment-Daten.</p>
      )}
      {r.pairs.length > 0 && (
        <SentimentGrid
          entries={r.pairs.map((p) => ({
            pair: p.pair,
            longPct: p.longPct,
            shortPct: p.shortPct,
            longPositions: null,
            shortPositions: null,
          }))}
        />
      )}
      {r.pairs.length > 0 && (
        <Collapse label="Historischer Verlauf: Retail-Long-% vs. Preis">
          <SentimentHistory pairs={r.pairs.map((p) => p.pair)} />
        </Collapse>
      )}
    </Section>
  );
}

// ── Intermarket ─────────────────────────────────────────────────────────────
interface CorrEntry {
  a: string;
  b: string;
  corr: number;
}

/** Nicht-FX-Instrumente für den Cross-Asset-Blick. */
const CROSS_ASSETS = new Set(["XAU_USD", "WTICO_USD", "BCO_USD", "XCU_USD", "SPX500_USD", "BTC_USD"]);

function useCcyCorrelations(ccy: string, pairKeys: string[]) {
  const [entries, setEntries] = useState<CorrEntry[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/data/correlations?window=60")
      .then((r) => r.json())
      .then((json: { keys?: string[]; matrix?: Array<Array<number | null>> }) => {
        if (cancelled || !json.keys || !json.matrix) return;
        const { keys, matrix } = json;
        const out: CorrEntry[] = [];
        for (let i = 0; i < keys.length; i++) {
          for (let j = i + 1; j < keys.length; j++) {
            const v = matrix[i][j];
            if (v === null) continue;
            // eigenes Pair auf der einen, Cross-Asset auf der anderen Seite
            const pair = pairKeys.includes(keys[i]) ? keys[i] : pairKeys.includes(keys[j]) ? keys[j] : null;
            const other = pair === keys[i] ? keys[j] : keys[i];
            if (!pair || !CROSS_ASSETS.has(other)) continue;
            out.push({ a: pair, b: other, corr: v });
          }
        }
        out.sort((x, y) => Math.abs(y.corr) - Math.abs(x.corr));
        setEntries(out.slice(0, 6));
      })
      .catch(() => setEntries([]));
    return () => {
      cancelled = true;
    };
  }, [ccy]); // eslint-disable-line react-hooks/exhaustive-deps
  return entries;
}

function IntermarketSection({ c }: { c: TerminalCurrency }) {
  const pairKeys = c.retail.pairs.length
    ? c.retail.pairs.map((p) => `${p.pair.slice(0, 3)}_${p.pair.slice(3)}`)
    : [];
  const corr = useCcyCorrelations(c.ccy, pairKeys);
  return (
    <section className="border border-border rounded-lg bg-surface2 overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-border/60">
        <span className="text-[11px] font-black uppercase tracking-widest">Intermarket</span>
        <span className="text-[11px] text-muted ml-2">
          {c.ccy === "USD" ? "DXY-Bezug + USD-Paare" : "Korrelationen der Pairs (60 Tage)"}
        </span>
      </div>
      <div className="p-3.5 space-y-3">
        {c.intermarket.usdImpact && (
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-widest text-faint">
              USD-Auswirkung (1M-Return aller USD-Paare)
            </div>
            {c.intermarket.usdImpact.map((row) => (
              <div key={row.pair} className="flex items-center gap-2 text-[11px]">
                <span className="w-20 font-mono font-bold">{row.pair}</span>
                <div className="flex-1 h-2 bg-surface rounded-sm relative overflow-hidden">
                  {row.ret1M !== null && (
                    <div
                      className={`absolute top-0 h-full ${row.ret1M >= 0 ? "bg-up/60 left-1/2" : "bg-down/60 right-1/2"}`}
                      style={{ width: `${Math.min(50, Math.abs(row.ret1M) * 12)}%` }}
                    />
                  )}
                  <div className="absolute left-1/2 top-0 h-full w-px bg-faint/50" />
                </div>
                <span
                  className={`w-14 text-right font-mono font-bold ${
                    row.ret1M === null ? "text-faint" : row.ret1M >= 0 ? "text-up" : "text-down"
                  }`}
                >
                  {row.ret1M !== null ? `${row.ret1M > 0 ? "+" : ""}${row.ret1M.toFixed(2)} %` : "–"}
                </span>
              </div>
            ))}
          </div>
        )}

        {corr === null && <p className="text-muted text-[11px] font-mono animate-pulse">Lade Korrelationen …</p>}
        {corr !== null && corr.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-widest text-faint mb-1">
              Stärkste Cross-Asset-Korrelationen
            </div>
            <div className="space-y-1">
              {corr.map((e) => (
                <div key={`${e.a}-${e.b}`} className="flex items-center gap-2 text-[11px] font-mono">
                  <span className="w-40 truncate">{e.a.replace("_", "/")} ↔ {e.b.replace("_", "/")}</span>
                  <span className={`font-bold ${e.corr >= 0 ? "text-up" : "text-down"}`}>
                    {e.corr >= 0 ? "+" : ""}
                    {e.corr.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {corr !== null && corr.length === 0 && !c.intermarket.usdImpact && (
          <p className="text-muted text-[11px] font-mono">Keine Korrelationsdaten.</p>
        )}

        {c.intermarket.commodity && (
          <Collapse label={c.intermarket.commodity.label}>
            <OverlayChart
              a={{ type: "price", key: c.intermarket.commodity.instrument, label: c.intermarket.commodity.label.split(" ↔ ")[0] }}
              b={{ type: "price", key: c.intermarket.commodity.pairInstrument }}
              height={220}
            />
          </Collapse>
        )}
      </div>
    </section>
  );
}

// ── Export ──────────────────────────────────────────────────────────────────
export default function CurrencyDetailSections({ currency }: { currency: TerminalCurrency }) {
  return (
    <div className="space-y-4">
      <CotSection c={currency} />
      <ZinsenSection c={currency} />
      <SaisonSection c={currency} />
      <RetailSection c={currency} />
      <IntermarketSection c={currency} />
    </div>
  );
}
