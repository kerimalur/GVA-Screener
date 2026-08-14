import { createServiceClient } from "@/lib/supabase/server";
import { loadOutlookRows, OUTLOOK_FACTORS, FACTOR_SHORT } from "@/lib/ml/backtest";
import {
  MITGELIEFERT, fenster, werteAus, bilanziere, gruppiere, vorschlaege,
  basisWaehrung, monat,
  type Strategie, type Treffer, type Bilanz, type Vorschlag,
} from "@/lib/strategien/regeln";
import { Panel, Kennzahl, Chip, Balken, Leer, Ohne, cx } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Strategien — GVA Labor" };

/**
 * Strategien — trägt eine Regel über zehn Jahre?
 *
 * Die Seite hat eine Eigenschaft, die den meisten Backtest-Oberflächen fehlt:
 * **Sie zeigt nicht alles, was sie weiss.**
 *
 * Gerechnet wird auf dem Entwicklungsfenster (−10 Jahre bis vor 2 Jahren).
 * Die letzten zwei Jahre bleiben zu — Kerim spielt sie von Hand im
 * KerimOS-Backtest durch, ohne die Zahl vorher gesehen zu haben. Das ist der
 * einzige Weg, eine Regel ehrlich zu prüfen: Wer eine Strategie so lange
 * anpasst, bis sie auf allen Daten gut aussieht, hat die Daten auswendig
 * gelernt und merkt es erst mit echtem Geld.
 *
 * Deshalb steht neben jeder Verbesserung, wie viele Signale sie kostet. Eine
 * Trefferquote, die von 54 auf 71 Prozent springt, weil vier Signale
 * wegfallen, ist keine Verbesserung — sie ist eine Zufallszahl mit besserem
 * Marketing.
 */

/* ------------------------------------------------------------------ */

const pct = (v: number | null, n = 1) => (v === null ? "·" : `${v.toFixed(n)} %`);
const sig = (v: number | null, n = 2) =>
  v === null ? "·" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(n)}`;

function quoteTon(q: number | null): "up" | "down" | "neutral" {
  if (q === null) return "neutral";
  return q >= 55 ? "up" : q <= 45 ? "down" : "neutral";
}

/** Wie eine Strategie gelesen wird — Faktoren als Kette von Zeichen. */
function Regel({ s }: { s: Strategie }) {
  const teile = s.bedingungen
    .map((b, i) => ({ b, name: FACTOR_SHORT[OUTLOOK_FACTORS[i]] ?? OUTLOOK_FACTORS[i] }))
    .filter((x) => x.b === 1 || x.b === -1);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {teile.map((t) => (
        <Chip key={t.name} ton={t.b === 1 ? "up" : "down"} mono>
          {t.b === 1 ? "▲" : "▼"} {t.name}
        </Chip>
      ))}
      <span className="text-[11px] text-faint">
        ab {s.minTreffer} von {teile.length} · {s.horizont} W halten
        {s.pairs.length > 0 && ` · nur ${s.pairs.length} Paare`}
      </span>
    </div>
  );
}

/** Kennzahlen einer Bilanz — überall gleich, damit man sie vergleichen kann. */
function BilanzZeile({ b }: { b: Bilanz }) {
  return (
    <div className="grid gap-5 sm:grid-cols-3 lg:grid-cols-6">
      <Kennzahl label="Signale" wert={b.n} sub={`${b.gewinne} W · ${b.verluste} L`} />
      <Kennzahl
        label="Trefferquote"
        wert={pct(b.trefferquote, 1)}
        ton={quoteTon(b.trefferquote)}
      />
      <Kennzahl
        label="Ø je Signal"
        wert={b.schnitt === null ? "·" : `${sig(b.schnitt)} %`}
        ton={b.schnitt === null ? "neutral" : b.schnitt > 0 ? "up" : "down"}
      />
      <Kennzahl
        label="Profitfaktor"
        wert={b.profitFaktor === null ? "·" : b.profitFaktor.toFixed(2)}
        ton={b.profitFaktor !== null && b.profitFaktor >= 1.3 ? "up" : "neutral"}
        sub="Gewinn ÷ Verlust"
      />
      <Kennzahl
        label="Ø Gewinn / Verlust"
        wert={
          b.schnittGewinn === null
            ? "·"
            : `${sig(b.schnittGewinn, 1)} / ${sig(b.schnittVerlust, 1)}`
        }
        sub="in Prozent"
      />
      <Kennzahl
        label="Max. Rückgang"
        wert={`${b.maxRueckgang.toFixed(1)} %`}
        ton={b.maxRueckgang > Math.abs(b.gesamt) ? "down" : "neutral"}
        sub="grösster Einbruch der Kurve"
      />
    </div>
  );
}

/** Was Gewinne von Verlusten unterscheidet — je Gruppe eine Zeile. */
function Aufschluesselung({
  titel, treffer, nach, basis,
}: {
  titel: string;
  treffer: Treffer[];
  nach: (t: Treffer) => string;
  basis: number | null;
}) {
  const gruppen = gruppiere(treffer, nach).filter((g) => g.bilanz.n >= 3);
  if (gruppen.length === 0) {
    return (
      <div>
        <div className="lbl mb-2">{titel}</div>
        <p className="text-[11.5px] text-faint">Zu wenige Signale je Gruppe.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="lbl mb-2">{titel}</div>
      <div className="space-y-1.5">
        {gruppen.slice(0, 10).map((g) => {
          const q = g.bilanz.trefferquote ?? 0;
          const ab = basis === null ? 0 : q - basis;
          return (
            <div key={g.schluessel} className="flex items-center gap-2.5">
              <span className="num w-14 shrink-0 text-[11.5px] text-muted">{g.schluessel}</span>
              <span className="num w-9 shrink-0 text-right text-[11px] text-faint">
                {g.bilanz.n}×
              </span>
              <div className="min-w-0 flex-1">
                <Balken
                  pct={q}
                  farbe={q >= 55 ? "var(--color-up)" : q <= 45 ? "var(--color-down)" : "var(--color-neutral)"}
                />
              </div>
              <span className="num w-11 shrink-0 text-right text-[11.5px] text-muted">
                {q.toFixed(0)}%
              </span>
              <span
                className={cx(
                  "num w-12 shrink-0 text-right text-[11px]",
                  ab > 2 ? "text-up" : ab < -2 ? "text-down" : "text-faint",
                )}
                title="Abweichung von der Trefferquote der Strategie"
              >
                {ab === 0 ? "·" : sig(ab, 0)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Vorschlaege({ liste }: { liste: Vorschlag[] }) {
  if (liste.length === 0) {
    return (
      <p className="text-[12px] leading-relaxed text-faint">
        Kein Filter, der die Trefferquote um mindestens vier Punkte hebt und dabei
        genug Signale übrig lässt. Das ist ein gutes Zeichen: Die Regel hat keine
        offensichtliche Schwachstelle, die man wegschneiden könnte — und keine
        Gelegenheit, sich selbst zu betrügen.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {liste.map((v) => (
        <div
          key={v.titel}
          className="rounded-[var(--radius-cell)] border border-line bg-surface2 p-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] font-medium text-text">{v.titel}</span>
            <Chip ton={v.belastbar ? "up" : "stale"} mono>
              {v.vorher.toFixed(0)} → {v.nachher.toFixed(0)} %
            </Chip>
            {!v.belastbar && (
              <Chip ton="stale" title="Wenige Signale betroffen — kann Zufall sein.">
                dünn
              </Chip>
            )}
          </div>
          <p className="mt-1 text-[11.5px] leading-snug text-muted">{v.begruendung}</p>
          <p className="mt-1 text-[11px] text-faint">
            {v.nRest} Signale bleiben, {v.nWeg} fallen weg.
          </p>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default async function StrategienSeite({
  searchParams,
}: {
  searchParams: Promise<{ s?: string }>;
}) {
  const sp = await searchParams;
  const db = createServiceClient();
  const daten = await loadOutlookRows(db);

  const heute = new Date().toISOString().slice(0, 10);
  const f = fenster(heute);

  const strategien = MITGELIEFERT;
  const gewaehlt = strategien.find((s) => s.id === sp.s) ?? strategien[0];

  // Alle Strategien im Entwicklungsfenster — für die Übersichtsliste.
  const alle = strategien.map((s) => {
    const t = werteAus(s, daten.rows, daten.horizons, f.entwicklung);
    return { s, t, b: bilanziere(t) };
  });

  const aktiv = alle.find((x) => x.s.id === gewaehlt.id) ?? alle[0];
  const tipps = vorschlaege(aktiv.t);

  const wochen = new Set(daten.rows.filter((r) => r.w >= f.entwicklung.von && r.w < f.entwicklung.bis).map((r) => r.w));

  return (
    <div className="anim-fade mx-auto max-w-[1600px] space-y-4 py-1">
      {/* Die Fenster — steht ganz oben, weil davon alles abhängt */}
      <Panel lit>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Kennzahl
            label="Entwicklungsfenster"
            wert={`${f.entwicklung.von.slice(0, 4)} – ${f.entwicklung.bis.slice(0, 4)}`}
            gross
            ton="accent"
            sub={`${wochen.size} Wochen · hier darf gesucht werden`}
          />
          <Kennzahl
            label="Prüfungsfenster"
            wert={`${f.pruefung.von.slice(0, 4)} – heute`}
            gross
            sub="bleibt zu — dein Backtest in KerimOS"
          />
          <Kennzahl
            label="Datenbasis"
            wert={daten.rows.length.toLocaleString("de-CH")}
            gross
            sub={`Wochen-Snapshots · Kurse ${daten.priceFrom ?? "?"} bis ${daten.priceTo ?? "?"}`}
          />
          <Kennzahl
            label="Strategien"
            wert={strategien.length}
            gross
            sub="mitgeliefert — eigene folgen"
          />
        </div>
      </Panel>

      {/* Auswahl */}
      <Panel
        title="Strategien"
        hint="Alle im Entwicklungsfenster gerechnet. Klicken wählt aus."
        flush
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-line">
                <th className="lbl px-3 py-2 text-left">Strategie</th>
                <th className="lbl px-3 py-2 text-left">Regel</th>
                <th className="lbl px-3 py-2 text-right">Signale</th>
                <th className="lbl px-3 py-2 text-right">Treffer</th>
                <th className="lbl px-3 py-2 text-right">Ø</th>
                <th className="lbl px-3 py-2 text-right">PF</th>
                <th className="lbl px-3 py-2 text-right">Rückgang</th>
              </tr>
            </thead>
            <tbody>
              {alle.map(({ s, b }) => {
                const an = s.id === aktiv.s.id;
                return (
                  <tr
                    key={s.id}
                    className={cx(
                      "border-b border-line/60 last:border-b-0",
                      an ? "bg-accent-dim" : "hover:bg-surface2",
                    )}
                  >
                    <td className="px-3 py-2.5">
                      <a href={`/strategien?s=${s.id}`} className="block">
                        <div className={cx("font-medium", an ? "text-text" : "text-muted")}>
                          {s.name}
                        </div>
                        <div className="text-[11px] text-faint">{s.these}</div>
                      </a>
                    </td>
                    <td className="px-3 py-2.5"><Regel s={s} /></td>
                    <td className="num px-3 py-2.5 text-right text-muted">{b.n}</td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={cx("num font-semibold",
                        quoteTon(b.trefferquote) === "up" ? "text-up"
                          : quoteTon(b.trefferquote) === "down" ? "text-down" : "text-muted")}>
                        {pct(b.trefferquote, 0)}
                      </span>
                    </td>
                    <td className="num px-3 py-2.5 text-right text-muted">
                      {b.schnitt === null ? <Ohne /> : `${sig(b.schnitt)} %`}
                    </td>
                    <td className="num px-3 py-2.5 text-right text-muted">
                      {b.profitFaktor === null ? <Ohne /> : b.profitFaktor.toFixed(2)}
                    </td>
                    <td className="num px-3 py-2.5 text-right text-muted">
                      {b.maxRueckgang.toFixed(0)} %
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Die gewählte Strategie */}
      <Panel
        title={aktiv.s.name}
        hint={aktiv.s.these}
        right={<Regel s={aktiv.s} />}
      >
        {aktiv.b.n === 0 ? (
          <Leer>
            Diese Regel hat im Entwicklungsfenster nie gefeuert. Entweder sind die
            Bedingungen zu streng, oder ein beteiligter Faktor fehlt in der
            Historie — die Datenlage sagt, welcher.
          </Leer>
        ) : (
          <BilanzZeile b={aktiv.b} />
        )}
      </Panel>

      {aktiv.b.n > 0 && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              title="Woran es liegt"
              hint="Trefferquote je Gruppe, rechts die Abweichung vom Schnitt der Strategie."
            >
              <div className="space-y-5">
                <Aufschluesselung
                  titel="Nach Basiswährung"
                  treffer={aktiv.t}
                  nach={basisWaehrung}
                  basis={aktiv.b.trefferquote}
                />
                <Aufschluesselung
                  titel="Nach Zustimmung"
                  treffer={aktiv.t}
                  nach={(t) => `${t.konfluenz} Faktoren`}
                  basis={aktiv.b.trefferquote}
                />
                <Aufschluesselung
                  titel="Nach Richtung"
                  treffer={aktiv.t}
                  nach={(t) => (t.richtung === 1 ? "Long" : "Short")}
                  basis={aktiv.b.trefferquote}
                />
                <Aufschluesselung
                  titel="Nach Monat"
                  treffer={aktiv.t}
                  nach={monat}
                  basis={aktiv.b.trefferquote}
                />
              </div>
            </Panel>

            <Panel
              title="Was man ändern könnte"
              hint="Aus den Daten abgeleitet — und deshalb mit Vorsicht zu geniessen."
              right={`${tipps.length} Vorschläge`}
            >
              <Vorschlaege liste={tipps} />
              <p className="mt-4 border-t border-line pt-3 text-[11.5px] leading-relaxed text-faint">
                Jeder dieser Filter wurde im Nachhinein gefunden. Wer aus 28 Paaren
                die drei schlechtesten streicht, verbessert die Zahl immer — auch
                bei reinem Zufall. Als „dünn" markierte Vorschläge betreffen so
                wenige Signale, dass sie nichts beweisen. Der einzige echte Test
                ist das Prüfungsfenster, und den machst du von Hand.
              </p>
            </Panel>
          </div>

          <Panel title="Letzte Signale" hint="Die jüngsten 25 im Entwicklungsfenster." flush>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-[12.5px]">
                <thead>
                  <tr className="border-b border-line">
                    <th className="lbl px-3 py-2 text-left">Woche</th>
                    <th className="lbl px-3 py-2 text-left">Paar</th>
                    <th className="lbl px-3 py-2 text-left">Richtung</th>
                    <th className="lbl px-3 py-2 text-right">Zustimmung</th>
                    <th className="lbl px-3 py-2 text-right">Rendite</th>
                  </tr>
                </thead>
                <tbody>
                  {[...aktiv.t]
                    .sort((a, b) => b.woche.localeCompare(a.woche))
                    .slice(0, 25)
                    .map((t, i) => (
                      <tr key={`${t.woche}-${t.instrument}-${i}`}
                        className="border-b border-line/60 last:border-b-0 hover:bg-surface2">
                        <td className="num px-3 py-2 text-muted">{t.woche}</td>
                        <td className="num px-3 py-2 text-text">{t.instrument.replace("_", "/")}</td>
                        <td className="px-3 py-2">
                          <Chip ton={t.richtung === 1 ? "up" : "down"}>
                            {t.richtung === 1 ? "long" : "short"}
                          </Chip>
                        </td>
                        <td className="num px-3 py-2 text-right text-muted">{t.konfluenz}</td>
                        <td className="px-3 py-2 text-right">
                          <span className={cx("num", t.gewonnen ? "text-up" : "text-down")}>
                            {sig(t.rendite)} %
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}

      {/* Warum das Prüfungsfenster zu bleibt */}
      <Panel title="Warum die letzten zwei Jahre hier fehlen">
        <div className="grid gap-5 text-[12.5px] leading-relaxed text-muted sm:grid-cols-2">
          <div className="space-y-2.5">
            <p>
              Alles auf dieser Seite ist auf dem Fenster{" "}
              <span className="num text-text">{f.entwicklung.von}</span> bis{" "}
              <span className="num text-text">{f.entwicklung.bis}</span> gerechnet.
              Die Zeit danach kommt nicht vor — auch nicht versteckt in einem
              Mittelwert.
            </p>
            <p>
              Das ist kein fehlendes Feature. Sobald eine Zahl aus dem
              Prüfungsfenster sichtbar wird, fliesst sie in die nächste
              Entscheidung ein: Man verwirft eine Regel, weil sie dort schlecht
              aussah, und behält eine andere. Nach drei Runden ist das Fenster
              genauso überangepasst wie der Rest — nur merkt man es nicht mehr.
            </p>
          </div>
          <div className="space-y-2.5">
            <p>
              Der Ablauf ist deshalb: Regel hier entwickeln, Regel aufschreiben,
              und dann im{" "}
              <a href="https://kerimos.vercel.app/trading/backtest"
                className="text-accent-soft hover:underline">
                KerimOS-Backtest
              </a>{" "}
              die letzten zwei Jahre von Hand durchspielen — ohne vorher zu
              wissen, was herauskommen soll.
            </p>
            <p className="text-faint">
              Dieselbe Disziplin steckt schon in der ML-Engine: Der Holdout dort
              zählt jeden Blick mit und fragt ab dem zweiten Lauf nach. Was für
              das Modell gilt, gilt für eine Regel genauso.
            </p>
          </div>
        </div>
      </Panel>
    </div>
  );
}
