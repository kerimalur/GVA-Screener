/**
 * App-weite Einstellungen (Terminal + Scanner) — isomorph.
 * Persistenz: Cookie (Server-Defaults beim Rendern) + user_preferences
 * (Key "app_settings", geräteübergreifend).
 */

export const SETTINGS_COOKIE = "fx-settings";
export const SETTINGS_PREF_KEY = "app_settings";

export type StrengthLookback = "1W" | "1M" | "3M";

export interface AppSettings {
  terminal: {
    /** CFTC-Contract-Code, der auf der COT-Seite vorausgewählt ist */
    defaultCot: string;
    /** Standard-Regionen auf der Makro-Seite */
    makroA: string;
    makroB: string;
    /** Voreingestelltes Zeitfenster im Currency-Strength-Panel */
    strengthLookback: StrengthLookback;
    /** Perzentil ab dem COT als Extrem gilt (Extrem-Short = 100 − x) */
    cotExtremePct: number;
    /** Retail-Long-% ab dem Sentiment als Konträr-Signal gilt */
    sentimentExtremePct: number;
  };
  scanner: {
    /** Poll-Intervall des GVA-Screeners in Sekunden */
    pollSec: number;
  };
}

export const DEFAULT_SETTINGS: AppSettings = {
  terminal: {
    defaultCot: "099741", // EUR
    makroA: "USD",
    makroB: "EUR",
    strengthLookback: "1M",
    cotExtremePct: 90,
    sentimentExtremePct: 70,
  },
  scanner: {
    pollSec: 30,
  },
};

const clamp = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

/** Roh-JSON (Cookie/Pref) defensiv gegen Defaults mergen. */
export function parseSettings(raw: unknown): AppSettings {
  let obj: Record<string, unknown> = {};
  if (typeof raw === "string" && raw) {
    try {
      obj = JSON.parse(raw);
    } catch {
      obj = {};
    }
  } else if (raw && typeof raw === "object") {
    obj = raw as Record<string, unknown>;
  }
  const t = (obj.terminal ?? {}) as Partial<AppSettings["terminal"]>;
  const s = (obj.scanner ?? {}) as Partial<AppSettings["scanner"]>;
  const d = DEFAULT_SETTINGS;
  return {
    terminal: {
      defaultCot: typeof t.defaultCot === "string" ? t.defaultCot : d.terminal.defaultCot,
      makroA: typeof t.makroA === "string" ? t.makroA : d.terminal.makroA,
      makroB: typeof t.makroB === "string" ? t.makroB : d.terminal.makroB,
      strengthLookback: (["1W", "1M", "3M"] as const).includes(
        t.strengthLookback as StrengthLookback,
      )
        ? (t.strengthLookback as StrengthLookback)
        : d.terminal.strengthLookback,
      cotExtremePct: clamp(t.cotExtremePct, 55, 99, d.terminal.cotExtremePct),
      sentimentExtremePct: clamp(t.sentimentExtremePct, 55, 95, d.terminal.sentimentExtremePct),
    },
    scanner: {
      pollSec: clamp(s.pollSec, 5, 600, d.scanner.pollSec),
    },
  };
}
