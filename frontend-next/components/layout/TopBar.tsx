"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { PAGE_TITLES } from "./nav";
import PairSearchBar from "./PairSearchBar";

export default function TopBar() {
  const pathname = usePathname();
  const title = PAGE_TITLES[pathname] ?? "FX Terminal";

  return (
    <header className="flex items-center justify-between px-10 py-[22px] border-b border-border sticky top-0 z-20 bg-bg/85 backdrop-blur-[10px]">
      <h1 className="text-xl font-extrabold tracking-tight">{title}</h1>

      <div className="flex items-center gap-4">
        <Suspense fallback={null}>
          <PairSearchBar />
        </Suspense>

        <div className="flex items-center gap-4 text-[12.5px] font-medium text-faint">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-up" />
            Live
          </div>
          <div suppressHydrationWarning className="font-mono">
            {new Date().toLocaleDateString("de-DE", {
              weekday: "short",
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            })}
          </div>
        </div>
      </div>
    </header>
  );
}
