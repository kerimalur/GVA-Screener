import { createServiceClient } from "@/lib/supabase/server";
import { unstable_cache } from "next/cache";
import {
  vergleiche, nachQuintil, verlauf, urteile, FENSTER,
  type RankingErgebnis, type Quote, type ModellVergleich,
} from "@/lib/ml/rankingPerf";
import { Panel, Kennzahl, Chip, Leer, cx } from "@/components/ui";

/**
 * Wie gut lag das Ranking zuletzt?
 *
 * Steht bewusst GANZ OBEN auf der Ranking-Seite, vor der aktuellen
 * Wochenausgabe. Wer die Prognose liest, ohne zu wissen, wie oft sie zuletzt
 * stimmte, liest ein Horoskop.
 *
 * Jede Quote kommt mit Konfidenzintervall und einem Urteil, das die
 * Null-Hypothese ernst nimmt: Schliesst das Intervall 50 % ein, steht dort
 * „kein Nachweis" — auch bei 58 %.
 */

const ergebnisseCached = unstable_cache(
  async (): Promise<RankingErgebnis[]> => {
    const db = createServiceClient();
    const { data } = await db
      .from("ml_weekly_rankings")
      .select("week_start, model, ccy, strength_quintile, hit")
      .not("hit", "is", null)
      .order("week_start", { ascending: true });
    return (data ?? []) as unknown as RankingErgebnis[];
  },
  ["ranking-ergebnisse-v1"],
  // Neue Bewertungen entstehen wöchentlich; häufiger zu fragen bringt nichts.
  { revalidate: 900, tags: ["ml-ranking"] },
);

const pz = (q: number | null, n = 1) => (q === null ? "·" : `${(q * 100).toFixed(n)} %`);

function URTEIL_TON(u: string): "up" | "down" | "stale" | "neutral" {
  return u === "traegt" ? "up" : u === "schlechter" ? "down" : u === "kein-nachweis" ? "stale" : "neutral";
}

/** Intervall als Balken — die Breite IST die Aussage. */
function Intervall({ q }: { q: Quote }) {
  if (q.quote === null || q.unten === null || q.oben === null) {
    return <div className="h-[18px] rounded-[var(--radius-chip)] bg-surface2" />;
  }
  // Skala 25–75 %: darunter oder darüber liegt praktisch nie etwas, und ein
  // Balken über die volle Breite 0–100 macht jeden Unterschied unsichtbar.
  const zuPct = (v: number) => Math.max(0, Math.min(100, ((v - 0.25) / 0.5) * 100));
  const links = zuPct(q.unten);
  const breite = Math.max(1.5, zuPct(q.oben) - links);
  const mitte = zuPct(q.quote);
  const farbe = q.nachweisbar
    ? q.quote > 0.5 ? "var(--color-up)" : "var(--color-down)"
    : "var(--color-neutral)";

  return (
    <div className="relative h-[18px] overflow-hidden rounded-[var(--radius-chip)] bg-surface2"
      title={`${pz(q.quote)} · Intervall ${pz(q.unten)} bis ${pz(q.oben)} · n=${q.n}`}>
      {/* 50-%-Linie: die einzige Schwelle, die zählt */}
      <div className="absolute inset-y-0 left-1/2 w-px bg-line2" />
      <div className="anim-sweep absolute inset-y-[5px] rounded-full opacity-40"
        style={{ left: `${links}%`, width: `${breite}%`, background: farbe }} />
      <div className="absolute inset-y-[2px] w-[2px] rounded-full"
        style={{ left: `${mitte}%`, background: farbe }} />
    </div>
  );
}

function FensterZeile({ v }: { v: ModellVergleich }) {
  const u = urteile(v);
  return (
    <tr className="border-b border-line/60 last:border-b-0 hover:bg-surface2">
      <td className="px-3 py-2.5 text-[12.5px] text-text">{v.fenster}</td>
      <td className="num px-3 py-2.5 text-right text-muted">{v.champion.n}</td>
      <td className="px-3 py-2.5 text-right">
        <span className={cx("num font-semibold",
          v.champion.nachweisbar
            ? v.champion.quote! > 0.5 ? "text-up" : "text-down"
            : "text-muted")}>
          {pz(v.champion.quote)}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <div className="w-32"><Intervall q={v.champion} /></div>
      </td>
      <td className="num px-3 py-2.5 text-right text-muted">{pz(v.baseline.quote)}</td>
      <td className="px-3 py-2.5 text-right">
        <span className={cx("num", v.vorsprungBelegt ? "text-up" : "text-muted")}>
          {v.vorsprung === null ? "·" : `${v.vorsprung > 0 ? "+" : ""}${v.vorsprung.toFixed(1)}`}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <Chip ton={URTEIL_TON(u.urteil)} title={u.satz}>
          {u.urteil === "traegt" ? "trägt"
            : u.urteil === "schlechter" ? "verkehrt"
              : u.urteil === "kein-material" ? "zu wenig" : "kein Nachweis"}
        </Chip>
      </td>
    </tr>
  );
}

/** Gleitende Trefferquote als Sparkline — reines SVG, keine Bibliothek. */
function Linie({ punkte }: { punkte: { gleitend: number | null }[] }) {
  const werte = punkte.map((p) => p.gleitend).filter((v): v is number => v !== null);
  if (werte.length < 3) return null;

  const B = 560, H = 60;
  const min = Math.min(0.35, ...werte);
  const max = Math.max(0.65, ...werte);
  const x = (i: number) => (i / (werte.length - 1)) * B;
  const y = (v: number) => H - ((v - min) / (max - min || 1)) * H;

  const pfad = werte.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const y50 = y(0.5);

  return (
    <svg viewBox={`0 0 ${B} ${H}`} className="h-[60px] w-full" preserveAspectRatio="none">
      <line x1="0" y1={y50} x2={B} y2={y50}
        stroke="var(--color-line2)" strokeWidth="1" strokeDasharray="3 3" />
      <path d={pfad} fill="none" stroke="var(--color-accent)" strokeWidth="1.6"
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default async function PerformancePanel() {
  const ergebnisse = await ergebnisseCached();

  if (ergebnisse.length === 0) {
    return (
      <Panel title="Wie gut lag das Ranking?" hint="Trefferquote der abgelaufenen Prognosen.">
        <Leer>
          Noch keine bewertete Prognose. `run_weekly` trägt die Treffer ein,
          sobald der Horizont einer Woche abgelaufen ist — bei vier Wochen
          Horizont dauert das nach dem ersten Lauf entsprechend lange.
        </Leer>
      </Panel>
    );
  }

  const fenster = FENSTER.map((f) => vergleiche(ergebnisse, f.wochen, f.label));
  const gesamt = fenster[fenster.length - 1];
  const quartal = fenster.find((f) => f.wochen === 13) ?? gesamt;
  const nq = nachQuintil(ergebnisse.filter((e) => e.model === "champion"));
  const punkte = verlauf(ergebnisse);
  const u = urteile(gesamt);

  return (
    <Panel
      lit
      title="Wie gut lag das Ranking?"
      hint="Trefferquote der abgelaufenen Prognosen, mit 95-%-Intervall. Ein Intervall, das 50 % einschliesst, ist kein Nachweis — auch bei einer Zahl über 50."
      right={`${gesamt.champion.n} bewertete Prognosen`}
    >
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Kennzahl
          label="Gesamt"
          wert={pz(gesamt.champion.quote)}
          gross
          ton={URTEIL_TON(u.urteil)}
          sub={`Intervall ${pz(gesamt.champion.unten, 0)} – ${pz(gesamt.champion.oben, 0)}`}
        />
        <Kennzahl
          label="Letztes Quartal"
          wert={pz(quartal.champion.quote)}
          gross
          ton={quartal.champion.nachweisbar ? (quartal.champion.quote! > 0.5 ? "up" : "down") : "neutral"}
          sub={`n = ${quartal.champion.n}`}
        />
        <Kennzahl
          label="Vorsprung zur Baseline"
          wert={gesamt.vorsprung === null ? "·" : `${gesamt.vorsprung > 0 ? "+" : ""}${gesamt.vorsprung.toFixed(1)}`}
          gross
          ton={gesamt.vorsprungBelegt ? "up" : "neutral"}
          sub={gesamt.vorsprungBelegt ? "Intervalle überlappen nicht" : "Intervalle überlappen — nicht belegt"}
        />
        <Kennzahl
          label="Extreme vs. Mittelfeld"
          wert={nq.abstand === null ? "·" : `${nq.abstand > 0 ? "+" : ""}${nq.abstand.toFixed(1)}`}
          gross
          ton={nq.abstand !== null && nq.abstand > 3 ? "up" : nq.abstand !== null && nq.abstand < -3 ? "down" : "neutral"}
          sub={`Q5/Q1 ${pz(nq.extreme.quote, 0)} gegen Q2–Q4 ${pz(nq.mittelfeld.quote, 0)}`}
        />
      </div>

      <div className={cx(
        "mt-4 rounded-[var(--radius-cell)] border p-3",
        u.urteil === "traegt" ? "border-up/30 bg-up-dim"
          : u.urteil === "schlechter" ? "border-down/30 bg-down-dim"
            : "border-line bg-surface2",
      )}>
        <div className="lbl mb-1">Urteil</div>
        <p className="text-[12.5px] leading-relaxed text-muted">{u.satz}</p>
      </div>

      <div className="mt-4">
        <div className="lbl mb-1.5">Gleitende Trefferquote über 13 Wochen</div>
        <Linie punkte={punkte} />
        <p className="mt-1 text-[11px] text-faint">
          Gestrichelt: 50 %. Die Einzelwoche schwankt bei acht Prognosen zwangsläufig
          stark — deshalb die geglättete Linie.
        </p>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-line">
              <th className="lbl px-3 py-2 text-left">Fenster</th>
              <th className="lbl px-3 py-2 text-right">n</th>
              <th className="lbl px-3 py-2 text-right">Champion</th>
              <th className="lbl px-3 py-2 text-left">95-%-Intervall</th>
              <th className="lbl px-3 py-2 text-right">Baseline</th>
              <th className="lbl px-3 py-2 text-right">Δ</th>
              <th className="lbl px-3 py-2 text-left">Urteil</th>
            </tr>
          </thead>
          <tbody>
            {fenster.map((v) => <FensterZeile key={v.fenster} v={v} />)}
          </tbody>
        </table>
      </div>

      <p className="mt-3 border-t border-line pt-3 text-[11.5px] leading-relaxed text-faint">
        Die wichtigste Spalte ist <span className="text-muted">Δ</span>, nicht die
        Trefferquote. Ein Modell, das 55 % trifft, während die einfache
        Zins-plus-Saison-Regel 56 % trifft, ist kein Fortschritt. Und die Zeile
        „Extreme vs. Mittelfeld" prüft, ob das Quintil überhaupt eine Rangfolge
        ist: Gehandelt werden nur Q5 und Q1 — liegen die nicht besser als das
        Mittelfeld, ist die Einteilung Dekoration.
      </p>
    </Panel>
  );
}
