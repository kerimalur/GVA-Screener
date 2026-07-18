"use client";

import { useMemo, useState } from "react";
import { FX_INSTRUMENTS } from "@/lib/constants/instruments";
import Panel from "@/components/layout/Panel";
import { Field, Select } from "@/components/ui/Field";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { useCachedFetch } from "@/lib/hooks/useCachedFetch";
import {
  RANGE_PRESETS,
  trackUrl,
  type RangeKey,
  type Track,
  type TrackSummary as Summary,
} from "@/lib/ml/fundamentalTrackApi";

/**
 * Pair-Fundamental-Track: für ein Pair die letzten 52 Wochen-Q-Scores (Baseline,
 * as-of) beider Währungen + ob der Markt danach 1W/4W in Bias-Richtung lief.
 * Reine Inspektion — zeigt, wie gut der Score kalibriert war (nicht der
 * ML-Backtest, den macht die Engine selbst). Typen/URL: lib/ml/fundamentalTrackApi.
 */

function QCell({ ccy, q, score }: { ccy: string; q: number; score: number }) {
  const cls = q === 5 ? "text-up" : q === 1 ? "text-down" : "text-muted";
  return (
    <span className="font-mono">
      {ccy} <b className={cls}>Q{q}</b>{" "}
      <span className="text-faint">
        ({score >= 0 ? "+" : ""}
        {score.toFixed(2)})
      </span>
    </span>
  );
}

function HitCell({ ret, hit }: { ret: number | null; hit: boolean | null }) {
  if (ret === null) return <span className="text-faint font-mono">–</span>;
  const cls = hit === null ? "text-muted" : hit ? "text-up" : "text-down";
  const mark = hit === null ? "○" : hit ? "✓" : "✗";
  return (
    <span className={`font-mono ${cls}`}>
      {mark} {ret >= 0 ? "+" : ""}
      {ret.toFixed(2)}%
    </span>
  );
}

export function RateTile({ label, s }: { label: string; s?: Summary }) {
  const rate = s?.rate ?? null;
  const cls = rate === null ? "text-muted" : rate >= 50 ? "text-up" : "text-down";
  return (
    <div className="bg-surface2 border border-border rounded p-3">
      <div className="text-[10px] text-muted font-mono uppercase tracking-wider">{label}</div>
      <div className={`text-xl font-bold font-mono mt-1 ${cls}`}>
        {rate !== null ? `${rate.toFixed(1)}%` : "–"}
      </div>
      {s && (
        <div className="text-[10px] text-faint font-mono mt-0.5">
          {s.hits}/{s.n} Treffer
        </div>
      )}
    </div>
  );
}

export default function FundamentalTrack() {
  const [pair, setPair] = useState("EUR_USD");
  const [range, setRange] = useState<RangeKey>("52");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Custom-Range erst laden, wenn beide Daten gesetzt sind (url=null = warten).
  const url = useMemo(() => trackUrl(pair, range, from, to), [pair, range, from, to]);

  // Stale-first: letzter Stand sofort aus localStorage, Refresh im Hintergrund.
  const { data: track, error, loading } = useCachedFetch<Track>(`ft:${url}`, url);

  const biasCls = (b: string) =>
    b === "long" ? "text-up" : b === "short" ? "text-down" : "text-muted";

  const rangeLabel =
    range === "custom"
      ? from && to
        ? `${from} – ${to}`
        : "Von/Bis wählen"
      : `letzte ${RANGE_PRESETS.find((r) => r.key === range)?.label}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Pair">
          <Select value={pair} onChange={(e) => setPair(e.target.value)}>
            {FX_INSTRUMENTS.map((i) => (
              <option key={i.instrument} value={i.instrument}>
                {i.displayName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Zeitraum">
          <Select value={range} onChange={(e) => setRange(e.target.value as typeof range)}>
            {RANGE_PRESETS.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
        {range === "custom" && (
          <>
            <Field label="Von">
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="bg-surface2 border border-border rounded px-2 py-1.5 text-sm font-mono"
              />
            </Field>
            <Field label="Bis">
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="bg-surface2 border border-border rounded px-2 py-1.5 text-sm font-mono"
              />
            </Field>
          </>
        )}
        <span className="text-[11px] text-muted pb-2">
          {rangeLabel} · Baseline (Zins+Saison), as-of
        </span>
      </div>

      {error ? (
        <Panel>
          <p className="p-5 text-sm text-down font-mono">
            Track konnte nicht geladen werden ({error}) — Backend wach?
          </p>
        </Panel>
      ) : url === null ? (
        <Panel>
          <p className="p-5 text-sm text-muted">Von- und Bis-Datum wählen.</p>
        </Panel>
      ) : loading ? (
        <Panel>
          <SkeletonRows rows={6} />
        </Panel>
      ) : !track || track.weeks.length === 0 ? (
        <Panel>
          <p className="p-5 text-sm text-muted">
            Keine Wochen-Daten für {pair}. (Panel-Daten fehlen oder Backend im Kaltstart.)
          </p>
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <RateTile label="Trefferquote 1W" s={track.summary.h1} />
            <RateTile label="Trefferquote 4W" s={track.summary.h4} />
            <div className="bg-surface2 border border-border rounded p-3">
              <div className="text-[10px] text-muted font-mono uppercase tracking-wider">Basis</div>
              <div className="text-xl font-bold font-mono mt-1">{track.base_ccy}</div>
            </div>
            <div className="bg-surface2 border border-border rounded p-3">
              <div className="text-[10px] text-muted font-mono uppercase tracking-wider">Quote</div>
              <div className="text-xl font-bold font-mono mt-1">{track.quote_ccy}</div>
            </div>
          </div>

          <p className="text-[11px] text-faint leading-relaxed">
            Bias = long wenn Basis stark (Q5) / Quote schwach (Q1), short umgekehrt. Treffer = Kurs lief
            in Bias-Richtung (✓ grün / ✗ rot). Neutrale Wochen (○) zählen nicht in die Quote. 1W/4W =
            Forward-Fenster ab Wochen-Start. Nur Q5/Q1-Extreme tragen echte Edge (Labor: Q5 4W ≈ 57.6%).
          </p>

          <div className="overflow-x-auto rounded border border-border/50">
            <table className="w-full text-[11px] font-mono">
              <thead className="bg-surface2">
                <tr className="text-[9px] text-faint uppercase tracking-wider">
                  <th className="text-left px-2 py-1.5">Woche</th>
                  <th className="text-left px-2 py-1.5">{track.base_ccy} (Basis)</th>
                  <th className="text-left px-2 py-1.5">{track.quote_ccy} (Quote)</th>
                  <th className="text-left px-2 py-1.5">Bias</th>
                  <th className="text-left px-2 py-1.5">1W</th>
                  <th className="text-left px-2 py-1.5">4W</th>
                </tr>
              </thead>
              <tbody>
                {[...track.weeks].reverse().map((w) => (
                  <tr key={w.week_start} className="border-t border-border/40">
                    <td className="px-2 py-1.5 text-muted">{w.week_start}</td>
                    <td className="px-2 py-1.5">
                      <QCell ccy={track.base_ccy} q={w.base_q} score={w.base_score} />
                    </td>
                    <td className="px-2 py-1.5">
                      <QCell ccy={track.quote_ccy} q={w.quote_q} score={w.quote_score} />
                    </td>
                    <td className={`px-2 py-1.5 font-bold ${biasCls(w.bias)}`}>{w.bias.toUpperCase()}</td>
                    <td className="px-2 py-1.5">
                      <HitCell ret={w.ret_1w} hit={w.hit_1w} />
                    </td>
                    <td className="px-2 py-1.5">
                      <HitCell ret={w.ret_4w} hit={w.hit_4w} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
