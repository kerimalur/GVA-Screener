"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Hintergrund-Warmup nach Login/App-Start (fire-and-forget):
 * 1. weckt das Render-Backend sofort (Kaltstart läuft, während man noch
 *    auf schnellen Seiten ist — nicht erst beim Klick auf Fundamental-Track)
 * 2. füllt die Server-Caches der schweren API-Routen (COT, Season)
 * 3. prefetcht die Analyse-Routen fürs Next.js-Routing
 * Läuft einmal pro Session (sessionStorage-Guard).
 */

const GVA_API = (process.env.NEXT_PUBLIC_GVA_API_URL || "https://gva-screener.onrender.com").replace(
  /\/+$/,
  "",
);

const WARM_URLS = [
  `${GVA_API}/api/health`,
  `${GVA_API}/replay/fundamental-track?pair=EUR_USD&weeks=52`,
  "/api/cot/intelligence",
  "/api/ml/season",
];

// Nur erreichbare Routen: /ml/fundamental-track, /cot/intelligence und
// /ml/season sind über `lib/nav/hidden.ts` gesperrt — sie zu prefetchen hiesse,
// einen Redirect auf den Launcher vorzuladen.
const PREFETCH_ROUTES = ["/cockpit", "/ml/ranking", "/journal", "/journal/outlook"];

export default function Prefetcher() {
  const router = useRouter();

  useEffect(() => {
    if (sessionStorage.getItem("gva-warmup-done")) return;
    sessionStorage.setItem("gva-warmup-done", "1");

    for (const url of WARM_URLS) {
      fetch(url, { cache: "no-store" }).catch(() => {});
    }
    for (const route of PREFETCH_ROUTES) {
      router.prefetch(route);
    }
  }, [router]);

  return null;
}
