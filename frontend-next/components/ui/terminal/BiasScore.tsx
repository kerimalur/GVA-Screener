interface BiasScoreProps {
  /** Score-Wert; null = keine Daten (blasses "–") */
  value: number | null;
  /** Nachkommastellen (Default 2) */
  digits?: number;
  size?: "sm" | "lg";
  /** Schwelle, ab der gefärbt wird (darunter neutral-grau) */
  threshold?: number;
  className?: string;
}

/**
 * Große Monospace-Bias-Zahl mit Vorzeichen und semantischer Farbe:
 * positiv grün, negativ rot, um 0 neutral-grau.
 */
export default function BiasScore({
  value,
  digits = 2,
  size = "lg",
  threshold = 0.001,
  className = "",
}: BiasScoreProps) {
  const cls =
    value === null || Math.abs(value) < threshold
      ? "text-muted"
      : value > 0
        ? "text-up"
        : "text-down";
  const sizeCls = size === "lg" ? "text-2xl" : "text-[15px]";
  return (
    <span className={`font-mono font-black leading-none ${sizeCls} ${cls} ${className}`}>
      {value === null ? "–" : `${value > 0 ? "+" : ""}${value.toFixed(digits)}`}
    </span>
  );
}
