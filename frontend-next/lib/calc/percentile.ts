/** Perzentil-Rang (0–100) von `value` innerhalb `window` (inkl. value selbst). */
export function percentileRank(value: number, window: number[]): number {
  if (window.length === 0) return 50;
  let below = 0;
  let equal = 0;
  for (const v of window) {
    if (v < value) below += 1;
    else if (v === value) equal += 1;
  }
  return ((below + equal / 2) / window.length) * 100;
}

/**
 * Rolling-Perzentil je Punkt über die letzten `windowSize` Werte
 * (inkl. aktuellem). Anfangsbereich nutzt verfügbare Historie (min. 52).
 */
export function rollingPercentile(
  values: number[],
  windowSize = 260,
  minWindow = 52,
): (number | null)[] {
  return values.map((v, i) => {
    const start = Math.max(0, i - windowSize + 1);
    const window = values.slice(start, i + 1);
    if (window.length < minWindow) return null;
    return percentileRank(v, window);
  });
}

/** Untere/obere Schwellenwerte (z.B. 10./90. Perzentil) eines Fensters. */
export function percentileBounds(
  values: number[],
  lowerPct: number,
  upperPct: number,
): { lower: number; upper: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => {
    const idx = (p / 100) * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };
  return { lower: at(lowerPct), upper: at(upperPct) };
}
