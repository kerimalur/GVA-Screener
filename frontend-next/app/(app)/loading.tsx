/** Sofortiges Lade-Skeleton bei Seitenwechseln — Navigation fühlt sich nicht mehr "hängend" an. */
export default function Loading() {
  return (
    <div className="space-y-5 max-w-[1500px] mx-auto anim-fade-in">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rounded-lg border border-border bg-surface p-4 animate-pulse"
        >
          <div className="h-3.5 w-48 rounded bg-surface2 mb-2" />
          <div className="h-2.5 w-72 rounded bg-surface2/70 mb-4" />
          <div className="h-40 rounded bg-surface2/50" />
        </div>
      ))}
    </div>
  );
}
