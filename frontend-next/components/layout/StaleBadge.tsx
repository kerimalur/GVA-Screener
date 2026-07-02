interface StaleBadgeProps {
  reason?: string;
}

export default function StaleBadge({ reason = "Quelle eingestellt / veraltet" }: StaleBadgeProps) {
  return (
    <span
      title={reason}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-warn/10 text-warn border border-warn/30"
    >
      <i className="ph-bold ph-warning text-[10px]" />
      stale
    </span>
  );
}
