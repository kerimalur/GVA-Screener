"use client";

interface SegmentedProps<T extends string> {
  options: { value: T; label: string; icon?: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/** Segment-Umschalter, z.B. EK/Funded oder Zeitraum-Filter */
export default function Segmented<T extends string>({
  options,
  value,
  onChange,
  className = "",
}: SegmentedProps<T>) {
  return (
    <div
      className={`inline-flex items-center bg-sidebar border border-border rounded-md p-0.5 gap-0.5 ${className}`}
      role="tablist"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded text-[12px] transition-colors border border-transparent ${
              // Aktiv = voller Akzent mit dunkler Schrift. Eine gedimmte
              // Fläche war auf dem dunklen Grund kaum vom Rest zu trennen.
              active
                ? "bg-accent text-sidebar font-semibold"
                : "text-muted hover:text-text font-medium"
            }`}
          >
            {opt.icon && <i className={`ph-bold ${opt.icon}`} />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
