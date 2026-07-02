import type { ScreenerVerdict } from "@/lib/calc/screenerReasoning";

/** Pair-Screener: nur Signale mit ≥2 gleichgerichteten Faktoren, Begründung aufklappbar. */
export default function ScreenerPanel({ verdicts }: { verdicts: ScreenerVerdict[] }) {
  const signals = verdicts.filter((v) => v.direction !== null);
  const rest = verdicts.filter((v) => v.direction === null);

  return (
    <div className="space-y-1.5">
      {signals.length === 0 && (
        <p className="text-muted text-sm py-4 text-center">
          Aktuell kein Pair mit ≥2 gleichgerichteten Faktoren.
        </p>
      )}

      {signals.map((v) => (
        <details
          key={v.instrument}
          className="group bg-surface2 border border-border rounded open:border-border2"
        >
          <summary className="flex items-center gap-3 px-3 py-2 cursor-pointer list-none">
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-black tracking-widest ${
                v.direction === "LONG" ? "bg-up/15 text-up" : "bg-down/15 text-down"
              }`}
            >
              {v.direction}
            </span>
            <span className="font-mono font-bold text-[13px]">{v.displayName}</span>
            <span className="flex-1 text-[11px] text-muted truncate">
              {v.factors.filter((f) => f.dir === (v.direction === "LONG" ? 1 : -1)).map((f) => f.name).join(" + ")}
            </span>
            <span className="text-[10px] font-mono text-faint">
              {v.alignedCount}/{v.factors.length} Faktoren
            </span>
            <i className="ph-bold ph-caret-down text-muted text-xs group-open:rotate-180 transition-transform" />
          </summary>
          <div className="px-3 pb-3 pt-1 border-t border-border/50 space-y-1.5">
            <p className="text-[12px] leading-relaxed">{v.summary}</p>
            {v.factors.map((f) => (
              <div key={f.name} className="flex items-start gap-2 text-[11px]">
                <span
                  className={`shrink-0 mt-0.5 w-14 font-bold font-mono ${
                    f.dir === 1 ? "text-up" : f.dir === -1 ? "text-down" : "text-faint"
                  }`}
                >
                  {f.dir === 1 ? "LONG" : f.dir === -1 ? "SHORT" : "–"}
                </span>
                <span className="text-muted">
                  <span className="text-text font-medium">{f.name}:</span> {f.text}
                </span>
              </div>
            ))}
          </div>
        </details>
      ))}

      {rest.length > 0 && (
        <details className="pt-2">
          <summary className="text-[11px] text-faint cursor-pointer">
            {rest.length} Paare ohne Signal anzeigen
          </summary>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {rest.map((v) => (
              <span
                key={v.instrument}
                className="px-2 py-0.5 rounded bg-surface2 border border-border text-[10px] font-mono text-muted"
              >
                {v.displayName}
              </span>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
