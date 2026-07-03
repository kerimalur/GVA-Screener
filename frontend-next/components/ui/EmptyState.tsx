import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: string; // Phosphor-Klasse
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center py-14 px-6 anim-fade-in ${className}`}
    >
      <div className="w-12 h-12 rounded-full bg-surface2 border border-border2 flex items-center justify-center mb-4">
        <i className={`ph-bold ${icon} text-xl text-muted`} />
      </div>
      <h3 className="text-sm font-semibold mb-1">{title}</h3>
      {description && (
        <p className="text-[12px] text-muted max-w-sm mb-4">{description}</p>
      )}
      {action}
    </div>
  );
}
