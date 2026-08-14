import type { ReactNode } from "react";

/**
 * Die Bausteine des Labors.
 *
 * Bewusst wenige und bewusst dumm: Sie tragen kein Verhalten, nur Form.
 * Alles, was denkt, gehört in die Seite oder in `lib/`. Der frühere
 * Komponenten-Zoo (Panel, StatCard, TerminalCard, TerminalHeader,
 * TerminalTable, Metric, BiasScore, RegimeTag, DirectionTag, Badge …) hatte
 * für dieselbe Aufgabe fünf Varianten mit leicht verschiedenem Abstand — das
 * ist der Grund, warum die Oberfläche nie ruhig wirkte.
 *
 * Farben kommen ausschliesslich aus `globals.css`.
 */

export const cx = (...t: (string | false | null | undefined)[]) =>
  t.filter(Boolean).join(" ");

/* ------------------------------------------------------------------ */
/* Fläche                                                              */
/* ------------------------------------------------------------------ */

export function Panel({
  title, hint, right, children, lit, className, flush,
}: {
  title?: ReactNode;
  /** Eine Zeile unter dem Titel — was die Zahlen bedeuten. */
  hint?: ReactNode;
  /** Rechts in der Kopfzeile: Stand, Umschalter, Zähler. */
  right?: ReactNode;
  children: ReactNode;
  /** Leuchtkante oben. Nur für das eine Panel, das die Seite trägt. */
  lit?: boolean;
  className?: string;
  /** Ohne Innenabstand — für Tabellen, die bis an den Rand laufen. */
  flush?: boolean;
}) {
  return (
    <section
      className={cx(
        "rounded-[var(--radius-panel)] border border-line bg-surface",
        lit && "edge-lit",
        className,
      )}
    >
      {(title || right) && (
        <header
          className={cx(
            "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 pt-3.5",
            !flush && "pb-1",
            flush && "pb-3.5 border-b border-line",
          )}
        >
          <div className="min-w-0">
            {title && (
              <h2 className="text-[13.5px] font-semibold tracking-tight text-text">
                {title}
              </h2>
            )}
            {hint && <p className="mt-0.5 text-[11.5px] leading-snug text-faint">{hint}</p>}
          </div>
          {right && <div className="shrink-0 text-[11px] text-muted">{right}</div>}
        </header>
      )}
      <div className={cx(!flush && "p-4", flush && "p-0")}>{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Zahl                                                                */
/* ------------------------------------------------------------------ */

export type Ton = "neutral" | "up" | "down" | "stale" | "accent";

const TON_TEXT: Record<Ton, string> = {
  neutral: "text-text",
  up: "text-up",
  down: "text-down",
  stale: "text-stale",
  accent: "text-accent-soft",
};

export function Kennzahl({
  label, wert, sub, ton = "neutral", gross,
}: {
  label: string;
  wert: ReactNode;
  sub?: ReactNode;
  ton?: Ton;
  /** Für die zwei, drei Zahlen, auf die es auf einer Seite ankommt. */
  gross?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="lbl">{label}</div>
      <div
        className={cx(
          "num mt-1 font-semibold leading-none",
          gross ? "text-[30px]" : "text-[19px]",
          TON_TEXT[ton],
        )}
      >
        {wert}
      </div>
      {sub && <div className="mt-1.5 text-[11px] leading-snug text-faint">{sub}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Marken                                                              */
/* ------------------------------------------------------------------ */

const CHIP_TON: Record<Ton, string> = {
  neutral: "bg-neutral-dim text-muted",
  up: "bg-up-dim text-up",
  down: "bg-down-dim text-down",
  stale: "bg-stale-dim text-stale",
  accent: "bg-accent-dim text-accent-soft",
};

export function Chip({
  children, ton = "neutral", title, mono,
}: {
  children: ReactNode;
  ton?: Ton;
  title?: string;
  mono?: boolean;
}) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1 rounded-[var(--radius-chip)] px-1.5 py-0.5",
        "text-[10.5px] font-medium leading-[16px] whitespace-nowrap",
        mono && "num",
        CHIP_TON[ton],
      )}
    >
      {children}
    </span>
  );
}

/**
 * Richtungspfeil als einzelnes Zeichen.
 *
 * Absichtlich nur drei Zustände und keine Zwischentöne: Eine Skala mit
 * sieben Abstufungen liest niemand mehr richtig, und eine erfundene
 * Genauigkeit ist schlimmer als eine grobe ehrliche.
 */
export function Richtung({ dir, size = 12 }: { dir: -1 | 0 | 1; size?: number }) {
  const zeichen = dir === 1 ? "▲" : dir === -1 ? "▼" : "—";
  const farbe = dir === 1 ? "text-up" : dir === -1 ? "text-down" : "text-faint";
  return (
    <span className={farbe} style={{ fontSize: size, lineHeight: 1 }}>
      {zeichen}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Balken                                                              */
/* ------------------------------------------------------------------ */

/**
 * Balken mit Null in der Mitte. Für alles, was ein Vorzeichen hat.
 *
 * Ein Balken, der links beginnt, zwingt zum Lesen der Zahl, um die
 * Richtung zu erkennen. Von der Mitte aus sieht man sie sofort.
 */
export function Waage({ wert, max = 1, hoehe = 6 }: {
  wert: number | null;
  max?: number;
  hoehe?: number;
}) {
  if (wert === null) {
    return (
      <div className="w-full rounded-full bg-surface2" style={{ height: hoehe }} />
    );
  }
  const anteil = Math.min(100, (Math.abs(wert) / (max || 1)) * 100);
  const positiv = wert >= 0;
  return (
    <div className="relative flex w-full items-stretch" style={{ height: hoehe }}>
      <div className="absolute inset-0 rounded-full bg-surface2" />
      <div className="relative flex w-1/2 justify-end">
        {!positiv && (
          <div
            className="anim-sweep h-full rounded-l-full bg-down"
            style={{ width: `${anteil}%`, transformOrigin: "right" }}
          />
        )}
      </div>
      <div className="relative w-px bg-line2" />
      <div className="relative flex w-1/2 justify-start">
        {positiv && (
          <div className="anim-sweep h-full rounded-r-full bg-up" style={{ width: `${anteil}%` }} />
        )}
      </div>
    </div>
  );
}

/** Balken von links, für Werte ohne Vorzeichen (Anteile, Quoten). */
export function Balken({ pct, farbe = "var(--color-accent)", hoehe = 6 }: {
  pct: number;
  farbe?: string;
  hoehe?: number;
}) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className="w-full overflow-hidden rounded-full bg-surface2" style={{ height: hoehe }}>
      <div className="anim-sweep h-full rounded-full" style={{ width: `${w}%`, background: farbe }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Leere und Fehlstellen                                               */
/* ------------------------------------------------------------------ */

export function Leer({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-cell)] border border-dashed border-line px-4 py-8 text-center text-[12.5px] text-faint">
      {children}
    </div>
  );
}

/**
 * Fehlender Wert. Ein eigenes Zeichen, damit "keine Daten" nie wie eine
 * Null aussieht — der Unterschied entscheidet über jede Auswertung.
 */
export function Ohne({ titel }: { titel?: string }) {
  return (
    <span className="num text-faint" title={titel ?? "keine Daten"}>
      ·
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Aktualität                                                          */
/* ------------------------------------------------------------------ */

export interface FrischeStufe {
  /** Ab wie vielen Tagen gilt der Wert als alt bzw. veraltet. */
  warnAb: number;
  altAb: number;
}

/**
 * Wie alt ist ein Wert — als Chip mit Ton.
 *
 * Die Schwellen sind je Quelle verschieden und werden deshalb übergeben:
 * Ein COT-Bericht ist wöchentlich und mit sechs Tagen völlig normal; ein
 * Kurs von vor sechs Tagen ist Müll.
 */
export function Frische({
  datum, stufe, label,
}: {
  datum: string | null;
  stufe: FrischeStufe;
  label?: string;
}) {
  if (!datum) {
    return <Chip ton="stale" title={`${label ?? "Quelle"}: kein Datum`}>keine Daten</Chip>;
  }
  const tage = Math.floor((Date.now() - new Date(datum).getTime()) / 86_400_000);
  const ton: Ton = tage >= stufe.altAb ? "down" : tage >= stufe.warnAb ? "stale" : "neutral";
  const text =
    tage <= 0 ? "heute" : tage === 1 ? "gestern" : `vor ${tage} T`;
  return (
    <Chip ton={ton} mono title={`${label ?? "Stand"}: ${datum}`}>
      {text}
    </Chip>
  );
}
