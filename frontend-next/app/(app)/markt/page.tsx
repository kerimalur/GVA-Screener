import { createServiceClient } from "@/lib/supabase/server";
import { loadTerminalData } from "@/lib/data/terminal";
import { loadRankingData } from "@/lib/ml/ranking";
import {
  baueLage, baueAllePaare, baueQuellen, FAKTOREN,
  type WaehrungsLage, type PaarLage, type Quelle,
} from "@/lib/markt/lage";
import { Panel, Kennzahl, Chip, Richtung, Waage, Leer, Ohne, Frische, cx } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Markt — GVA Labor" };

/**
 * Markt — die fundamentale Lage auf einer Seite.
 *
 * Ersetzt Macro Terminal, Real Yield, COT Intelligence, Weekly und
 * Saisonalität. Diese fünf Seiten hatten je für sich recht, aber sie
 * beantworteten fünfmal dieselbe Frage aus fünf Blickwinkeln — und den
 * Vergleich musste man im Kopf machen.
 *
 * Der Aufbau folgt drei Fragen in dieser Reihenfolge:
 *
 *   1. Kann ich den Zahlen trauen?   → Aktualität der vier Quellen, ganz oben
 *   2. Wo widerspricht sich etwas?   → strittige Währungen, direkt darunter
 *   3. Wo ist die Lage eindeutig?    → Matrix und Paare, nach Klarheit sortiert
 *
 * Frage 1 steht zuerst, weil eine veraltete Quelle jede Aussage darunter
 * wertlos macht. Frage 2 vor Frage 3, weil ein Widerspruch mehr wert ist als
 * eine Bestätigung: Er zeigt, wo die eigene Meinung tatsächlich gebraucht wird.
 */

/* ------------------------------------------------------------------ */

function nettoText(n: number | null): string {
  return n === null ? "·" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(2)}`;
}

const REGIME_FARBE: Record<string, string> = {
  GOLDILOCKS: "text-[var(--color-regime-goldilocks)]",
  REFLATION: "text-[var(--color-regime-reflation)]",
  STAGFLATION: "text-[var(--color-regime-stagflation)]",
  OVERHEATING: "text-[var(--color-regime-overheating)]",
  DISINFLATION: "text-[var(--color-regime-disinflation)]",
};

const REGIME_TEXT: Record<string, string> = {
  GOLDILOCKS: "Wachstum ohne Inflationsdruck",
  REFLATION: "Erholung aus der Schwäche",
  STAGFLATION: "schwaches Wachstum, hohe Inflation",
  OVERHEATING: "Wachstum mit Inflationsdruck",
  DISINFLATION: "nachlassendes Wachstum, fallende Inflation",
};

/* ------------------------------------------------------------------ */
/* Aktualität                                                          */
/* ------------------------------------------------------------------ */

function QuellenLeiste({ quellen }: { quellen: Quelle[] }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-panel)] border border-line bg-line sm:grid-cols-4">
      {quellen.map((q) => (
        <div key={q.key} className="bg-surface px-3.5 py-3" title={q.takt}>
          <div className="lbl">{q.label}</div>
          <div className="mt-1.5 flex items-center gap-2">
            <Frische
              datum={q.stand}
              stufe={{ warnAb: q.warnAb, altAb: q.altAb }}
              label={q.label}
            />
            <span className="num text-[11px] text-faint">{q.stand ?? "—"}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Widerspruch                                                         */
/* ------------------------------------------------------------------ */

function Streit({ lagen }: { lagen: WaehrungsLage[] }) {
  const strittig = lagen
    .filter((l) => l.strittig)
    .sort((a, b) => (a.einigkeit ?? 1) - (b.einigkeit ?? 1));

  if (strittig.length === 0) {
    return (
      <Leer>
        Keine Währung, bei der Faktoren gegeneinander stehen. Das ist selten —
        und meist ein Zeichen dafür, dass eine Quelle fehlt statt dass alle
        einer Meinung sind. Ein Blick auf die Lücken lohnt sich.
      </Leer>
    );
  }

  return (
    <div className="space-y-2.5">
      {strittig.map((l) => {
        const pro = l.faktoren.filter((f) => f.dir === 1);
        const contra = l.faktoren.filter((f) => f.dir === -1);
        return (
          <div
            key={l.ccy}
            className="rounded-[var(--radius-cell)] border border-line bg-surface2 p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[15px]">{l.flag}</span>
              <span className="num text-[14px] font-semibold text-text">{l.ccy}</span>
              <Chip ton="stale">
                {l.dafuer} dafür · {l.dagegen} dagegen
              </Chip>
              <span className="num ml-auto text-[12px] text-muted">
                Einigkeit {l.einigkeit === null ? "·" : `${Math.round(l.einigkeit * 100)} %`}
              </span>
            </div>

            <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
              <div>
                <div className="lbl mb-1 text-up">spricht für Stärke</div>
                <ul className="space-y-1">
                  {pro.map((f) => (
                    <li key={f.key} className="text-[11.5px] leading-snug text-muted">
                      <span className="text-text">{f.label}</span> — {f.text}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="lbl mb-1 text-down">spricht für Schwäche</div>
                <ul className="space-y-1">
                  {contra.map((f) => (
                    <li key={f.key} className="text-[11.5px] leading-snug text-muted">
                      <span className="text-text">{f.label}</span> — {f.text}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Matrix                                                              */
/* ------------------------------------------------------------------ */

function Zelle({ dir, text }: { dir: -1 | 0 | 1; text: string }) {
  return (
    <td className="px-2 py-2 text-center" title={text}>
      <Richtung dir={dir} />
    </td>
  );
}

function Matrix({ lagen }: { lagen: WaehrungsLage[] }) {
  const sortiert = [...lagen].sort((a, b) => (b.netto ?? -9) - (a.netto ?? -9));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-line">
            <th className="lbl px-3 py-2 text-left">Währung</th>
            {FAKTOREN.map((f) => (
              <th key={f.key} className="lbl px-2 py-2 text-center" title={f.quelle}>
                {f.kurz}
              </th>
            ))}
            <th className="lbl px-3 py-2 text-right">Netto</th>
            <th className="lbl px-3 py-2 text-left">Verteilung</th>
            <th className="lbl px-3 py-2 text-right">Einig</th>
            <th className="lbl px-3 py-2 text-left">Regime</th>
          </tr>
        </thead>
        <tbody>
          {sortiert.map((l) => (
            <tr
              key={l.ccy}
              className={cx(
                "border-b border-line/60 transition-colors last:border-b-0 hover:bg-surface2",
                l.strittig && "bg-stale-dim/30",
              )}
            >
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-[14px]">{l.flag}</span>
                  <span className="num font-semibold text-text">{l.ccy}</span>
                  {l.luecken.length > 0 && (
                    <Chip ton="neutral" title={`ohne: ${l.luecken.join(", ")}`}>
                      −{l.luecken.length}
                    </Chip>
                  )}
                </div>
              </td>

              {l.faktoren.map((f) => (
                <Zelle key={f.key} dir={f.dir} text={`${f.label}: ${f.text}`} />
              ))}

              <td className="px-3 py-2 text-right">
                <span
                  className={cx(
                    "num font-semibold",
                    l.richtung === 1 ? "text-up" : l.richtung === -1 ? "text-down" : "text-muted",
                  )}
                >
                  {nettoText(l.netto)}
                </span>
              </td>

              <td className="px-3 py-2">
                <div className="w-24">
                  <Waage wert={l.netto} />
                </div>
              </td>

              <td className="px-3 py-2 text-right">
                <span
                  className={cx(
                    "num",
                    l.einigkeit === null ? "text-faint"
                      : l.einigkeit === 1 ? "text-text"
                        : l.einigkeit <= 0.34 ? "text-stale" : "text-muted",
                  )}
                >
                  {l.einigkeit === null ? "·" : `${Math.round(l.einigkeit * 100)}%`}
                </span>
              </td>

              <td className="px-3 py-2">
                {l.regime ? (
                  <span
                    className={cx("text-[11px]", REGIME_FARBE[l.regime])}
                    title={REGIME_TEXT[l.regime]}
                  >
                    {l.regime.toLowerCase()}
                  </span>
                ) : (
                  <Ohne titel="Regime braucht CLI und CPI" />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Paare                                                               */
/* ------------------------------------------------------------------ */

function PaarZeile({ p }: { p: PaarLage }) {
  return (
    <tr className="border-b border-line/60 transition-colors last:border-b-0 hover:bg-surface2">
      <td className="px-3 py-2">
        <span className="num font-semibold text-text">
          {p.basis}<span className="text-faint">/</span>{p.quote}
        </span>
      </td>

      <td className="px-3 py-2">
        {p.richtung === 0 ? (
          <Chip ton="neutral">kein Vorteil</Chip>
        ) : (
          <Chip ton={p.richtung === 1 ? "up" : "down"}>
            {p.richtung === 1 ? "long" : "short"}
          </Chip>
        )}
      </td>

      {p.faktoren.map((f) => (
        <td key={f.key} className="px-2 py-2 text-center"
          title={`${f.label} — ${p.basis} ${f.basisDir === 1 ? "stark" : f.basisDir === -1 ? "schwach" : "neutral"}, ${p.quote} ${f.quoteDir === 1 ? "stark" : f.quoteDir === -1 ? "schwach" : "neutral"}`}>
          <Richtung dir={f.paarDir} size={11} />
        </td>
      ))}

      <td className="px-3 py-2 text-right">
        <span
          className={cx(
            "num",
            p.richtung === 1 ? "text-up" : p.richtung === -1 ? "text-down" : "text-muted",
          )}
        >
          {nettoText(p.spanne)}
        </span>
      </td>

      <td className="px-3 py-2 text-right">
        {p.gerichtet === 0 ? (
          <Ohne titel="kein Faktor zeigt eine Richtung" />
        ) : p.strittig ? (
          <Chip ton="stale" title={`${p.dafuer} für long, ${p.dagegen} für short`}>
            {p.dafuer}:{p.dagegen}
          </Chip>
        ) : (
          <Chip ton="neutral" title={`${p.gerichtet} Faktoren, alle einig`}>
            {p.gerichtet}/5 einig
          </Chip>
        )}
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ */

export default async function MarktSeite() {
  const db = createServiceClient();

  const [terminal, ranking] = await Promise.all([
    loadTerminalData(db),
    loadRankingData(),
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

  const staerkste = [...lagen].sort((a, b) => (b.netto ?? -9) - (a.netto ?? -9))[0];
  const schwaechste = [...lagen].sort((a, b) => (a.netto ?? 9) - (b.netto ?? 9))[0];
  const strittige = lagen.filter((l) => l.strittig).length;
  const klarste = paare.find((p) => p.richtung !== 0 && !p.strittig) ?? null;

  return (
    <div className="anim-fade mx-auto max-w-[1600px] space-y-4 py-1">
      {/* 1 — Kann ich den Zahlen trauen? */}
      <QuellenLeiste quellen={quellen} />

      {/* Kopfzahlen */}
      <Panel lit>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Kennzahl
            label="Stärkste Währung"
            wert={staerkste ? `${staerkste.flag} ${staerkste.ccy}` : "·"}
            ton="up"
            gross
            sub={staerkste ? `Netto ${nettoText(staerkste.netto)} · ${staerkste.dafuer} von 5 Faktoren dafür` : undefined}
          />
          <Kennzahl
            label="Schwächste Währung"
            wert={schwaechste ? `${schwaechste.flag} ${schwaechste.ccy}` : "·"}
            ton="down"
            gross
            sub={schwaechste ? `Netto ${nettoText(schwaechste.netto)} · ${schwaechste.dagegen} von 5 Faktoren dagegen` : undefined}
          />
          <Kennzahl
            label="Klarstes Paar"
            wert={klarste ? `${klarste.basis}/${klarste.quote}` : "keins"}
            ton={klarste?.richtung === 1 ? "up" : klarste?.richtung === -1 ? "down" : "neutral"}
            gross
            sub={
              klarste
                ? `${klarste.richtung === 1 ? "long" : "short"} · ${klarste.gerichtet} Faktoren, keiner dagegen`
                : "kein Paar ohne Widerspruch"
            }
          />
          <Kennzahl
            label="Strittig"
            wert={`${strittige} / ${lagen.length}`}
            ton={strittige > 3 ? "stale" : "neutral"}
            gross
            sub="Währungen, bei denen Faktoren gegeneinander stehen"
          />
        </div>
      </Panel>

      {/* 2 — Wo widerspricht sich etwas? */}
      <Panel
        title="Widerspruch"
        hint="Wo die Faktoren uneins sind. Diese Stellen brauchen deine Meinung — die einigen brauchen sie nicht."
        right={`${strittige} von ${lagen.length}`}
      >
        <Streit lagen={lagen} />
      </Panel>

      {/* 3a — Die Matrix */}
      <Panel
        title="Währungen"
        hint="Fünf Faktoren nebeneinander. ▲ spricht für Stärke, ▼ für Schwäche, — bedeutet: kein Ausschlag. Fahr über ein Zeichen für die Begründung."
        right="nach Netto sortiert"
        flush
      >
        <Matrix lagen={lagen} />
      </Panel>

      {/* 3b — Die Paare */}
      <Panel
        title="Paare"
        hint="Nach Klarheit sortiert: grosse Spanne bei hoher Einigkeit zuerst. Was unten steht, ist nicht falsch — es ist nur nichts."
        right={`${paare.length} Paare`}
        flush
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-line">
                <th className="lbl px-3 py-2 text-left">Paar</th>
                <th className="lbl px-3 py-2 text-left">Lage</th>
                {FAKTOREN.map((f) => (
                  <th key={f.key} className="lbl px-2 py-2 text-center" title={f.quelle}>
                    {f.kurz}
                  </th>
                ))}
                <th className="lbl px-3 py-2 text-right">Spanne</th>
                <th className="lbl px-3 py-2 text-right">Konsens</th>
              </tr>
            </thead>
            <tbody>
              {paare.map((p) => <PaarZeile key={p.pair} p={p} />)}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Lesehilfe */}
      <Panel title="Wie das zu lesen ist">
        <div className="grid gap-5 text-[12.5px] leading-relaxed text-muted sm:grid-cols-2">
          <div className="space-y-2.5">
            <p>
              <strong className="text-text">Netto</strong> ist der Mittelwert der
              vorhandenen Faktoren, <strong className="text-text">Einigkeit</strong> sagt,
              wie geschlossen sie auftreten. Beides zusammen ergibt erst ein Bild:
              +0.40 bei 100 % Einigkeit ist eine Lage, +0.40 bei 33 % ist ein Streit,
              den der Mittelwert zufällig gewonnen hat.
            </p>
            <p>
              Die <strong className="text-text">Spanne</strong> eines Paares ist die
              Differenz der beiden Netto-Werte. Ein Paar ist immer ein Vergleich —
              zwei starke Währungen gegeneinander ergeben kein Setup.
            </p>
            <p>
              <strong className="text-text">−2</strong> hinter einer Währung heisst:
              zwei der fünf Quellen antworten nicht. Das Urteil beruht dann auf drei
              Faktoren und ist entsprechend weniger wert.
            </p>
          </div>
          <div className="space-y-2.5">
            <p>
              Der <strong className="text-text">Q-Score</strong> gibt nur bei Q5 und Q1
              eine Richtung. Q2 bis Q4 heisst Mittelfeld — darauf setzt man nichts.
              Dieselbe strenge Regel gilt im Backend und in KerimOS.
            </p>
            <p>
              Das <strong className="text-text">Regime</strong> ist reine Einordnung
              und fliesst in keinen Score ein. Es beantwortet „in welcher Welt bewegt
              sich diese Währung gerade", nicht „kaufen oder verkaufen".
            </p>
            <p className="text-faint">
              Diese Seite sagt nicht, was zu tun ist. Sie sagt, was die Daten sagen
              und wo sie sich widersprechen. Der Einstieg kommt aus der GVA-Linie in
              KerimOS — hier steht nur, ob der Wind von vorne oder von hinten kommt.
            </p>
          </div>
        </div>
      </Panel>
    </div>
  );
}
