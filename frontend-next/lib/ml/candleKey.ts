/** Schlüssel für die vorgeladene Kerzen-Map: `${SYMBOL}|${D|W}`.
 *  Client- und serverseitig genutzt (Performance-Panel + Vorlader), daher
 *  bewusst in einem eigenen Modul OHNE `server-only`. */
export function candleKey(symbol: string, gran: "D" | "W"): string {
  return `${symbol}|${gran}`;
}
