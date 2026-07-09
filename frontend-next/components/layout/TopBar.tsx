"use client";

import { usePathname } from "next/navigation";
import { PAGE_TITLES } from "./nav";

export default function TopBar() {
  const pathname = usePathname();
  const title = PAGE_TITLES[pathname] ?? "FX Terminal";

  return (
    <header className="h-12 shrink-0 border-b border-border bg-surface flex items-center justify-between px-6 sticky top-0 z-20">
      <h1 className="text-sm font-semibold tracking-wide">{title}</h1>
      <div className="flex items-center gap-3 text-[11px] text-muted font-mono">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-up animate-pulse" />
          Live
        </span>
        <span suppressHydrationWarning>
          {new Date().toLocaleDateString("de-DE", {
            weekday: "short",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })}
        </span>
      </div>
    </header>
  );
}
