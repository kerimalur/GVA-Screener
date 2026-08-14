import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { loadTerminalData } from "@/lib/data/terminal";
import { loadRankingData } from "@/lib/ml/ranking";
import { loadLetzteEngineNacht } from "@/lib/nav/launcherServer";
import { baueLage, baueAllePaare, baueQuellen } from "@/lib/markt/lage";
import { Panel, Kennzahl, Chip, Frische, Leer, cx } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Übersicht — GVA Labor" };

/**
 * Übersicht — was sich seit dem letzten Blick geändert hat.
 *
 * Der frühere Launcher war eine Liste der Modi: fünf Türen mit je einem
 * Zähler daneben. Das beantwortete „wohin kann ich gehen", aber nicht
 * „muss ich überhaupt". Bei sechs Seiten in der Kopfzeile ist eine
 * Türenliste ohnehin überflüssig.
 *
 * Diese Seite beantwortet stattdessen vier Fragen, und wenn nichts los ist,
 * ist sie fast leer — das ist das Ziel, nicht ein Mangel:
 *
 *   Läuft die Engine noch?      → letzte Nacht, mit Alter
 *   Sind die Daten frisch?      → die Quelle mit dem grössten Rückstand
 *   Wo ist die Lage eindeutig?  → das klarste Paar
 *   Wo widerspricht sich etwas? → Anzahl strittiger Währungen
 */

function begruessung(): string {
  const h = Number(
    new Intl.DateTimeFormat("de-CH", { hour: "numeric", hour12: false, timeZone: "Europe/Zurich" })
      .format(new Date()),
  );
  if (h < 5) return "Noch wach";
  if (h < 11) return "Guten Morgen";
  if (h < 18) return "Guten Tag";
  return "Guten Abend";
}

function datumLabel(): string {
  return new Intl.DateTimeFormat("de-CH", {
    weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Zurich",
  }).format(new Date());
}

function tageSeit(datum: string | null): number | null {
  if (!datum) return null;
  return Math.floor((Date.now() - new Date(datum).getTime()) / 86_400_000);
}

/** Ein Weg weiter — gross genug zum Treffen, ruhig genug zum Übersehen. */
function Weg({ href, titel, zeile }: { href: string; titel: string; zeile: string }) {
  return (
    <Link
      href={href}
      className={cx(
        "group flex items-center gap-3 rounded-[var(--radius-cell)] border border-line",
        "bg-surface2 px-3.5 py-3 transition-colors hover:border-accent-line hover:bg-surface",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-text">{titel}</div>
        <div className="text-[11.5px] text-faint">{zeile}</div>
      </div>
      <span className="text-[13px] text-faint transition-colors group-hover:text-accent-soft">→</span>
    </Link>
  );
}

export default async function Uebersicht() {
  const db = createServiceClient();

  const [terminal, ranking, nacht] = await Promise.all([
    loadTerminalData(db),
    loadRankingData(),
    loadLetzteEngineNacht(),
  ]);

  const rankingByCcy = new Map(ranking.champion.map((r) => [r.ccy, r]));
  const lagen = terminal.currencies.map((c) => baueLage(c, rankingByCcy.get(c.ccy)));
  const paare = baueAllePaare(lagen);

  const quellen = baueQuellen({
    cotDatum: terminal.latestCotDate,
    sentimentDatum: terminal.sentimentAge,
    rankingDatum: ranking.updatedAt ? ranking.updatedAt.slice(0, 10) : null,
    makroDatum: terminal.generatedAt ? terminal.generatedAt.slice(0, 10) : null,
  });

  // Die Quelle mit dem grössten Rückstand relativ zu ihrer eigenen Schwelle.
  // Absolute Tage wären irreführend: 6 Tage sind bei COT normal und bei
  // Retail ein Ausfall.
  const rueckstand = quellen
    .map((q) => {
      const t = tageSeit(q.stand);
      return { q, t, quote: t === null ? 99 : t / q.altAb };
    })
    .sort((a, b) => b.quote - a.quote)[0];

  const strittige = lagen.filter((l) => l.strittig);
  const klarste = paare.find((p) => p.richtung !== 0 && !p.strittig) ?? null;
  const nachtAlter = tageSeit(nacht.night);

  const allesRuhig =
    (rueckstand?.quote ?? 0) < 1 && strittige.length === 0 && nacht.istNeu;

  return (
    <div className="anim-fade mx-auto max-w-[1200px] space-y-4 py-6">
      <div className="px-1">
        <div className="lbl">{datumLabel()}</div>
        <h1 className="mt-1.5 text-[30px] font-semibold leading-none tracking-tight text-text">
          {begruessung()}.
        </h1>
        <p className="mt-2 max-w-[560px] text-[13px] leading-relaxed text-muted">
          Labor für Machine Learning, Quant-Auswertung und Fundamentaldaten.
          Gehandelt wird nebenan in KerimOS — hier wird gemessen.
        </p>
      </div>

      <Panel lit>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Kennzahl
            label="Letzte Engine-Nacht"
            wert={
              nacht.night
                ? nachtAlter === 0 ? "heute" : nachtAlter === 1 ? "gestern" : `vor ${nachtAlter} T`
                : "keine"
            }
            ton={nacht.istNeu ? "up" : nacht.night ? "stale" : "down"}
            gross
            sub={nacht.night ?? "Suche lief noch nie durch"}
          />
          <Kennzahl
            label="Grösster Datenrückstand"
            wert={rueckstand?.q.label ?? "·"}
            ton={
              (rueckstand?.quote ?? 0) >= 1 ? "down"
                : (rueckstand?.quote ?? 0) >= 0.6 ? "stale" : "neutral"
            }
            gross
            sub={
              rueckstand?.t === null
                ? "kein Datum bekannt"
                : `${rueckstand?.t} Tage · auffällig ab ${rueckstand?.q.altAb}`
            }
          />
          <Kennzahl
            label="Klarstes Paar"
            wert={klarste ? `${klarste.basis}/${klarste.quote}` : "keins"}
            ton={klarste?.richtung === 1 ? "up" : klarste?.richtung === -1 ? "down" : "neutral"}
            gross
            sub={
              klarste
                ? `${klarste.richtung === 1 ? "long" : "short"} · ${klarste.gerichtet} Faktoren einig`
                : "kein Paar ohne Widerspruch"
            }
          />
          <Kennzahl
            label="Strittige Währungen"
            wert={`${strittige.length} / ${lagen.length}`}
            ton={strittige.length > 3 ? "stale" : "neutral"}
            gross
            sub={
              strittige.length > 0
                ? strittige.map((l) => l.ccy).join(" · ")
                : "alle Faktoren einig"
            }
          />
        </div>
      </Panel>

      {allesRuhig && (
        <Panel>
          <Leer>
            Nichts Auffälliges: Die Engine ist aktuell, alle Quellen sind frisch,
            keine Währung widerspricht sich. Eine leere Übersicht ist der
            Normalfall — das Labor meldet sich, wenn etwas nicht stimmt.
          </Leer>
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Weiter" hint="Was heute ansteht">
          <div className="space-y-2">
            <Weg
              href="/markt"
              titel="Markt"
              zeile={
                strittige.length > 0
                  ? `${strittige.length} Währungen mit Widerspruch ansehen`
                  : "Fundamentale Lage aller Währungen und Paare"
              }
            />
            <Weg
              href="/strategien"
              titel="Strategien"
              zeile="Regeln über zehn Jahre prüfen — vor dem eigenen Backtest"
            />
            <Weg
              href="/ml/engine-log"
              titel="Engine"
              zeile={
                nacht.istNeu
                  ? "neue Nacht ausgewertet"
                  : "Suche, Holdout und Baseline nachlesen"
              }
            />
            <Weg
              href="/ml/ranking"
              titel="Ranking"
              zeile="Wochenausgabe des Modells und wie oft sie zuletzt traf"
            />
          </div>
        </Panel>

        <Panel title="Quellen" hint="Jede mit ihrem eigenen Takt — die Schwellen sind nicht gleich.">
          <div className="space-y-px overflow-hidden rounded-[var(--radius-cell)] border border-line bg-line">
            {quellen.map((q) => (
              <div
                key={q.key}
                className="flex items-center gap-3 bg-surface2 px-3 py-2.5"
                title={q.takt}
              >
                <span className="min-w-0 flex-1 text-[12.5px] text-text">{q.label}</span>
                <span className="num text-[11px] text-faint">{q.stand ?? "—"}</span>
                <Frische
                  datum={q.stand}
                  stufe={{ warnAb: q.warnAb, altAb: q.altAb }}
                  label={q.label}
                />
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11.5px] leading-relaxed text-faint">
            Bernstein heisst „älter als üblich", Rot heisst „ein Lauf ist
            ausgefallen". Ein COT-Bericht darf sechs Tage alt sein; ein
            Retail-Wert nicht.
          </p>
        </Panel>
      </div>

      <div className="px-1 pb-2">
        <a
          href="https://kerimos.vercel.app/trading"
          className="text-[12px] text-faint transition-colors hover:text-accent-soft"
        >
          → Zum Handeln in KerimOS
        </a>
      </div>
    </div>
  );
}
