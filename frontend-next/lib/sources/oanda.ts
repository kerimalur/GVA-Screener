
export interface Candle {
  date: string; // 'YYYY-MM-DD'
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface OandaCandle {
  complete: boolean;
  volume: number;
  time: string;
  mid: { o: string; h: string; l: string; c: string };
}

function baseUrl(): string {
  return process.env.OANDA_URL ?? "https://api-fxpractice.oanda.com/v3";
}

function headers(): HeadersInit {
  const key = process.env.OANDA_API_KEY;
  if (!key) throw new Error("OANDA_API_KEY fehlt");
  return {
    Authorization: `Bearer ${key}`,
    "Accept-Datetime-Format": "RFC3339",
  };
}

/**
 * Tageskerzen (Mid). Entweder `count` (max 5000) oder `from` (ISO-Datum,
 * inkrementell). Liefert nur abgeschlossene Kerzen, chronologisch.
 */
export async function fetchCandles(
  instrument: string,
  opts: { count?: number; from?: string } = {},
): Promise<Candle[]> {
  const params = new URLSearchParams({ granularity: "D", price: "M" });
  if (opts.from) {
    params.set("from", `${opts.from}T00:00:00Z`);
    // OANDA verlangt count ODER from+to/count; from+count=5000 deckt alles ab
    params.set("count", String(opts.count ?? 5000));
  } else {
    params.set("count", String(opts.count ?? 5000));
  }

  const res = await fetch(
    `${baseUrl()}/instruments/${instrument}/candles?${params}`,
    { headers: headers(), cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(`OANDA ${instrument}: HTTP ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { candles: OandaCandle[] };

  return json.candles
    .filter((c) => c.complete)
    .map((c) => ({
      date: c.time.slice(0, 10),
      open: parseFloat(c.mid.o),
      high: parseFloat(c.mid.h),
      low: parseFloat(c.mid.l),
      close: parseFloat(c.mid.c),
      volume: c.volume,
    }));
}
