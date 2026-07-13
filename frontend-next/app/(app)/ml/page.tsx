import Panel from "@/components/layout/Panel";
import BacktestPanel from "@/components/ml/BacktestPanel";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { tryQuery } from "@/lib/data/util";
import { loadMlHealth, type HealthStatus } from "@/lib/ml/health";
import { loadBacktest } from "@/lib/ml/backtest";
import { FX_INSTRUMENTS } from "@/lib/constants/instruments";

export const dynamic = "force-dynamic";

// Backtest ist rechenintensiv (alle Snapshots × 8J Kurse) → 30 min Server-Cache.
// Key-Suffix v2: alte Cache-Version wurde vor dem 416-Wochen-Backfill berechnet
// (zeigte nur ~105 Wochen). v2 erzwingt Neuberechnung über die volle Historie.
const getBacktest = unstable_cache(
  () => tryQuery(() => loadBacktest(createServiceClient())),
  ["ml-backtest-v3"],
  { revalidate: 1800 },
);

const STATUS_UI: Record<HealthStatus, { label: string; cls: string }> = {
  ok:    { label: "OK",     cls: "bg-up/15 text-up" },
  warn:  { label: "Veraltet", cls: "bg-warn-dim text-warn" },
  fehlt: { label: "Fehlt",  cls: "bg-down/15 text-down" },
};

function StatusBadge({ status }: { status: HealthStatus }) {
  const ui = STATUS_UI[status];
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${ui.cls}`}>
      {ui.label}
    </span>
  );
}

function fmtDate(d: string | null): string {
  return d ? new Date(d).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" }) : "–";
}

export default async function Page() {
  const [health, backtest] = await Promise.all([
    tryQuery(() => loadMlHealth(createServiceClient())),
    getBacktest(),
  ]);

  if (!health) {
    return (
      <Panel title="Machine Learning — Setup nötig">
        <p className="text-muted text-sm">Supabase nicht erreichbar oder nicht konfiguriert.</p>
      </Panel>
    );
  }

  const s = health.snapshots;
  const coveragePct = Math.round((s.weeksCovered / s.expectedWeeks) * 100);
  const allSourcesOk = health.sources.every((x) => x.status === "ok");
  const snapshotsReady = s.missingWeeks.length === 0 && s.incompleteWeeks.length === 0;

  return (
    <div className="space-y-5 max-w-[1200px] mx-auto">

      <Panel
        title="Backtest-Bereitschaft"
        subtitle="Ziel: Weekly-Outlook-Signale der letzten 2 Jahre gegen echte Kursverläufe testen"
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-surface2 border border-border rounded p-3">
            <div className="text-[10px] text-muted font-mono uppercase tracking-wider">Wochen abgedeckt</div>
            <div className="text-xl font-bold font-mono mt-1">
              {s.weeksCovered}<span className="text-muted text-sm">/{s.expectedWeeks}</span>
            </div>
            <div className={`text-[11px] font-mono mt-0.5 ${coveragePct === 100 ? "text-up" : "text-down"}`}>
              {coveragePct} %{coveragePct < 100 && " — Backfill ausführen"}
            </div>
          </div>
          <div className="bg-surface2 border border-border rounded p-3">
            <div className="text-[10px] text-muted font-mono uppercase tracking-wider">Snapshot-Zeilen</div>
            <div className="text-xl font-bold font-mono mt-1">{s.totalRows}</div>
            <div className="text-[11px] text-muted font-mono mt-0.5">
              {s.backfillRows} Backfill · {s.liveRows} Live
            </div>
          </div>
          <div className="bg-surface2 border border-border rounded p-3">
            <div className="text-[10px] text-muted font-mono uppercase tracking-wider">Signal-Quote</div>
            <div className="text-xl font-bold font-mono mt-1">
              {s.signalRatePct !== null ? `${s.signalRatePct.toFixed(0)} %` : "–"}
            </div>
            <div className="text-[11px] text-muted font-mono mt-0.5">Verdicts mit Richtung</div>
          </div>
          <div className="bg-surface2 border border-border rounded p-3">
            <div className="text-[10px] text-muted font-mono uppercase tracking-wider">Aktuelle Woche</div>
            <div className="text-xl font-bold font-mono mt-1">{s.currentWeekDone ? "✓" : "—"}</div>
            <div className={`text-[11px] font-mono mt-0.5 ${s.currentWeekDone ? "text-up" : "text-muted"}`}>
              {s.currentWeekDone ? "Live-Snapshot da" : "kommt mit dem nächsten Cron"}
            </div>
          </div>
        </div>

        <div className={`mt-4 rounded border p-3 text-[13px] ${
          allSourcesOk && snapshotsReady
            ? "border-up/30 bg-up/5 text-up"
            : "border-warn/30 bg-warn-dim text-warn"
        }`}>
          {allSourcesOk && snapshotsReady ? (
            <>Alle Datenquellen aktuell, Snapshot-Historie vollständig — Backtest kann gebaut werden.</>
          ) : (
            <>
              Noch nicht bereit:{" "}
              {!allSourcesOk && "mindestens eine Datenquelle veraltet/fehlt. "}
              {s.missingWeeks.length > 0 && `${s.missingWeeks.length} Wochen ohne Snapshots (Backfill: npx tsx scripts/backfill-outlooks.mts). `}
              {s.incompleteWeeks.length > 0 && `${s.incompleteWeeks.length} Wochen unvollständig (< ${FX_INSTRUMENTS.length} Pairs).`}
            </>
          )}
        </div>
      </Panel>

      <Panel
        title="Backtest — Weekly-Outlook-Signale"
        subtitle="Trefferquote + Ø gerichtete Rendite nach 1–4 Wochen (Snapshots × echte Kurse, ~8 Jahre)"
      >
        {backtest ? (
          <BacktestPanel bt={backtest} />
        ) : (
          <p className="text-muted text-sm">Backtest lädt noch oder Daten fehlen — Backfill ausführen.</p>
        )}
      </Panel>

      <Panel
        title="Datenquellen"
        subtitle="Vollständigkeit + Aktualität aller Tabellen, aus denen die Verdicts gerechnet werden"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[10px] text-muted font-mono uppercase tracking-wider">
                <th className="pb-2 pr-4">Quelle</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4 text-right">Zeilen</th>
                <th className="pb-2 pr-4">Von</th>
                <th className="pb-2 pr-4">Bis</th>
                <th className="pb-2 pr-4 text-right">Alter</th>
                <th className="pb-2">Rolle</th>
              </tr>
            </thead>
            <tbody>
              {health.sources.map((src) => (
                <tr key={src.key} className="border-t border-border">
                  <td className="py-2.5 pr-4 font-medium">{src.label}</td>
                  <td className="py-2.5 pr-4"><StatusBadge status={src.status} /></td>
                  <td className="py-2.5 pr-4 text-right font-mono">{src.rows.toLocaleString("de-CH")}</td>
                  <td className="py-2.5 pr-4 font-mono">{fmtDate(src.from)}</td>
                  <td className="py-2.5 pr-4 font-mono">{fmtDate(src.to)}</td>
                  <td className="py-2.5 pr-4 text-right font-mono">
                    {src.ageDays === null ? "–" : src.ageDays <= 0 ? "aktuell" : `${src.ageDays} T`}
                  </td>
                  <td className="py-2.5 text-muted text-[12px]">{src.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="Snapshot-Qualität"
        subtitle="weekly_outlook_snapshots — eingefrorene Wochen-Verdicts als Backtest-Grundlage"
      >
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <div className="bg-surface2 border border-border rounded p-3">
            <div className="text-[10px] text-muted font-mono uppercase tracking-wider">Ø Faktoren (Backfill)</div>
            <div className="text-lg font-bold font-mono mt-1">
              {s.avgFactorsBackfill !== null ? s.avgFactorsBackfill.toFixed(1) : "–"}
              <span className="text-muted text-sm">/5</span>
            </div>
            <div className="text-[11px] text-muted mt-0.5">ohne Sentiment (historisch nicht verfügbar)</div>
          </div>
          <div className="bg-surface2 border border-border rounded p-3">
            <div className="text-[10px] text-muted font-mono uppercase tracking-wider">Ø Faktoren (Live)</div>
            <div className="text-lg font-bold font-mono mt-1">
              {s.avgFactorsLive !== null ? s.avgFactorsLive.toFixed(1) : "–"}
              <span className="text-muted text-sm">/5</span>
            </div>
            <div className="text-[11px] text-muted mt-0.5">inkl. Sentiment, ab Jul 2026</div>
          </div>
          <div className="bg-surface2 border border-border rounded p-3">
            <div className="text-[10px] text-muted font-mono uppercase tracking-wider">Unvollständige Wochen</div>
            <div className={`text-lg font-bold font-mono mt-1 ${s.incompleteWeeks.length === 0 ? "text-up" : "text-down"}`}>
              {s.incompleteWeeks.length}
            </div>
            <div className="text-[11px] text-muted mt-0.5">Wochen mit weniger als {FX_INSTRUMENTS.length} Pairs</div>
          </div>
        </div>

        {s.missingWeeks.length > 0 && (
          <div className="mb-4">
            <div className="text-[11px] text-muted font-mono uppercase tracking-wider mb-1.5">
              Fehlende Wochen ({s.missingWeeks.length})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {s.missingWeeks.slice(0, 24).map((w) => (
                <span key={w} className="px-1.5 py-0.5 rounded bg-down/10 text-down text-[11px] font-mono">
                  {fmtDate(w)}
                </span>
              ))}
              {s.missingWeeks.length > 24 && (
                <span className="text-muted text-[11px] font-mono self-center">
                  … +{s.missingWeeks.length - 24} weitere
                </span>
              )}
            </div>
          </div>
        )}

        {s.weekly.length > 0 ? (
          <>
            <div className="text-[11px] text-muted font-mono uppercase tracking-wider mb-1.5">
              Signale pro Woche (neueste zuerst)
            </div>
            <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="text-left text-[10px] text-muted font-mono uppercase tracking-wider sticky top-0 bg-surface">
                    <th className="pb-2 pr-4">Woche ab</th>
                    <th className="pb-2 pr-4 text-right">Pairs</th>
                    <th className="pb-2 pr-4 text-right">Signale</th>
                    <th className="pb-2">Quelle</th>
                  </tr>
                </thead>
                <tbody>
                  {[...s.weekly].reverse().slice(0, 60).map((w) => (
                    <tr key={w.week} className="border-t border-border">
                      <td className="py-1.5 pr-4 font-mono">{fmtDate(w.week)}</td>
                      <td className={`py-1.5 pr-4 text-right font-mono ${w.count < FX_INSTRUMENTS.length ? "text-down" : ""}`}>
                        {w.count}
                      </td>
                      <td className="py-1.5 pr-4 text-right font-mono">{w.signals}</td>
                      <td className="py-1.5 font-mono text-muted">{w.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-muted text-sm">
            Noch keine Snapshots. Backfill lokal ausführen:{" "}
            <code className="font-mono text-accent">npx tsx scripts/backfill-outlooks.mts</code>
          </p>
        )}
      </Panel>

    </div>
  );
}
