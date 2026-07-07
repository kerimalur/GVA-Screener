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
      className={`inline-flex items-center bg-bg border border-border2 rounded-md p-0.5 gap-0.5 ${className}`}
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
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded text-[12px] font-medium transition-colors ${
              active
                ? "bg-surface2 text-text border border-border2"
                : "text-muted hover:text-text border border-transparent"
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
