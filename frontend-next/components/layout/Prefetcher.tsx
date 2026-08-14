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
 *
 * Seit dem Umbau zum Labor (13.08.2026) zeigen die vorgeladenen Routen auf
 * die Faktor- und Makro-Seiten; Cockpit und Journal gibt es hier nicht mehr.
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

const PREFETCH_ROUTES = [
  "/ml/engine-log",
  "/ml/factor-lab",
  "/ml/fundamental-track",
  "/makro/terminal",
];

export default function Prefetcher() {
  const router = useRouter();

  useEffect(() => {
    if (sessionStorage.getItem("labor-warmup-done")) return;
    sessionStorage.setItem("labor-warmup-done", "1");

    for (const url of WARM_URLS) {
      fetch(url, { cache: "no-store" }).catch(() => {});
    }
    for (const route of PREFETCH_ROUTES) {
      router.prefetch(route);
    }
  }, [router]);

  return null;
}
