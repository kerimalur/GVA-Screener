import type { SetupFinderRow } from "@/lib/ml/backtest";

/**
 * Strategien — Regeln über die fundamentale Faktor-Lage, geprüft auf zehn
 * Jahren Wochendaten.
 *
 * ============================ DAS WICHTIGSTE ============================
 *
 * Die Historie ist in zwei Fenster geteilt, und diese Teilung ist der
 * eigentliche Wert des Moduls:
 *
 *   ENTWICKLUNG   von −10 Jahren bis vor 2 Jahren.
 *                 Hier darf gesucht, gefiltert und verworfen werden,
 *                 so oft man will.
 *
 *   PRÜFUNG       die letzten 2 Jahre.
 *                 Kerim handelt dieses Fenster von Hand im KerimOS-Backtest
 *                 durch. Deshalb bleibt es hier standardmässig ZU.
 *
 * Der Grund ist nicht Ordnungsliebe. Wer eine Regel so lange verändert, bis
 * sie auf allen Daten gut aussieht, hat keine Regel gefunden, sondern die
 * Daten auswendig gelernt. Man merkt das erst im Livebetrieb, und dann kostet
 * es Geld. Ein Fenster, das die Suche nie gesehen hat, ist die einzige
 * ehrliche Antwort auf die Frage „trägt das wirklich" — und es lässt sich
 * genau einmal ohne Verlust seiner Aussagekraft öffnen.
 *
 * Genau deshalb passt die Handarbeit in KerimOS so gut dazu: Kerim spielt die
 * letzten zwei Jahre selbst durch, ohne vorher die Zahl gesehen zu haben.
 *
 * =======================================================================
 *
 * Alles hier ist rein: keine Datenbank, kein React, keine Zeit. Damit lässt
 * sich jede Zahl gegen ein Beispiel prüfen.
 */

/** Ein Faktor zeigt in eine Richtung, oder er ist egal. */
export type Bedingung = -1 | 0 | 1 | null;

export interface Strategie {
  id: string;
  name: string;
  /** Was die Regel behauptet — in einem Satz, in Kerims Worten. */
  these: string;
  /**
   * Je Faktor (Index wie `OUTLOOK_FACTORS`): 1 = muss für long sprechen,
   * −1 = muss dagegen sprechen, null = wird nicht betrachtet.
   *
   * Gelesen wird immer aus Sicht LONG. Die Regel feuert auch short, wenn
   * alle Bedingungen gespiegelt zutreffen — sonst hätte man für jede
   * Strategie zwangsläufig eine zweite, spiegelverkehrte.
   */
  bedingungen: Bedingung[];
  /** Wie viele der betrachteten Faktoren mindestens zutreffen müssen. */
  minTreffer: number;
  /** Halteperiode in Wochen. */
  horizont: 1 | 2 | 3 | 4;
  /** Nur diese Instrumente ('EUR_USD'). Leer = alle. */
  pairs: string[];
  /** Vom Nutzer angelegt oder mitgeliefert. */
  eigen: boolean;
}

export interface Treffer {
  woche: string;
  instrument: string;
  /** Richtung, in der die Regel gefeuert hat. */
  richtung: 1 | -1;
  /** Rendite in Regelrichtung, in Prozent. */
  rendite: number;
  gewonnen: boolean;
  /** Wie viele betrachtete Faktoren zustimmten. */
  konfluenz: number;
}

export interface Bilanz {
  n: number;
  gewinne: number;
  verluste: number;
  /** 0…100. Null, wenn nichts gefeuert hat. */
  trefferquote: number | null;
  /** Ø Rendite je Signal in Prozent. */
  schnitt: number | null;
  /** Summe aller Renditen. */
  gesamt: number;
  /** Ø Gewinn und Ø Verlust getrennt — sagt mehr als der Mittelwert. */
  schnittGewinn: number | null;
  schnittVerlust: number | null;
  /** Bruttogewinn ÷ Bruttoverlust. Null ohne Verlust. */
  profitFaktor: number | null;
  /** Grösster Rückgang der aufsummierten Renditekurve, positiv. */
  maxRueckgang: number;
}

export const LEERE_BILANZ: Bilanz = {
  n: 0, gewinne: 0, verluste: 0, trefferquote: null, schnitt: null,
  gesamt: 0, schnittGewinn: null, schnittVerlust: null,
  profitFaktor: null, maxRueckgang: 0,
};

export function bilanziere(treffer: Treffer[]): Bilanz {
  if (treffer.length === 0) return LEERE_BILANZ;

  const gewinne = treffer.filter((t) => t.gewonnen);
  const verluste = treffer.filter((t) => !t.gewonnen);

  const summe = (xs: Treffer[]) => xs.reduce((a, t) => a + t.rendite, 0);
  const brutto = summe(gewinne);
  const bruttoVerlust = Math.abs(summe(verluste));

  // Rückgang über die Zeitachse, nicht über die Eingangsreihenfolge.
  const chronologisch = [...treffer].sort((a, b) => a.woche.localeCompare(b.woche));
  let lauf = 0, hoch = 0, maxRueckgang = 0;
  for (const t of chronologisch) {
    lauf += t.rendite;
    if (lauf > hoch) hoch = lauf;
    if (hoch - lauf > maxRueckgang) maxRueckgang = hoch - lauf;
  }

  return {
    n: treffer.length,
    gewinne: gewinne.length,
    verluste: verluste.length,
    trefferquote: (gewinne.length / treffer.length) * 100,
    schnitt: summe(treffer) / treffer.length,
    gesamt: summe(treffer),
    schnittGewinn: gewinne.length ? brutto / gewinne.length : null,
    schnittVerlust: verluste.length ? -bruttoVerlust / verluste.length : null,
    profitFaktor: bruttoVerlust > 0 ? brutto / bruttoVerlust : null,
    maxRueckgang,
  };
}

/**
 * Feuert die Regel auf einer Zeile — und in welche Richtung?
 *
 * Geprüft wird beides: die Regel wie geschrieben (long) und ihr Spiegelbild
 * (short). Träfe nur die geschriebene Richtung, wäre jede Auswertung halb
 * blind — eine Regel, die Stärke erkennt, erkennt auch Schwäche.
 *
 * Faktoren, die im Snapshot fehlen (`null`), zählen nicht als Zustimmung.
 * Sie zählen aber auch nicht dagegen: Ein Faktor, den es 2016 noch nicht
 * gab, darf eine Regel nicht rückwirkend entwerten.
 */
export function feuert(
  s: Strategie,
  d: Array<-1 | 0 | 1 | null>,
): { richtung: 1 | -1; konfluenz: number } | null {
  const betrachtet = s.bedingungen
    .map((b, i) => ({ b, i }))
    .filter((x): x is { b: -1 | 1; i: number } => x.b === 1 || x.b === -1);

  if (betrachtet.length === 0) return null;

  for (const richtung of [1, -1] as const) {
    let treffer = 0;
    let widerspruch = false;
    for (const { b, i } of betrachtet) {
      const soll = b * richtung;
      const ist = d[i];
      if (ist === null || ist === 0) continue;
      if (ist === soll) treffer++;
      else widerspruch = true;
    }
    // Ein aktiver Gegenfaktor kippt das Signal, auch wenn die Mindestzahl
    // erreicht wäre. „Drei dafür, zwei dagegen" ist kein Setup.
    if (!widerspruch && treffer >= s.minTreffer) return { richtung, konfluenz: treffer };
  }
  return null;
}

export interface Fenster {
  /** 'YYYY-MM-DD' inklusiv. */
  von: string;
  /** 'YYYY-MM-DD' exklusiv. */
  bis: string;
}

/**
 * Die beiden Fenster aus einem Stichtag.
 *
 * `heute` wird übergeben und nicht gelesen — sonst liefert dieselbe Regel je
 * nach Aufrufzeitpunkt andere Zahlen und lässt sich nicht prüfen.
 */
export function fenster(heute: string): { entwicklung: Fenster; pruefung: Fenster } {
  const d = new Date(`${heute}T00:00:00Z`);
  const minus = (jahre: number) => {
    const x = new Date(d);
    x.setUTCFullYear(x.getUTCFullYear() - jahre);
    return x.toISOString().slice(0, 10);
  };
  return {
    entwicklung: { von: minus(10), bis: minus(2) },
    pruefung: { von: minus(2), bis: heute },
  };
}

export function imFenster(woche: string, f: Fenster): boolean {
  return woche >= f.von && woche < f.bis;
}

/** Alle Signale einer Strategie in einem Fenster. */
export function werteAus(
  s: Strategie,
  rows: SetupFinderRow[],
  horizonte: number[],
  f: Fenster,
): Treffer[] {
  const hIndex = horizonte.indexOf(s.horizont);
  if (hIndex < 0) return [];

  const nurPairs = s.pairs.length > 0 ? new Set(s.pairs) : null;
  const out: Treffer[] = [];

  for (const row of rows) {
    if (!imFenster(row.w, f)) continue;
    if (nurPairs && !nurPairs.has(row.i)) continue;

    const roh = row.r[hIndex];
    if (roh === null || roh === undefined) continue;

    const t = feuert(s, row.d);
    if (!t) continue;

    // Die Rohrendite ist in Pair-Richtung. In Regelrichtung gedreht ist sie
    // vergleichbar, egal ob long oder short gefeuert wurde.
    const rendite = roh * t.richtung;
    out.push({
      woche: row.w,
      instrument: row.i,
      richtung: t.richtung,
      rendite,
      gewonnen: rendite > 0,
      konfluenz: t.konfluenz,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Woran es liegt                                                      */
/* ------------------------------------------------------------------ */

export interface Aufschluss {
  schluessel: string;
  bilanz: Bilanz;
}

/** Bilanz je Gruppe, nach Anzahl absteigend. */
export function gruppiere(treffer: Treffer[], nach: (t: Treffer) => string): Aufschluss[] {
  const eimer = new Map<string, Treffer[]>();
  for (const t of treffer) {
    const k = nach(t);
    const liste = eimer.get(k) ?? [];
    liste.push(t);
    eimer.set(k, liste);
  }
  return [...eimer.entries()]
    .map(([schluessel, liste]) => ({ schluessel, bilanz: bilanziere(liste) }))
    .sort((a, b) => b.bilanz.n - a.bilanz.n);
}

export const basisWaehrung = (t: Treffer) => t.instrument.slice(0, 3);
export const quoteWaehrung = (t: Treffer) => t.instrument.slice(4, 7);
export const monat = (t: Treffer) =>
  ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"][
    Number(t.woche.slice(5, 7)) - 1
  ] ?? "?";

/* ------------------------------------------------------------------ */
/* Was man ändern könnte                                               */
/* ------------------------------------------------------------------ */

export interface Vorschlag {
  /** Was man tun würde. */
  titel: string;
  /** Warum — mit Zahlen. */
  begruendung: string;
  /** Trefferquote vorher → nachher. */
  vorher: number;
  nachher: number;
  /** Wie viele Signale übrig blieben. */
  nRest: number;
  nWeg: number;
  /**
   * Wie belastbar der Vorschlag ist. Bei wenigen entfernten Signalen ist
   * jede Verbesserung mit hoher Wahrscheinlichkeit Zufall.
   */
  belastbar: boolean;
}

const MIN_REST = 30;
const MIN_WEG = 10;
const MIN_HUB = 4;

/**
 * Vorschläge, die aus den Daten selbst kommen — und die Warnung dazu.
 *
 * Jeder Vorschlag hier ist ein Filter, den man im Nachhinein findet, und
 * genau das macht ihn verdächtig. Wer aus 28 Paaren die schlechtesten drei
 * streicht, verbessert die Zahl *immer* — auch bei reinem Rauschen.
 *
 * Deshalb drei Hürden, und `belastbar` sagt, ob alle drei genommen wurden:
 *   • mindestens 30 Signale bleiben übrig  (sonst misst man nichts mehr)
 *   • mindestens 10 Signale fallen weg     (sonst ist es Kosmetik)
 *   • mindestens 4 Punkte Trefferquote     (sonst ist es Rauschen)
 *
 * Und selbst dann gilt: Der Vorschlag ist eine Hypothese für das
 * Prüfungsfenster, kein Ergebnis.
 */
export function vorschlaege(treffer: Treffer[]): Vorschlag[] {
  const basis = bilanziere(treffer);
  if (basis.trefferquote === null || treffer.length < MIN_REST + MIN_WEG) return [];

  const out: Vorschlag[] = [];

  const pruefe = (
    titel: string,
    begruendung: (nWeg: number, hub: number) => string,
    behalte: (t: Treffer) => boolean,
  ) => {
    const rest = treffer.filter(behalte);
    const nWeg = treffer.length - rest.length;
    if (rest.length < MIN_REST || nWeg < MIN_WEG) return;
    const neu = bilanziere(rest);
    if (neu.trefferquote === null) return;
    const hub = neu.trefferquote - basis.trefferquote!;
    if (hub < MIN_HUB) return;
    out.push({
      titel,
      begruendung: begruendung(nWeg, hub),
      vorher: basis.trefferquote!,
      nachher: neu.trefferquote,
      nRest: rest.length,
      nWeg,
      belastbar: nWeg >= MIN_WEG * 2 && rest.length >= MIN_REST * 2,
    });
  };

  // 1 — Konfluenz anheben
  const maxKonf = Math.max(...treffer.map((t) => t.konfluenz));
  for (let schwelle = 2; schwelle <= maxKonf; schwelle++) {
    pruefe(
      `Nur bei ${schwelle} übereinstimmenden Faktoren handeln`,
      (nWeg, hub) =>
        `${nWeg} Signale mit weniger Zustimmung fallen weg, die Trefferquote steigt um ${hub.toFixed(1)} Punkte.`,
      (t) => t.konfluenz >= schwelle,
    );
  }

  // 2 — schwache Basiswährungen streichen
  for (const g of gruppiere(treffer, basisWaehrung)) {
    if (g.bilanz.n < MIN_WEG || g.bilanz.trefferquote === null) continue;
    if (g.bilanz.trefferquote >= basis.trefferquote) continue;
    pruefe(
      `${g.schluessel} als Basiswährung ausschliessen`,
      (nWeg, hub) =>
        `${g.schluessel} kommt auf ${g.bilanz.trefferquote!.toFixed(0)} % über ${nWeg} Signale — ohne diese Gruppe steigt die Quote um ${hub.toFixed(1)} Punkte.`,
      (t) => basisWaehrung(t) !== g.schluessel,
    );
  }

  // 3 — nur eine Richtung handeln
  for (const richtung of [1, -1] as const) {
    const gegen = treffer.filter((t) => t.richtung !== richtung);
    if (gegen.length < MIN_WEG) continue;
    const b = bilanziere(gegen);
    if (b.trefferquote === null || b.trefferquote >= basis.trefferquote) continue;
    pruefe(
      `Nur ${richtung === 1 ? "Long" : "Short"} handeln`,
      (nWeg, hub) =>
        `Die Gegenrichtung trifft nur zu ${b.trefferquote!.toFixed(0)} % über ${nWeg} Signale; ohne sie steigt die Quote um ${hub.toFixed(1)} Punkte.`,
      (t) => t.richtung === richtung,
    );
  }

  return out.sort((a, b) => b.nachher - b.vorher - (a.nachher - a.vorher)).slice(0, 6);
}

/* ------------------------------------------------------------------ */
/* Mitgelieferte Strategien                                            */
/* ------------------------------------------------------------------ */

/**
 * Vier Startpunkte — bewusst grob und bewusst verschieden.
 *
 * Sie sind nicht als „gute Strategien" gemeint, sondern als Anschauung: Was
 * passiert, wenn man nur den Zins nimmt? Was, wenn man Einstimmigkeit
 * verlangt? Die interessante Zahl ist oft, wie wenig ein einzelner Faktor
 * trägt.
 *
 * Reihenfolge der Bedingungen wie `OUTLOOK_FACTORS`:
 *   0 Zinsdifferenz · 1 COT-Flow · 2 Saisonalität · 3 Yield-Spread · 4 Retail
 */
export const MITGELIEFERT: Strategie[] = [
  {
    id: "zins-pur",
    name: "Nur Zins",
    these: "Die Zinsdifferenz allein reicht als Richtungsgeber.",
    bedingungen: [1, null, null, null, null],
    minTreffer: 1,
    horizont: 4,
    pairs: [],
    eigen: false,
  },
  {
    id: "zins-cot",
    name: "Zins + COT",
    these: "Zinsvorteil zählt nur, wenn die grossen Adressen mitziehen.",
    bedingungen: [1, 1, null, null, null],
    minTreffer: 2,
    horizont: 4,
    pairs: [],
    eigen: false,
  },
  {
    id: "einstimmig",
    name: "Einstimmig",
    these: "Alle vier Faktoren mit durchgehender Historie zeigen dasselbe.",
    bedingungen: [1, 1, 1, 1, null],
    minTreffer: 4,
    horizont: 4,
    pairs: [],
    eigen: false,
  },
  {
    id: "gegen-retail",
    name: "Gegen die Privaten",
    these: "Retail liegt falsch — gegen die Mehrheit der Kleinanleger handeln.",
    bedingungen: [null, null, null, null, -1],
    minTreffer: 1,
    horizont: 2,
    pairs: [],
    eigen: false,
  },
];
