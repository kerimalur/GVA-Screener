import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { INSTRUMENTS } from "@/lib/constants/instruments";

export const dynamic = "force-dynamic";

/**
 * GET /api/prices/live
 * Ruft für alle Instrumente den aktuellen Preis von OANDA ab (M5-Kerze).
 * Kein Cron nötig — wird direkt beim Seitenaufruf geladen.
 */
export async function GET() {
  const supabase = await createAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const key = process.env.OANDA_API_KEY;
  const baseUrl = process.env.OANDA_URL ?? "https://api-fxtrade.oanda.com/v3";
  if (!key) return NextResponse.json({ error: "OANDA_API_KEY fehlt" }, { status: 500 });

  const hdrs = {
    Authorization: `Bearer ${key}`,
    "Accept-Datetime-Format": "RFC3339",
  };

  // Alle Instrumente parallel abrufen
  const results = await Promise.allSettled(
    INSTRUMENTS.map(async (inst) => {
      const url = `${baseUrl}/instruments/${inst.instrument}/candles?granularity=M5&count=2&price=M`;
      const res = await fetch(url, { headers: hdrs, cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = (await res.json()) as {
        candles: { complete: boolean; time: string; mid: { c: string } }[];
      };

      // Letzter abgeschlossener Candle
      const complete = json.candles.filter((c) => c.complete);
      const last = complete[complete.length - 1];

      return {
        instrument: inst.instrument,
        displayName: inst.displayName,
        price: last ? parseFloat(last.mid.c) : null,
        time: last?.time ?? null,
      };
    }),
  );

  const prices: Record<string, { price: number | null; time: string | null; displayName: string }> = {};
  for (let i = 0; i < INSTRUMENTS.length; i++) {
    const r = results[i];
    const inst = INSTRUMENTS[i];
    if (r.status === "fulfilled") {
      prices[inst.instrument] = {
        price: r.value.price,
        time: r.value.time,
        displayName: r.value.displayName,
      };
    } else {
      prices[inst.instrument] = { price: null, time: null, displayName: inst.displayName };
    }
  }

  return NextResponse.json({ prices, fetchedAt: new Date().toISOString() });
}
