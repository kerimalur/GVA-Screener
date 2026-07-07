"use client";

import { chart } from "./chartTheme";

interface GaugeArcProps {
  /** 0..100 */
  value: number;
  label?: string;
  /** Beschriftung links/rechts (z.B. 'Risk-Off' / 'Risk-On' oder 'Short' / 'Long') */
  leftLabel?: string;
  rightLabel?: string;
  size?: number;
  /** Farbverlauf invertieren (hoher Wert = rot) */
  invert?: boolean;
}

/** Halbkreis-Gauge (SVG, ohne Lib-Overhead). */
export default function GaugeArc({
  value,
  label,
  leftLabel,
  rightLabel,
  size = 160,
  invert = false,
}: GaugeArcProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const angle = (clamped / 100) * 180;
  const r = size / 2 - 10;
  const cx = size / 2;
  const cy = size / 2;

  // Zeiger-Endpunkt
  const rad = ((180 - angle) * Math.PI) / 180;
  const nx = cx + r * 0.75 * Math.cos(rad);
  const ny = cy - r * 0.75 * Math.sin(rad);

  const t = invert ? 1 - clamped / 100 : clamped / 100;
  const color = t > 0.6 ? chart.up : t < 0.4 ? chart.down : chart.warn;

  const arc = (start: number, end: number, stroke: string, opacity = 1) => {
    const s = ((180 - start) * Math.PI) / 180;
    const e = ((180 - end) * Math.PI) / 180;
    return (
      <path
        d={`M ${cx + r * Math.cos(s)} ${cy - r * Math.sin(s)} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(e)} ${cy - r * Math.sin(e)}`}
        stroke={stroke}
        strokeOpacity={opacity}
        strokeWidth={10}
        fill="none"
        strokeLinecap="round"
      />
    );
  };

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 2 + 24} viewBox={`0 0 ${size} ${size / 2 + 24}`}>
        {/* Skala: rot -> gelb -> grün (bzw. invertiert) */}
        {arc(0, 60, invert ? chart.up : chart.down, 0.55)}
        {arc(60, 120, chart.warn, 0.55)}
        {arc(120, 180, invert ? chart.down : chart.up, 0.55)}
        {/* Zeiger */}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={color} strokeWidth={2.5} />
        <circle cx={cx} cy={cy} r={4} fill={color} />
        <text
          x={cx}
          y={cy - 14}
          textAnchor="middle"
          fill={color}
          fontSize={size / 8}
          fontWeight={700}
          fontFamily="monospace"
        >
          {Math.round(clamped)}
        </text>
      </svg>
      <div className="flex justify-between w-full px-2 -mt-3 text-[10px] font-mono text-muted">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
      {label && <div className="text-[11px] text-muted mt-1 text-center">{label}</div>}
    </div>
  );
}
