"use client";

import { usePathname } from "next/navigation";
import { PAGE_TITLES } from "./nav";

export default function TopBar() {
  const pathname = usePathname();
  const title = PAGE_TITLES[pathname] ?? "FX Terminal";

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "22px 40px",
        borderBottom: "1px solid var(--color-border)",
        position: "sticky",
        top: 0,
        background: "rgba(10,11,14,0.85)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        zIndex: 20,
      }}
    >
      <h1 style={{ fontSize: "20px", fontWeight: 800, letterSpacing: "-0.3px" }}>
        {title}
      </h1>
      <div style={{ display: "flex", alignItems: "center", gap: "16px", fontSize: "12.5px", color: "var(--color-faint)", fontWeight: 500 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--color-up)", display: "inline-block" }} />
          Live
        </div>
        <div suppressHydrationWarning>
          {new Date().toLocaleDateString("de-DE", {
            weekday: "short",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })}
        </div>
      </div>
    </header>
  );
}
