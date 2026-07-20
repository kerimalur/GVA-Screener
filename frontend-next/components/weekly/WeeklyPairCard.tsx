import type { WeeklyPairCard as CardData } from "@/lib/data/weekly";
import { flowLabel } from "@/lib/calc/cotDelta";
import { TerminalCard } from "@/components/ui/terminal";
import OutlookPrefillButton from "./OutlookPrefillButton";

// KEIN LONG/SHORT-Urteil und keine „X/Y Faktoren gleichgerichtet"-Konfluenz mehr:
// der aggregierte 5-Faktor-Screener-Verdict ist out-of-sample widerlegt
// (~50 % gesamt, Alle-4-Kombi 47,4 %, COT-NC schädlich). Die Einzel-Faktoren
// bleiben als FAKTEN sichtbar, nur ohne gerichtetes Gesamturteil. Details:
// lib/weekly/sort.ts. Nicht „aus Versehen" wieder ein Verdict/Signal einbauen.

function fmtSigned(v: number | null | undefined, digits = 1, suffix = ""): string {
  if (v === null || v === undefined) return "–";
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}${suffix}`;
}

/** ISO-Kalenderwoche eines ISO-Datums (YYYY-MM-DD). */
function isoWeek(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
}

function flowCls(v: number | null | undefined): string {
  if (v === null || v === undefined) return "text-faint";
  return v > 0 ? "text-up" : v < 0 ? "text-down" : "text-muted";
}

function FlowRow({ ccy, flow, percentile }: {
  ccy: string;
  flow: CardData["baseFlow"];
  percentile: number | null;
}) {
  return (
    <div className="flex items-baseline gap-2 font-mono text-[11px]">
      <span className="font-bold w-8">{ccy}</span>
      <span className={`font-bold ${flowCls(flow?.delta4wPctOi)}`}>
        {fmtSigned(flow?.delta4wPctOi, 1, "%")}
      </span>
      <span className="text-faint">4W-Flow</span>
      {flow && flow.streakWeeks >= 3 && flow.direction !== 0 && (
        <span className={flow.direction > 0 ? "text-up" : "text-down"}>
          {flow.direction > 0 ? "↑" : "↓"}{flow.streakWeeks}W
        </span>
      )}
      <span className="text-faint ml-auto" title={flowLabel(flow?.deltaPercentile ?? null)}>
        {percentile !== null ? `Niveau ${percentile.toFixed(0)}.` : "–"}
      </span>
    </div>
  );
}

/** Dossier-Karte eines FX-Pairs fürs Sonntagabend-Cockpit. */
export default function WeeklyPairCard({ card }: { card: CardData }) {
  const journalSymbol = card.instrument.replace("_", "");

  return (
    <TerminalCard className="space-y-2.5 flex flex-col">
      {/* Header — reine Fakten, kein LONG/SHORT-Urteil */}
      <div className="flex items-center gap-2">
        <span className="font-bold text-[14px]">{card.displayName}</span>
        {card.inPlay.length > 0 && (
          <span
            className="px-1.5 py-0.5 rounded-(--radius-tag) text-[9px] font-bold font-mono bg-warn-dim text-warn border border-warn/50"
            title="Drift-Event (CPI/NFP/Zinsentscheid) in den letzten 7 Tagen"
          >
            ⚡ IN PLAY: {card.inPlay.join("+")}
          </span>
        )}
        {card.signalWeeks !== null && card.signalSince && (
          <span
            className="ml-auto text-[9px] font-mono text-faint border border-border/60 rounded px-1.5 py-0.5"
            title={`Aufgezeichnete Screener-Richtung unverändert seit KW ${isoWeek(card.signalSince)} (${new Date(card.signalSince).toLocaleDateString("de-DE")}) — Fakt, keine Empfehlung`}
          >
            unverändert seit {card.signalWeeks}W · KW{isoWeek(card.signalSince)}
          </span>
        )}
      </div>

      {/* COT-Flow beider Währungen */}
      <div className="space-y-1 border border-border/60 rounded p-2 bg-surface/40">
        <div className="text-[9px] uppercase tracking-widest text-faint mb-1">
          Smart-Money-Flow (Δ % Open Interest)
        </div>
        <FlowRow ccy={card.base} flow={card.baseFlow} percentile={card.basePercentile} />
        <FlowRow ccy={card.quote} flow={card.quoteFlow} percentile={card.quotePercentile} />
      </div>

      {/* Saison + Sentiment */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-mono">
        {card.season && (
          <span className={card.season.avgReturn >= 0 ? "text-up" : "text-down"}>
            Saison {fmtSigned(card.season.avgReturn, 2, "%")} ({card.season.hitRate.toFixed(0)}% pos, {card.season.years}J)
          </span>
        )}
        {card.sentimentLongPct !== null && (
          <span className="text-muted">
            Retail {card.sentimentLongPct.toFixed(0)}% long
            {card.sentimentDeltaPp !== null && (
              <span className={card.sentimentDeltaPp > 0 ? "text-up" : card.sentimentDeltaPp < 0 ? "text-down" : "text-faint"}>
                {" "}({fmtSigned(card.sentimentDeltaPp, 0)}pp/W)
              </span>
            )}
          </span>
        )}
      </div>

      {/* Events + CB-Meetings der Woche */}
      {(card.events.length > 0 || card.meetings.length > 0) && (
        <div className="space-y-0.5 text-[11px]">
          {card.meetings.map((m) => (
            <div key={`${m.bank}-${m.meetingDate}`} className="text-warn font-mono">
              🏛 {m.bank}-Sitzung {new Date(m.meetingDate).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}
              {m.expectedChangeBps !== null && m.expectedChangeBps !== 0 && ` (erw. ${m.expectedChangeBps > 0 ? "+" : ""}${m.expectedChangeBps} bps)`}
            </div>
          ))}
          {card.events.slice(0, 4).map((e, i) => (
            <div key={i} className={`font-mono ${e.drift ? "text-warn" : "text-muted"}`}>
              {e.drift ? "⚡" : "·"} {e.currency}{" "}
              {new Date(e.eventTime).toLocaleDateString("de-DE", { weekday: "short" })} {e.title}
            </div>
          ))}
          {card.events.length > 4 && (
            <div className="text-faint font-mono">… +{card.events.length - 4} weitere High-Impact-Events</div>
          )}
        </div>
      )}

      {/* Faktoren-Details (nativ aufklappbar, kein JS) — Einzelfakten, KEINE
          aggregierte „X/Y gleichgerichtet"-Konfluenz (out-of-sample widerlegt). */}
      <details className="text-[11px]">
        <summary className="cursor-pointer text-muted hover:text-text transition-colors select-none">
          {card.verdict.factors.length} Faktoren im Detail
        </summary>
        <ul className="mt-1.5 space-y-1">
          {card.verdict.factors.map((f) => (
            <li key={f.name} className="flex gap-1.5 leading-snug">
              <span className={f.dir === 1 ? "text-up" : f.dir === -1 ? "text-down" : "text-faint"}>
                {f.dir === 1 ? "▲" : f.dir === -1 ? "▼" : "•"}
              </span>
              <span className="text-muted">
                <span className="font-bold text-text">{f.name}:</span> {f.text}
              </span>
            </li>
          ))}
        </ul>
      </details>

      {/* Footer */}
      <div className="mt-auto pt-1">
        <OutlookPrefillButton
          prefill={{
            symbol: journalSymbol,
            // KEINE vorbelegte Richtung aus einem unvalidierten Signal — der Trader
            // entscheidet die Richtung selbst; nur die Faktenlage wird übergeben.
            direction: null,
            fundamental: card.fundamentalText,
          }}
        />
      </div>
    </TerminalCard>
  );
}
