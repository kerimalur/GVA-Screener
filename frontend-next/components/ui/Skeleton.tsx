/** Loading-Platzhalter mit Shimmer. Höhe/Breite über className steuern. */
export default function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`rounded-md ${className}`}
      style={{
        background:
          "linear-gradient(90deg, var(--color-surface2) 25%, var(--color-border2) 50%, var(--color-surface2) 75%)",
        backgroundSize: "200% 100%",
        animation: "ui-shimmer 1.4s ease-in-out infinite",
      }}
    />
  );
}

/** Fertige Skeleton-Zeilengruppe für Listen/Tabellen */
export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2.5 py-1">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}
