export interface MonthlyStat {
  month: number; // 1–12
  avgReturn: number; // %
  hitRate: number; // % positiver Jahre
  years: number;
}

export interface SeasonalityResult {
  months: MonthlyStat[];
  yearsCovered: number;
}

/**
 * Saisonalität aus Tagesschlusskursen: Monatsreturn = letzter Close des Monats
 * vs. letzter Close des Vormonats; Ø + Trefferquote je Kalendermonat.
 */
export function seasonality(
  data: Array<{ date: string; close: number }>,
): SeasonalityResult {
  // letzter Close je YYYY-MM
  const lastCloseByMonth = new Map<string, number>();
  for (const p of data) {
    lastCloseByMonth.set(p.date.slice(0, 7), p.close); // chronologisch -> letzter gewinnt
  }
  const keys = [...lastCloseByMonth.keys()].sort();

  const returnsByMonth = new Map<number, number[]>();
  for (let i = 1; i < keys.length; i++) {
    const prev = lastCloseByMonth.get(keys[i - 1])!;
    const cur = lastCloseByMonth.get(keys[i])!;
    if (prev === 0) continue;
    const month = parseInt(keys[i].slice(5, 7), 10);
    const ret = (cur / prev - 1) * 100;
    const arr = returnsByMonth.get(month) ?? [];
    arr.push(ret);
    returnsByMonth.set(month, arr);
  }

  const months: MonthlyStat[] = [];
  for (let m = 1; m <= 12; m++) {
    const rets = returnsByMonth.get(m) ?? [];
    if (rets.length === 0) {
      months.push({ month: m, avgReturn: 0, hitRate: 0, years: 0 });
      continue;
    }
    months.push({
      month: m,
      avgReturn: rets.reduce((a, b) => a + b, 0) / rets.length,
      hitRate: (rets.filter((r) => r > 0).length / rets.length) * 100,
      years: rets.length,
    });
  }

  const yearsCovered = keys.length > 0
    ? parseInt(keys[keys.length - 1].slice(0, 4), 10) - parseInt(keys[0].slice(0, 4), 10) + 1
    : 0;

  return { months, yearsCovered };
}

export const MONTH_LABELS = [
  "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
];
