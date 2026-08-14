/**
 * Wie gut lag das Wochen-Ranking wirklich?
 *
 * Die Engine schreibt jeden Sonntag ein Ranking der acht Währungen. Sobald
 * der Horizont abgelaufen ist, trägt `run_weekly` in `ml_weekly_rankings.hit`
 * ein, ob die Richtung stimmte. Diese Datei macht aus diesen Häkchen eine
 * Aussage — oder stellt fest, dass es noch keine gibt.
 *
 * ========================= WARUM DAS SO STRENG IST =========================
 *
 * Eine Trefferquote ohne Konfidenzintervall ist keine Zahl, sondern eine
 * Stimmung. Bei 20 Prognosen liegt schon reiner Zufall in einem Viertel der
 * Fälle bei 60 Prozent oder besser. Wer dann „60 %" liest, hält eine Münze
 * für ein Modell.
 *
 * Deshalb liefert jede Quote hier drei Dinge zusammen:
 *   • die Quote selbst
 *   • ein 95-%-Intervall nach Wilson (robust auch bei kleinem n, anders als
 *     die Normal-Näherung, die bei n<30 Intervalle über 100 % ausgibt)
 *   • ein Urteil, das die Null-Hypothese ernst nimmt: **Schliesst das
 *     Intervall 50 % ein, gibt es keinen Nachweis.** Auch bei 58 %.
 *
 * Und die eigentlich interessante Zahl ist nicht die Quote des Champions,
 * sondern sein ABSTAND zur Baseline. Ein Modell, das 55 % trifft, während
 * die simple Zins-plus-Saison-Regel 56 % trifft, ist kein Fortschritt,
 * sondern teurer Stillstand.
 *
 * ===========================================================================
 *
 * Rein: keine Datenbank, keine Zeit, kein React.
 */

export interface RankingErgebnis {
  /** 'YYYY-MM-DD' — Woche, für die prognostiziert wurde. */
  week_start: string;
  model: string;
  ccy: string;
  /** Stärke-Quintil 1…5 der Prognose. */
  strength_quintile: number | null;
  /** true = Richtung stimmte. Null = Horizont noch offen. */
  hit: boolean | null;
}

export interface Quote {
  n: number;
  treffer: number;
  /** 0…1. Null bei n = 0. */
  quote: number | null;
  /** 95-%-Wilson-Intervall, jeweils 0…1. */
  unten: number | null;
  oben: number | null;
  /**
   * true, wenn das Intervall die 50 % NICHT einschliesst — also ein
   * messbarer Unterschied zum Münzwurf.
   */
  nachweisbar: boolean;
}

export const LEERE_QUOTE: Quote = {
  n: 0, treffer: 0, quote: null, unten: null, oben: null, nachweisbar: false,
};

/**
 * Wilson-Konfidenzintervall für einen Anteil.
 *
 * Bewusst Wilson und nicht die Normal-Näherung: Letztere liefert bei kleinem
 * n oder Quoten nahe 0/1 Grenzen ausserhalb von [0,1] — ein Intervall, das
 * bis 108 % reicht, macht jede Diskussion darüber sinnlos, ob 55 % viel ist.
 *
 * z = 1.96 für 95 Prozent.
 */
export function wilson(treffer: number, n: number, z = 1.96): { unten: number; oben: number } {
  if (n <= 0) return { unten: 0, oben: 1 };
  const p = treffer / n;
  const nenner = 1 + (z * z) / n;
  const mitte = p + (z * z) / (2 * n);
  const spanne = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return {
    unten: Math.max(0, (mitte - spanne) / nenner),
    oben: Math.min(1, (mitte + spanne) / nenner),
  };
}

export function quote(ergebnisse: RankingErgebnis[]): Quote {
  const bewertet = ergebnisse.filter((e) => e.hit !== null);
  const n = bewertet.length;
  if (n === 0) return LEERE_QUOTE;

  const treffer = bewertet.filter((e) => e.hit === true).length;
  const { unten, oben } = wilson(treffer, n);

  return {
    n, treffer,
    quote: treffer / n,
    unten, oben,
    // Nur wenn das GANZE Intervall über oder unter 50 % liegt.
    nachweisbar: unten > 0.5 || oben < 0.5,
  };
}

/* ------------------------------------------------------------------ */
/* Zeitfenster                                                         */
/* ------------------------------------------------------------------ */

export const FENSTER = [
  { wochen: 4, label: "4 Wochen" },
  { wochen: 13, label: "Quartal" },
  { wochen: 26, label: "Halbjahr" },
  { wochen: 52, label: "Jahr" },
  { wochen: 0, label: "gesamt" },
] as const;

export type FensterWochen = (typeof FENSTER)[number]["wochen"];

/**
 * Die letzten `wochen` Kalenderwochen, gemessen an der jüngsten bewerteten
 * Woche — nicht an heute.
 *
 * Das ist wichtig: Der Horizont beträgt bis zu vier Wochen, die jüngsten
 * Prognosen sind also noch offen. Würde man ab heute zurückzählen, fiele das
 * Fenster teilweise in unbewertetes Land und die Stichprobe wäre kleiner,
 * als sie aussieht.
 */
export function letzteWochen(
  ergebnisse: RankingErgebnis[],
  wochen: number,
): RankingErgebnis[] {
  const bewertet = ergebnisse.filter((e) => e.hit !== null);
  if (wochen <= 0 || bewertet.length === 0) return bewertet;

  const wochenListe = [...new Set(bewertet.map((e) => e.week_start))].sort();
  const ab = wochenListe[Math.max(0, wochenListe.length - wochen)];
  return bewertet.filter((e) => e.week_start >= ab);
}

export interface ModellVergleich {
  fenster: string;
  wochen: number;
  champion: Quote;
  baseline: Quote;
  /** Champion minus Baseline in Prozentpunkten. Null, wenn eine Seite leer ist. */
  vorsprung: number | null;
  /**
   * Ist der Vorsprung mehr als Rauschen? Streng: die Intervalle dürfen sich
   * nicht überlappen. Das ist konservativer als ein formaler Test — und
   * genau richtig für eine Zahl, auf die Geld gesetzt werden soll.
   */
  vorsprungBelegt: boolean;
}

export function vergleiche(
  ergebnisse: RankingErgebnis[],
  wochen: number,
  label: string,
): ModellVergleich {
  const fenster = letzteWochen(ergebnisse, wochen);
  const champion = quote(fenster.filter((e) => e.model === "champion"));
  const baseline = quote(fenster.filter((e) => e.model === "baseline"));

  const vorsprung =
    champion.quote !== null && baseline.quote !== null
      ? (champion.quote - baseline.quote) * 100
      : null;

  const belegt =
    champion.unten !== null && baseline.oben !== null && champion.unten > baseline.oben;

  return { fenster: label, wochen, champion, baseline, vorsprung, vorsprungBelegt: belegt };
}

/* ------------------------------------------------------------------ */
/* Nur die Extreme                                                     */
/* ------------------------------------------------------------------ */

/**
 * Trefferquote getrennt nach Q5/Q1 und Mittelfeld.
 *
 * Gehandelt werden nur die Extreme — Q2 bis Q4 gelten überall als „keine
 * Richtung". Wenn das Modell etwas taugt, muss sich das genau hier zeigen:
 * Die Extreme müssen besser liegen als das Mittelfeld. Tun sie es nicht,
 * ist das Quintil keine Rangfolge, sondern Dekoration.
 */
export function nachQuintil(ergebnisse: RankingErgebnis[]): {
  extreme: Quote;
  mittelfeld: Quote;
  /** Abstand in Prozentpunkten. Null, wenn eine Seite leer ist. */
  abstand: number | null;
} {
  const istExtrem = (e: RankingErgebnis) =>
    e.strength_quintile === 5 || e.strength_quintile === 1;

  const extreme = quote(ergebnisse.filter(istExtrem));
  const mittelfeld = quote(ergebnisse.filter((e) => !istExtrem(e) && e.strength_quintile !== null));

  return {
    extreme,
    mittelfeld,
    abstand:
      extreme.quote !== null && mittelfeld.quote !== null
        ? (extreme.quote - mittelfeld.quote) * 100
        : null,
  };
}

/* ------------------------------------------------------------------ */
/* Verlauf                                                             */
/* ------------------------------------------------------------------ */

export interface WochenPunkt {
  week_start: string;
  n: number;
  treffer: number;
  /** Quote dieser Woche, 0…1. */
  quote: number;
  /** Gleitende Quote über die letzten 13 Wochen, 0…1. */
  gleitend: number | null;
}

/**
 * Trefferquote Woche für Woche, plus gleitender Schnitt.
 *
 * Die Einzelwoche schwankt zwangsläufig stark — acht Währungen ergeben acht
 * Prognosen, da sind 62,5 % und 37,5 % Nachbarwerte. Die gleitende Linie ist
 * das, was man tatsächlich liest; die Punkte zeigen nur, wie viel Rauschen
 * darunter liegt.
 */
export function verlauf(ergebnisse: RankingErgebnis[], modell = "champion", fenster = 13): WochenPunkt[] {
  const bewertet = ergebnisse.filter((e) => e.hit !== null && e.model === modell);

  const proWoche = new Map<string, { n: number; treffer: number }>();
  for (const e of bewertet) {
    const w = proWoche.get(e.week_start) ?? { n: 0, treffer: 0 };
    w.n += 1;
    if (e.hit) w.treffer += 1;
    proWoche.set(e.week_start, w);
  }

  const wochen = [...proWoche.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week_start, w]) => ({ week_start, ...w, quote: w.treffer / w.n }));

  return wochen.map((w, i) => {
    const von = Math.max(0, i - fenster + 1);
    const teil = wochen.slice(von, i + 1);
    const n = teil.reduce((a, x) => a + x.n, 0);
    const treffer = teil.reduce((a, x) => a + x.treffer, 0);
    return {
      ...w,
      // Erst ab halbem Fenster eine Linie zeichnen — davor wäre sie nur eine
      // andere Darstellung derselben zwei Punkte.
      gleitend: teil.length >= Math.ceil(fenster / 2) && n > 0 ? treffer / n : null,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Urteil                                                              */
/* ------------------------------------------------------------------ */

export type Urteil = "kein-material" | "kein-nachweis" | "traegt" | "schlechter";

export function urteile(v: ModellVergleich): { urteil: Urteil; satz: string } {
  if (v.champion.n < 30) {
    return {
      urteil: "kein-material",
      satz: `Nur ${v.champion.n} bewertete Prognosen — zu wenig für eine Aussage. Ab etwa 30 lohnt sich der Blick.`,
    };
  }
  if (v.champion.quote !== null && v.champion.oben !== null && v.champion.oben < 0.5) {
    return {
      urteil: "schlechter",
      satz: `Das Modell liegt messbar unter dem Münzwurf (${(v.champion.quote * 100).toFixed(1)} %, Obergrenze ${(v.champion.oben * 100).toFixed(1)} %). Das ist ein Ergebnis, kein Ausfall — die Richtung ist offenbar systematisch verkehrt.`,
    };
  }
  if (!v.champion.nachweisbar) {
    return {
      urteil: "kein-nachweis",
      satz: `${(v.champion.quote! * 100).toFixed(1)} % bei n=${v.champion.n} — das Intervall (${(v.champion.unten! * 100).toFixed(1)} bis ${(v.champion.oben! * 100).toFixed(1)} %) schliesst 50 % ein. Kein Nachweis eines Vorteils, auch wenn die Zahl über 50 steht.`,
    };
  }
  if (!v.vorsprungBelegt && v.vorsprung !== null) {
    return {
      urteil: "kein-nachweis",
      satz: `Über dem Münzwurf, aber nicht über der Baseline: ${v.vorsprung > 0 ? "+" : ""}${v.vorsprung.toFixed(1)} Punkte bei überlappenden Intervallen. Die einfache Regel tut dasselbe.`,
    };
  }
  return {
    urteil: "traegt",
    satz: `${(v.champion.quote! * 100).toFixed(1)} % bei n=${v.champion.n}, Intervall komplett über 50 %${v.vorsprung !== null ? ` und ${v.vorsprung.toFixed(1)} Punkte über der Baseline` : ""}. Das ist ein messbarer Effekt.`,
  };
}
