import type { ReactNode } from "react";

/**
 * Label-über-Wert im Terminal-Stil: Uppercase-Label in blassem Grau,
 * darunter der Monospace-Wert (RATE / CPI YOY / 10Y usw.).
 */
export default function Metric({
  label,
  children,
  valueClassName = "",
  className = "",
}: {
  label: string;
  children: ReactNode;
  valueClassName?: string;
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="text-[9px] uppercase tracking-widest text-faint mb-0.5">{label}</div>
      <div className={`text-[13px] font-mono font-bold leading-tight ${valueClassName}`}>{children}</div>
    </div>
  );
}
