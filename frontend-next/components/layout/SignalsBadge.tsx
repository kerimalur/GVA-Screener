"use client";

import { useEffect, useState } from "react";
import { countNewSignals } from "@/lib/journal/signals";

/** Zähler neuer Scanner-Signale neben dem Nav-Eintrag (Poll alle 2 min). */
export default function SignalsBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const refresh = () =>
      countNewSignals()
        .then((n) => {
          if (!cancelled) setCount(n);
        })
        .catch(() => {});
    refresh();
    const id = setInterval(refresh, 120_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (count === 0) return null;
  return (
    <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-accent/20 text-accent text-[10px] font-bold inline-flex items-center justify-center">
      {count > 99 ? "99+" : count}
    </span>
  );
}
