import { chart } from "./chartTheme";

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}

/** Mini-Trendlinie (pures SVG, server-renderbar). */
export default function Sparkline({
  values,
  width = 90,
  height = 24,
  color,
}: SparklineProps) {
  if (values.length < 2) {
    return <div style={{ width, height }} className="bg-surface2 rounded-sm" />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * (width - 2) + 1;
      const y = height - 2 - ((v - min) / span) * (height - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const trendUp = values[values.length - 1] >= values[0];
  const stroke = color ?? (trendUp ? chart.up : chart.down);

  return (
    <svg width={width} height={height} className="shrink-0">
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth={1.3} />
    </svg>
  );
}
