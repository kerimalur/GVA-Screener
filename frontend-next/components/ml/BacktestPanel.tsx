import type { BacktestResult, BacktestBucket, HorizonStat } from "@/lib/ml/backtest";

function hitCls(v: number | null): string {
  if (v === null) return "text-faint";
  if (v >= 55) return "text-up";
  if (v <= 45) return "text-down";
  return "text-muted";
}
function retCls(v: number | null): string {
  if (v === null) return "text-faint";
  return v > 0 ? "text-up" : v < 0 ? "text-down" : "text-muted";
}
function fmtPct(v: number | null, digits = 0): string {
  return v === null ? "–" : `${v.toFixed(digits)}%`;
}
function fmtRet(v: number | null): string {
  return v === null ? "–" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}

/** Zwei Zellen (Trefferquote + Ø Rendite) je Horizont. */
function HorizonCells({ h }: { h: HorizonStat }) {
  return (
    <>
      <td className={`py-1.5 px-2 text-right font-mono ${hitCls(h.hitRate)}`}>
        {fmtPct(h.hitRate)}
        {h.n > 0 && <span className="text-faint text-[10px]"> ({h.n})</span>}
      </td>
      <td className={`py-1.5 px-2 text-right font-mono ${retCls(h.avgReturnPct)}`}>
        {fmtRet(h.avgReturnPct)}
      </td>
    </>
  );
}

function BucketTable({
  label,
  rows,
  firstCol,
}: {
  label: string;
  rows: BacktestBucket[];
  firstCol: string;
}) {
  return (
    <div>
      <div className="text-[11px] text-muted font-mono uppercase tracking-wider mb-1.5">{label}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] min-w-[560px]">
          <thead>
            <tr className="text-[9px] text-faint font-mono uppercase tracking-wider">
              <th className="text-left pb-1.5 px-2">{firstCol}</th>
              <th className="text-right pb-1.5 px-2">Sig.</th>
              {[1, 2, 3, 4].map((w) => (
                <th key={w} colSpan={2} className="text-right pb-1.5 px-2">
                  {w}W (Treffer · Ø)
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.key} className="border-t border-border">
                <td className="py-1.5 px-2 font-medium">{b.key}</td>
                <td className="py-1.5 px-2 text-right font-mono text-muted">{b.signals}</td>
                {b.horizons.map((h) => (
                  <HorizonCells key={h.horizon} h={h} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function BacktestPanel({ bt }: { bt: BacktestResult }) {
  if (bt.signalsTotal === 0) {
    return (
      <p className="text-muted text-sm">
        Keine Signale in den Snapshots — erst Backfill ausführen (Cron „fundamentals“).
      </p>
    );
  }

  const overallAsBucket: BacktestBucket[] = [
    { key: "Alle Signale", signals: bt.overall[0].n, horizons: bt.overall },
  ];

  return (
    <div className="space-y-5">
      {/* Kennzahlen-Kopf */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-surface2 border border-border rounded p-3">
          <div className="text-[10px] text-muted font-mono uppercase tracking-wider">Signale gesamt</div>
          <div className="text-xl font-bold font-mono mt-1">{bt.signalsTotal.toLocaleString("de-CH")}</div>
          <div className="text-[11px] text-muted font-mono mt-0.5">{bt.weeksCovered} Wochen</div>
        </div>
        {bt.overall.map((h) => (
          <div key={h.horizon} className="bg-surface2 border border-border rounded p-3">
            <div className="text-[10px] text-muted font-mono uppercase tracking-wider">
              Treffer {h.horizon}W
            </div>
            <div className={`text-xl font-bold font-mono mt-1 ${hitCls(h.hitRate)}`}>
              {fmtPct(h.hitRate, 1)}
            </div>
            <div className={`text-[11px] font-mono mt-0.5 ${retCls(h.avgReturnPct)}`}>
              Ø {fmtRet(h.avgReturnPct)}
            </div>
          </div>
        ))}
      </div>

      <BucketTable label="Gesamt nach Horizont" rows={overallAsBucket} firstCol="" />
      <BucketTable
        label="Nach Faktor-Konfluenz — lohnt sich ab wie vielen gleichgerichteten Faktoren?"
        rows={bt.byAligned}
        firstCol="Konfluenz"
      />
      <BucketTable label="Nach Basiswährung des Pairs" rows={bt.byCurrency} firstCol="Währung" />

      <details>
        <summary className="cursor-pointer text-[11px] text-muted font-mono uppercase tracking-wider hover:text-text transition-colors select-none">
          Nach Pair (28) — aufklappen
        </summary>
        <div className="mt-2">
          <BucketTable label="Sortiert nach 4W-Trefferquote" rows={bt.byInstrument} firstCol="Pair" />
        </div>
      </details>

      <p className="text-[11px] text-faint leading-relaxed border-t border-border/50 pt-3">{bt.note}</p>
    </div>
  );
}
