import type { CbMeetingRow } from "@/lib/supabase/types";
import { BANKS } from "@/lib/constants/banks";

interface ExpectationsPanelProps {
  dgs2: number | null;
  fedfunds: number | null;
  meetings: CbMeetingRow[];
}

/**
 * Markterwartungen: 2Y-vs-Leitzins-Spread (USA) als Richtungs-Proxy +
 * anstehende CB-Meetings mit gepflegtem Erwartungs-Pricing.
 */
export default function ExpectationsPanel({ dgs2, fedfunds, meetings }: ExpectationsPanelProps) {
  const spread = dgs2 !== null && fedfunds !== null ? dgs2 - fedfunds : null;
  const direction =
    spread === null
      ? "unbekannt"
      : spread < -0.25
        ? "Markt preist Zinssenkungen"
        : spread > 0.25
          ? "Markt preist Zinserhöhungen"
          : "Markt preist stabile Zinsen";

  const nextByBank = new Map<string, CbMeetingRow>();
  const today = new Date().toISOString().slice(0, 10);
  for (const m of meetings) {
    if (m.meeting_date < today) continue;
    const cur = nextByBank.get(m.bank);
    if (!cur || m.meeting_date < cur.meeting_date) nextByBank.set(m.bank, m);
  }

  return (
    <div className="space-y-4">
      <div className="bg-surface2 border border-border rounded p-3">
        <div className="text-[10px] uppercase tracking-widest text-muted mb-1">
          USA: 2Y-Rendite − Fed Funds (Erwartungs-Proxy)
        </div>
        <div className="flex items-baseline gap-3">
          <span
            className={`text-xl font-bold font-mono ${
              spread === null ? "text-faint" : spread < 0 ? "text-down" : "text-up"
            }`}
          >
            {spread !== null ? `${spread > 0 ? "+" : ""}${spread.toFixed(2)} pp` : "–"}
          </span>
          <span className="text-[12px] text-muted">{direction}</span>
        </div>
        <div className="text-[10px] text-faint font-mono mt-1">
          DGS2 {dgs2?.toFixed(2) ?? "–"} % · FEDFUNDS {fedfunds?.toFixed(2) ?? "–"} %
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted mb-2">
          Nächste Zinsentscheide (Erwartung in bps — editierbar in Supabase: cb_meetings)
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {BANKS.map((b) => {
            const m = nextByBank.get(b.bank);
            const exp = m?.expected_change_bps ?? null;
            return (
              <div key={b.bank} className="bg-surface2 border border-border rounded p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-bold font-mono">{b.bank}</span>
                  <span className="text-[10px] text-muted font-mono">{b.ccy}</span>
                </div>
                <div className="text-[12px] font-mono mt-1">
                  {m ? new Date(m.meeting_date).toLocaleDateString("de-DE") : "–"}
                </div>
                <div
                  className={`text-[12px] font-bold font-mono ${
                    exp === null || exp === 0 ? "text-muted" : exp > 0 ? "text-up" : "text-down"
                  }`}
                >
                  {exp === null ? "n/a" : exp === 0 ? "±0 bps" : `${exp > 0 ? "+" : ""}${exp} bps`}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
