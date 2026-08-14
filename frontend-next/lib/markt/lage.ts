import type { TerminalCurrency, Regime } from "@/lib/data/terminal";
import type { RankingRow } from "@/lib/ml/ranking";

/**
 * Die fundamentale Lage einer Währung — fünf Faktoren nebeneinander.
 *
 * Bisher lagen diese Faktoren auf vier Seiten verteilt (Macro Terminal, Real
 * Yield, COT, Saisonalität) und das Modell-Ranking auf einer fünften. Jede
 * Seite hatte für sich recht; zusammen ergaben sie kein Bild, weil man den
 * Vergleich im Kopf machen musste.
 *
 * Hier wird nur zusammengetragen und gegenübergestellt — gerechnet wird
 * nichts Neues. Die Sub-Scores kommen unverändert aus `currencyScore.ts`,
 * der Q-Score aus dem Wochen-Ranking der Engine.
 *
 * **Die eigentliche Frage ist nicht „wie stark ist EUR", sondern „sind sich
 * die Faktoren einig".** Ein Netto von +0.5 aus fünf übereinstimmenden
 * Faktoren ist etwas völlig anderes als dasselbe Netto aus drei starken
 * Pro- und zwei starken Kontra-Stimmen. Das erste ist eine Lage, das zweite
 * ein Streit. Deshalb steht `einigkeit` gleichberechtigt neben `netto`.
 *
 * Reine Funktionen, keine Datenbank, kein React — damit prüfbar.
 */

export type FaktorKey = "zinsen" | "cot" | "saison" | "retail" | "qscore";

export const FAKTOREN: { key: FaktorKey; label: string; kurz: string; quelle: string }[] = [
  { key: "zinsen", label: "Zinsen", kurz: "ZINS", quelle: "FRED · Leitzins, 10J, CB-Haltung" },
  { key: "cot",    label: "COT",    kurz: "COT",  quelle: "CFTC · Leveraged Funds, wöchentlich" },
  { key: "saison", label: "Saison", kurz: "SAIS", quelle: "Oanda · Monats-Rendite seit 2005" },
  { key: "retail", label: "Retail", kurz: "RTL",  quelle: "Myfxbook · Positionierung der Privaten" },
  { key: "qscore", label: "Q-Score", kurz: "Q",   quelle: "ML-Engine · Wochen-Ranking" },
];

export interface Faktor {
  key: FaktorKey;
  label: string;
  /** −1…+1. Null = Quelle fehlt und zählt nirgends mit. */
  score: number | null;
  dir: -1 | 0 | 1;
  /** Ein Satz: warum diese Richtung. */
  text: string;
}

export interface WaehrungsLage {
  ccy: string;
  iso: string;
  flag: string;
  faktoren: Faktor[];
  /** Wie viele Faktoren überhaupt eine Richtung zeigen (dir ≠ 0). */
  mitRichtung: number;
  dafuer: number;
  dagegen: number;
  /** Mittel der vorhandenen Scores. Null, wenn keine Quelle antwortet. */
  netto: number | null;
  richtung: -1 | 0 | 1;
  /**
   * 0…1 — wie einig sich die gerichteten Faktoren sind.
   * 1 = alle zeigen dieselbe Richtung, 0 = exakt gespalten.
   * Null, wenn kein einziger Faktor eine Richtung zeigt.
   */
  einigkeit: number | null;
  /** True, wenn mindestens zwei Faktoren gegeneinander stehen. */
  strittig: boolean;
  regime: Regime | null;
  cpiYoY: number | null;
  policyRate: number | null;
  /** Fehlende Quellen — macht sichtbar, worauf das Urteil NICHT beruht. */
  luecken: FaktorKey[];
}

/** Quintil 1…5 → Score −1…+1. Q3 ist die Mitte und damit 0. */
export function quintilScore(q: number | null | undefined): number | null {
  if (q === null || q === undefined || !Number.isFinite(q)) return null;
  return (q - 3) / 2;
}

/**
 * Richtung aus dem Quintil — bewusst nur die Extreme.
 *
 * Q4 ist „leicht überdurchschnittlich" und damit keine Aussage, auf die man
 * eine Position setzt. Dieselbe strenge Regel gilt im Backend
 * (`replay/fundamentals.py::_pair_bias`) und in KerimOS.
 */
export function quintilDir(q: number | null | undefined): -1 | 0 | 1 {
  if (q === 5) return 1;
  if (q === 1) return -1;
  return 0;
}

const SCHWELLE = 0.15;

function dirAus(score: number | null): -1 | 0 | 1 {
  if (score === null) return 0;
  return score >= SCHWELLE ? 1 : score <= -SCHWELLE ? -1 : 0;
}

export function baueLage(
  waehrung: TerminalCurrency,
  rankingRow: RankingRow | undefined,
): WaehrungsLage {
  const subs = new Map(waehrung.score.subs.map((s) => [s.key, s]));

  const q = rankingRow?.strength_quintile ?? null;
  const qScore = quintilScore(q);

  const faktoren: Faktor[] = FAKTOREN.map(({ key, label }) => {
    if (key === "qscore") {
      return {
        key, label,
        score: qScore,
        dir: quintilDir(q),
        text:
          q === null
            ? "kein Wochen-Ranking vorhanden"
            : q === 5 ? "stärkstes Fünftel der eigenen 156-Wochen-Verteilung"
            : q === 1 ? "schwächstes Fünftel der eigenen 156-Wochen-Verteilung"
            : `Quintil ${q} — im Mittelfeld, gibt keine Richtung`,
      };
    }
    const s = subs.get(key);
    return {
      key, label,
      score: s?.score ?? null,
      dir: s ? s.dir : 0,
      text: s?.text ?? "Quelle antwortet nicht",
    };
  });

  const vorhanden = faktoren.filter((f) => f.score !== null);
  const gerichtet = faktoren.filter((f) => f.dir !== 0);
  const dafuer = gerichtet.filter((f) => f.dir === 1).length;
  const dagegen = gerichtet.filter((f) => f.dir === -1).length;

  const netto =
    vorhanden.length > 0
      ? vorhanden.reduce((a, f) => a + (f.score as number), 0) / vorhanden.length
      : null;

  const einigkeit =
    gerichtet.length > 0
      ? Math.abs(gerichtet.reduce((a, f) => a + f.dir, 0)) / gerichtet.length
      : null;

  return {
    ccy: waehrung.ccy,
    iso: waehrung.iso,
    flag: waehrung.flag,
    faktoren,
    mitRichtung: gerichtet.length,
    dafuer,
    dagegen,
    netto,
    richtung: dirAus(netto),
    einigkeit,
    strittig: dafuer > 0 && dagegen > 0,
    regime: waehrung.regime,
    cpiYoY: waehrung.cpiYoY,
    policyRate: waehrung.rates.policyRate,
    luecken: faktoren.filter((f) => f.score === null).map((f) => f.key),
  };
}

/* ------------------------------------------------------------------ */
/* Paare                                                               */
/* ------------------------------------------------------------------ */

export interface PaarFaktor {
  key: FaktorKey;
  label: string;
  basisDir: -1 | 0 | 1;
  quoteDir: -1 | 0 | 1;
  /** Richtung fürs Paar: Basis stark und Quote schwach ⇒ long. */
  paarDir: -1 | 0 | 1;
}

export interface PaarLage {
  pair: string;
  basis: string;
  quote: string;
  faktoren: PaarFaktor[];
  /** Netto Basis − Quote, −2…+2 (praktisch selten über ±1). */
  spanne: number | null;
  richtung: -1 | 0 | 1;
  dafuer: number;
  dagegen: number;
  /** Faktoren mit Richtung insgesamt. */
  gerichtet: number;
  einigkeit: number | null;
  strittig: boolean;
}

/**
 * Richtung eines Faktors fürs Paar.
 *
 * Long heisst: Die Basiswährung spricht für Stärke ODER die Kurswährung für
 * Schwäche. Zeigen beide in dieselbe Richtung (beide stark, beide schwach),
 * hebt sich der relative Vorteil auf — ein Paar ist immer ein Vergleich,
 * nie eine absolute Aussage.
 */
export function paarFaktorDir(basisDir: -1 | 0 | 1, quoteDir: -1 | 0 | 1): -1 | 0 | 1 {
  if (basisDir === quoteDir) return 0;
  if (basisDir === 1 || quoteDir === -1) return 1;
  if (basisDir === -1 || quoteDir === 1) return -1;
  return 0;
}

export function bauePaar(basis: WaehrungsLage, quote: WaehrungsLage): PaarLage {
  const qByKey = new Map(quote.faktoren.map((f) => [f.key, f]));

  const faktoren: PaarFaktor[] = basis.faktoren.map((bf) => {
    const qf = qByKey.get(bf.key);
    const quoteDir = qf?.dir ?? 0;
    return {
      key: bf.key,
      label: bf.label,
      basisDir: bf.dir,
      quoteDir,
      paarDir: paarFaktorDir(bf.dir, quoteDir),
    };
  });

  const gerichtet = faktoren.filter((f) => f.paarDir !== 0);
  const dafuer = gerichtet.filter((f) => f.paarDir === 1).length;
  const dagegen = gerichtet.filter((f) => f.paarDir === -1).length;

  const spanne =
    basis.netto !== null && quote.netto !== null ? basis.netto - quote.netto : null;

  const einigkeit =
    gerichtet.length > 0
      ? Math.abs(gerichtet.reduce((a, f) => a + f.paarDir, 0)) / gerichtet.length
      : null;

  return {
    pair: `${basis.ccy}${quote.ccy}`,
    basis: basis.ccy,
    quote: quote.ccy,
    faktoren,
    spanne,
    richtung: spanne === null ? 0 : spanne >= 0.25 ? 1 : spanne <= -0.25 ? -1 : 0,
    dafuer,
    dagegen,
    gerichtet: gerichtet.length,
    einigkeit,
    strittig: dafuer > 0 && dagegen > 0,
  };
}

/** Die 28 handelbaren G8-Paare in üblicher Notation (EURUSD, nicht USDEUR). */
export const PAAR_REIHENFOLGE = [
  "EURUSD", "GBPUSD", "AUDUSD", "NZDUSD", "USDJPY", "USDCHF", "USDCAD",
  "EURGBP", "EURJPY", "EURCHF", "EURAUD", "EURCAD", "EURNZD",
  "GBPJPY", "GBPCHF", "GBPAUD", "GBPCAD", "GBPNZD",
  "AUDJPY", "AUDCHF", "AUDCAD", "AUDNZD",
  "NZDJPY", "NZDCHF", "NZDCAD",
  "CADJPY", "CADCHF", "CHFJPY",
] as const;

/**
 * Alle Paare, nach Klarheit sortiert: erst die mit grosser Spanne UND hoher
 * Einigkeit, zuletzt die strittigen.
 *
 * Die Sortierung ist die eigentliche Leistung der Seite. Achtundzwanzig
 * Zeilen kann niemand vergleichen; die Frage lautet „wo ist die Lage
 * eindeutig", und die Antwort steht dann oben.
 */
export function baueAllePaare(lagen: WaehrungsLage[]): PaarLage[] {
  const byCcy = new Map(lagen.map((l) => [l.ccy, l]));

  return PAAR_REIHENFOLGE.flatMap((p) => {
    const b = byCcy.get(p.slice(0, 3));
    const q = byCcy.get(p.slice(3, 6));
    return b && q ? [bauePaar(b, q)] : [];
  }).sort((a, b) => {
    const klarheit = (x: PaarLage) =>
      Math.abs(x.spanne ?? 0) * (x.einigkeit ?? 0) * (x.gerichtet > 0 ? 1 : 0);
    return klarheit(b) - klarheit(a) || a.pair.localeCompare(b.pair);
  });
}

/* ------------------------------------------------------------------ */
/* Aktualität der Quellen                                              */
/* ------------------------------------------------------------------ */

export interface Quelle {
  key: FaktorKey | "preise";
  label: string;
  /** ISO-Datum des jüngsten Werts, null = unbekannt. */
  stand: string | null;
  /** Ab wie vielen Tagen der Wert als alt bzw. veraltet gilt. */
  warnAb: number;
  altAb: number;
  /** Warum diese Schwellen — steht im Tooltip. */
  takt: string;
}

/**
 * Die Schwellen sind je Quelle verschieden, und das ist der Punkt.
 *
 * Ein COT-Bericht erscheint freitags für den Dienstag davor — sechs Tage alt
 * ist dort der Normalfall und kein Mangel. Ein Wochen-Ranking, das zehn Tage
 * alt ist, hat dagegen eine Woche verpasst. Eine einheitliche Schwelle würde
 * entweder ständig falschen Alarm schlagen oder echte Ausfälle verschlucken.
 */
export function baueQuellen(input: {
  cotDatum: string | null;
  sentimentDatum: string | null;
  rankingDatum: string | null;
  makroDatum: string | null;
}): Quelle[] {
  return [
    {
      key: "zinsen", label: "Zinsen & Makro", stand: input.makroDatum,
      warnAb: 3, altAb: 8,
      takt: "FRED liefert täglich; der Loop im Backend zieht mehrmals am Tag.",
    },
    {
      key: "cot", label: "COT", stand: input.cotDatum,
      warnAb: 9, altAb: 15,
      takt: "CFTC veröffentlicht freitags für den Dienstag davor — 6 Tage sind normal.",
    },
    {
      key: "retail", label: "Retail", stand: input.sentimentDatum,
      warnAb: 2, altAb: 5,
      takt: "Myfxbook-Momentaufnahme; wird stündlich fortgeschrieben.",
    },
    {
      key: "qscore", label: "Wochen-Ranking", stand: input.rankingDatum,
      warnAb: 9, altAb: 15,
      takt: "GitHub-Action sonntags. Älter als zwei Wochen heisst: Lauf ausgefallen.",
    },
  ];
}
