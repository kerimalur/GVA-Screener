import Panel from "@/components/layout/Panel";
import SentimentGrid, { type SentimentEntry } from "@/components/sentiment/SentimentGrid";
import SentimentHistory from "@/components/sentiment/SentimentHistory";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { tryQuery } from "@/lib/data/util";
import { getServerSettings } from "@/lib/settings/server";

export const dynamic = "force-dynamic";

// Globale Snapshots (Cron, täglich) — 5 min Server-Cache.
const getSentimentData = unstable_cache(
  () =>
    tryQuery(async () => {
      const db = createServiceClient();
      const { data: rows } = await db
        .from("sentiment_snapshots")
        .select("pair, captured_at, long_pct, short_pct, long_positions, short_positions")
        .order("captured_at", { ascending: false })
        .limit(120);

      const latest = new Map<string, SentimentEntry>();
      let capturedAt: string | null = null;
      for (const r of rows ?? []) {
        if (!latest.has(r.pair) && r.long_pct !== null) {
          latest.set(r.pair, {
            pair: r.pair,
            longPct: r.long_pct,
            shortPct: r.short_pct ?? 100 - r.long_pct,
            longPositions: r.long_positions,
            shortPositions: r.short_positions,
          });
          capturedAt = capturedAt ?? r.captured_at;
        }
      }
      return { entries: [...latest.values()], capturedAt };
    }),
  ["sentiment-data"],
  { revalidate: 300 },
);

export default async function Page() {
  const [data, settings] = await Promise.all([getSentimentData(), getServerSettings()]);
  const hi = settings.terminal.sentimentExtremePct;
  const lo = 100 - hi;

  const entries = data?.entries ?? [];
  const contrarian = entries.filter((e) => e.longPct >= hi || e.longPct <= lo);

  if (entries.length === 0) {
    return (
      <Panel title="Noch keine Sentiment-Daten">
        <p className="text-muted text-sm leading-relaxed">
          Der tägliche Cron holt Myfxbook-Community-Outlook-Snapshots und akkumuliert sie in
          Supabase. Voraussetzungen: <code className="font-mono text-accent">MYFXBOOK_EMAIL</code> /{" "}
          <code className="font-mono text-accent">MYFXBOOK_PASSWORD</code> in{" "}
          <code className="font-mono text-accent">.env.local</code> (kostenloser Account) — dann{" "}
          <code className="font-mono text-accent">npx tsx scripts/backfill.mts sentiment</code> für den
          ersten Snapshot. Fällt Myfxbook aus, degradiert die Seite sauber (Cron loggt &bdquo;skipped&ldquo;).
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-5 max-w-[1500px] mx-auto">
      <Panel
        title="Retail-Positionierung je Pair"
        subtitle={`Konträr-Indikator: überfüllte Seite rot · Stand ${
          data?.capturedAt ? new Date(data.capturedAt).toLocaleString("de-DE") : "–"
        } · Quelle Myfxbook Community Outlook`}
      >
        <SentimentGrid entries={entries} />
      </Panel>

      <Panel
        title="Konträr-Signale"
        subtitle={`Paare mit ≥${hi} % einseitiger Retail-Positionierung (Schwelle in den Einstellungen)`}
      >
        {contrarian.length === 0 ? (
          <p className="text-muted text-sm">Aktuell keine extreme Positionierung.</p>
        ) : (
          <div className="space-y-2">
            {contrarian.map((e) => {
              const crowdedLong = e.longPct >= hi;
              return (
                <div
                  key={e.pair}
                  className="flex items-center gap-3 bg-surface2 border border-border rounded px-3 py-2"
                >
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-black tracking-widest ${
                      crowdedLong ? "bg-down/15 text-down" : "bg-up/15 text-up"
                    }`}
                  >
                    KONTRÄR {crowdedLong ? "SHORT" : "LONG"}
                  </span>
                  <span className="font-mono font-bold text-[13px]">{e.pair}</span>
                  <span className="text-[12px] text-muted">
                    Retail ist {crowdedLong ? e.longPct.toFixed(0) : e.shortPct.toFixed(0)} %{" "}
                    {crowdedLong ? "long" : "short"}
                    {e.longPositions !== null && e.shortPositions !== null
                      ? ` (${(e.longPositions + e.shortPositions).toLocaleString("de-DE")} Positionen)`
                      : ""}{" "}
                    — die Mehrheit liegt an Wendepunkten häufig falsch.
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel
        title="Historischer Verlauf"
        subtitle="Retail Long-% vs. Preis — Konträr-Auswertung über Zeit (Datenbasis wächst täglich per Cron)"
      >
        <SentimentHistory pairs={entries.map((e) => e.pair)} />
      </Panel>
    </div>
  );
}
