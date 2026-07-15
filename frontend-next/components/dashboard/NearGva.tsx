"use client";

import { useEffect, useState } from "react";
import { fetchScreener, sortByDistance, type MarketData } from "@/lib/gva/api";

/** Alle Pairs innerhalb PIP_LIMIT Pips einer GVA-Linie — Schnellübersicht wie
 *  der Market-Scanner, unabhängig vom Q5/Q1-Wochenplan. */
const PIP_LIMIT = 50;
const POLL_MS = 15_000;

function Box({ md }: { md: MarketData }) {
  const hit = md.status === "HIT" || md.triggered;
  const cls = md.near === "LONG" ? "text-up" : "text-down";
  return (
    <div className="rounded border border-border/40 px-2.5 py-1.5 min-w-[92px]">
      <div className="font-mono font-bold text-xs">{md.pair}</div>
      <div className={`font-mono text-[11px] ${cls}`}>
        {hit ? (
          <>● HIT {md.near ?? ""}</>
        ) : (
          <>
            {md.distance != null ? `${md.distance.toFixed(0)}p` : "—"} {md.near ?? ""}
          </>
        )}
      </div>
    </div>
  );
}

export default function NearGva() {
  const [near, setNear] = useState<MarketData[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "offline">("loading");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const rows = await fetchScreener();
        if (!alive) return;
        const within = sortByDistance(
          rows.filter((r) => r.distance != null && r.distance <= PIP_LIMIT),
        );
        setNear(within);
        setState("ok");
      } catch {
        if (alive) setState("offline");
      }
    };
    queueMicrotask(load);
    const t = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (state === "offline") {
    return <p className="text-sm text-muted">GVA-Scanner offline — keine Live-Nähe.</p>;
  }
  if (state === "loading") {
    return <p className="text-sm text-muted">Lade Scanner…</p>;
  }
  if (near.length === 0) {
    return (
      <p className="text-sm text-muted">
        Kein Pair innerhalb {PIP_LIMIT} Pips einer GVA-Linie.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {near.map((md) => (
        <Box key={md.pair} md={md} />
      ))}
    </div>
  );
}
