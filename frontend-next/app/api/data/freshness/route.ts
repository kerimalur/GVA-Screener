import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { FRED_CATALOG, staleAllowanceDays, type FredSeriesDef } from "@/lib/constants/fredSeries";
import { bisPolicyDailyId } from "@/lib/jobs/updateBis";
import { yield2yId, YIELD_2Y_CCYS } from "@/lib/sources/yields";

export const dynamic = "force-dynamic";

/**
 * Datenlage — eine Seite, die schreit, wenn eine Quelle stirbt.
 *
 * Der Anlass ist konkret: Die FRED-Kette stand vom 1. Juli bis zum 17. August
 * 2026 still, 47 Tage, und der Cron meldete jede Nacht „ok". Der Grund war
 * kein Absturz, sondern ein Teilausfall — `updateFred` wirft nur, wenn
 * **alle** Serien fehlschlagen, und schreibt sonst brav `is_stale = true` in
 * eine Tabelle, die niemand ansieht.
 *
 * Deshalb liest dieser Endpunkt genau diese Tabelle und rechnet das Alter
 * gegen den erwarteten Rhythmus der jeweiligen Serie. Eine Quartalszahl, die
 * 80 Tage alt ist, ist aktuell; eine Tagesserie mit demselben Alter ist tot.
 * Ohne Anmeldung erreichbar, damit ein Monitor draufschauen kann.
 */

type Zustand = "gruen" | "gelb" | "rot" | "eingestellt";

/**
 * "eingestellt" ist bewusst KEIN Rot.
 *
 * Diese Serien sind nicht kaputt, sie existieren nicht mehr — FRED hat die
 * OECD-Feeds 2024 abgeschaltet. Als Rot geführt stünden hier dauerhaft 21
 * Alarme, die niemand abstellen kann, und ein Warnzeichen, das immer leuchtet,
 * bringt einem nur bei, es zu übersehen. Sie bleiben sichtbar, aber in einer
 * eigenen Spalte.
 */

interface SerienZeile {
  id: string;
  label: string;
  ccy: string | null;
  kategorie: string;
  rhythmus: string;
  quelle: string;
  lastDate: string | null;
  alterTage: number | null;
  erlaubtTage: number;
  /** Grund, falls FRED die Serie abgeschaltet hat. Sonst null. */
  eingestellt: string | null;
  zustand: Zustand;
  /** true = diese Serie trägt ein Urteil im Terminal. */
  kern: boolean;
}

interface TabellenZeile {
  tabelle: string;
  label: string;
  lastDate: string | null;
  alterTage: number | null;
  erlaubtTage: number;
  zustand: Zustand;
  zeilen: number | null;
}

const heute = () => new Date();

function alterInTagen(datum: string | null): number | null {
  if (!datum) return null;
  const ms = heute().getTime() - Date.parse(datum.length > 10 ? datum : `${datum}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

/**
 * Gelb ab dem erlaubten Alter, rot ab dem Doppelten.
 *
 * Zwei Stufen statt einer, weil ein einzelner Feiertag oder ein verschobener
 * Veröffentlichungstermin sonst dieselbe Farbe bekäme wie eine seit sechs
 * Wochen tote Leitung — und dann ignoriert man beides.
 */
function bewerte(alter: number | null, erlaubt: number): Zustand {
  if (alter === null) return "rot";
  if (alter <= erlaubt) return "gruen";
  if (alter <= erlaubt * 2) return "gelb";
  return "rot";
}

/** Serien, ohne die das Terminal kein Urteil bilden kann. */
function istKern(id: string, def: FredSeriesDef | null): boolean {
  if (id.startsWith("Y2_")) return true;
  if (id.startsWith("BIS_CBPOL")) return true;
  if (id.startsWith("BIS_CPI_YOY_")) return true;
  if (id === "VIXCLS") return true;
  return def?.category === "policy_rate";
}

export async function GET() {
  const db = createServiceClient();

  /* ---------------------------------------------------------- Serien */

  // Katalog + die synthetischen IDs, die nicht im FRED-Katalog stehen.
  const G8 = ["USD", "EUR", "GBP", "JPY", "CHF", "AUD", "NZD", "CAD"];
  const zusatz: FredSeriesDef[] = [
    ...G8.map((c) => ({
      id: bisPolicyDailyId(c), ccy: c, category: "policy_rate" as const,
      label: `${c} Leitzins (BIS, täglich)`, cadence: "daily" as const, source: "bis" as const,
    })),
    ...YIELD_2Y_CCYS.map((c) => ({
      id: yield2yId(c), ccy: c, category: "rate_2y" as const,
      label: `${c} 2J-Rendite`, cadence: "daily" as const, source: "fred" as const,
    })),
  ];

  const bekannt = new Set(FRED_CATALOG.map((s) => s.id));
  const alleDefs: FredSeriesDef[] = [
    ...FRED_CATALOG,
    ...zusatz.filter((s) => !bekannt.has(s.id)),
  ];

  const { data: metaRoh } = await db
    .from("fred_series_meta")
    .select("series_id, last_date, last_fetched, is_stale");

  const metaById = new Map(
    (metaRoh ?? []).map((m) => [
      m.series_id as string,
      m as { series_id: string; last_date: string | null; last_fetched: string | null; is_stale: boolean | null },
    ]),
  );

  // Kernserien gegen die Rohdaten gegenprüfen: `fred_series_meta` ist das,
  // was die Jobs behaupten. Für die Serien, an denen ein Urteil hängt, wird
  // zusätzlich der tatsächlich jüngste Wert gelesen — eine Behauptung und
  // eine Messung sind nicht dasselbe.
  const kernIds = alleDefs.filter((d) => istKern(d.id, d)).map((d) => d.id);
  const gemessen = new Map<string, string | null>();
  await Promise.all(
    kernIds.map(async (id) => {
      const { data } = await db
        .from("fred_series")
        .select("date")
        .eq("series_id", id)
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();
      gemessen.set(id, (data?.date as string | undefined) ?? null);
    }),
  );

  const serien: SerienZeile[] = alleDefs.map((def) => {
    const meta = metaById.get(def.id);
    const kern = istKern(def.id, def);
    const lastDate = kern
      ? (gemessen.get(def.id) ?? meta?.last_date ?? null)
      : (meta?.last_date ?? null);
    const alter = alterInTagen(lastDate);
    const erlaubt = staleAllowanceDays(def);
    return {
      id: def.id,
      label: def.label,
      ccy: def.ccy,
      kategorie: def.category,
      rhythmus: def.cadence ?? "unbekannt",
      quelle: def.source ?? "fred",
      lastDate,
      alterTage: alter,
      erlaubtTage: erlaubt,
      zustand: def.eingestellt ? "eingestellt" : bewerte(alter, erlaubt),
      eingestellt: def.eingestellt ?? null,
      kern,
    };
  });

  /* -------------------------------------------------------- Tabellen */

  async function juengstes(
    tabelle: string, spalte: string,
  ): Promise<{ datum: string | null; zeilen: number | null }> {
    const [{ data }, { count }] = await Promise.all([
      db.from(tabelle).select(spalte).order(spalte, { ascending: false }).limit(1).maybeSingle(),
      db.from(tabelle).select("*", { count: "exact", head: true }),
    ]);
    const roh = data ? (data as unknown as Record<string, unknown>)[spalte] : null;
    return {
      datum: typeof roh === "string" ? roh.slice(0, 10) : null,
      zeilen: count ?? null,
    };
  }

  const TABELLEN = [
    { tabelle: "price_daily", spalte: "date", label: "Preise (OANDA)", erlaubt: 4 },
    { tabelle: "cot_reports", spalte: "report_date", label: "COT Legacy (CFTC)", erlaubt: 10 },
    { tabelle: "cot_tff_reports", spalte: "report_date", label: "COT TFF (CFTC)", erlaubt: 10 },
    { tabelle: "sentiment_snapshots", spalte: "captured_at", label: "Retail (Myfxbook)", erlaubt: 4 },
    { tabelle: "calendar_events", spalte: "event_time", label: "Kalender (ForexFactory)", erlaubt: 3 },
  ] as const;

  const tabellen: TabellenZeile[] = await Promise.all(
    TABELLEN.map(async (t) => {
      const { datum, zeilen } = await juengstes(t.tabelle, t.spalte);
      // `alterInTagen` klemmt bei 0: Der Kalender enthält Termine der
      // KOMMENDEN Woche, ein Datum in der Zukunft ist dort der Normalfall und
      // zählt als „heute". Bleibt der Job stehen, wandert der jüngste Termin
      // aber in die Vergangenheit — und genau dann wird die Zeile gelb, dann rot.
      const alter = alterInTagen(datum);
      return {
        tabelle: t.tabelle,
        label: t.label,
        lastDate: datum,
        alterTage: alter,
        erlaubtTage: t.erlaubt,
        zustand: bewerte(alter, t.erlaubt),
        zeilen,
      };
    }),
  );

  /* ----------------------------------------------------------- Crons */

  const { data: laeufe } = await db
    .from("cron_runs")
    .select("job, status, ran_at, detail")
    .order("ran_at", { ascending: false })
    .limit(40);

  const gesehen = new Set<string>();
  const crons = (laeufe ?? [])
    .filter((r) => {
      const j = r.job as string;
      if (gesehen.has(j)) return false;
      gesehen.add(j);
      return true;
    })
    .map((r) => ({
      job: r.job as string,
      status: r.status as string,
      ranAt: r.ran_at as string,
      alterStunden: Math.round(
        (heute().getTime() - Date.parse(r.ran_at as string)) / 3_600_000,
      ),
      detail: r.detail,
    }));

  /* ---------------------------------------------------------- Urteil */

  const rot: string[] = [];
  for (const s of serien) {
    if (s.zustand === "rot" && s.kern) {
      rot.push(`${s.label} (${s.id}): ${s.lastDate ?? "nie"} — ${s.alterTage ?? "?"} Tage alt`);
    }
  }
  for (const t of tabellen) {
    if (t.zustand === "rot") {
      rot.push(`${t.label}: ${t.lastDate ?? "nie"} — ${t.alterTage ?? "?"} Tage alt`);
    }
  }
  for (const c of crons) {
    if (c.status === "error") rot.push(`Cron ${c.job} steht auf Fehler`);
    if (c.alterStunden > 36) rot.push(`Cron ${c.job} lief seit ${c.alterStunden} h nicht mehr`);
  }

  const zaehlung = {
    gruen: serien.filter((s) => s.zustand === "gruen").length,
    gelb: serien.filter((s) => s.zustand === "gelb").length,
    rot: serien.filter((s) => s.zustand === "rot").length,
    kernRot: serien.filter((s) => s.zustand === "rot" && s.kern).length,
    eingestellt: serien.filter((s) => s.zustand === "eingestellt").length,
  };

  return NextResponse.json({
    generiertAm: heute().toISOString(),
    ok: rot.length === 0,
    rot,
    zaehlung,
    serien: serien.sort((a, b) => Number(b.kern) - Number(a.kern) || a.id.localeCompare(b.id)),
    tabellen,
    crons,
  });
}
