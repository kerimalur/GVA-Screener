import { chart } from "./chartTheme";
import type { Candle } from "@/lib/gva/api";

/**
 * Bewusst leichtgewichtiger Kurs-Chart (kein TradingView-Umfang): entweder
 * Kerzen (OHLC) oder eine Linie der Schlusskurse. Pures SVG, keine Abhängigkeit.
 * Eine gestrichelte Referenzlinie markiert den Kurs beim Signalstart, damit die
 * Bewegung „seit dem Signal" sofort ablesbar ist.
 *
 * viewBox-Einheiten: X = Kerzenindex, Y = 0..100. `preserveAspectRatio="none"`
 * füllt die Breite; `vectorEffect="non-scaling-stroke"` hält Striche trotz
 * Streckung dünn.
 */
export default function CandleChart({
  candles,
  mode,
}: {
  candles: Candle[];
  mode: "candle" | "line";
}) {
  if (candles.length < 2) {
    return (
      <div className="h-[260px] flex items-center justify-center text-muted text-sm">
        Zu wenig Kursdaten seit Signalstart.
      </div>
    );
  }

  const H = 100;
  const pad = 6;
  const min = mode === "line"
    ? Math.min(...candles.map((c) => c.close))
    : Math.min(...candles.map((c) => c.low));
  const max = mode === "line"
    ? Math.max(...candles.map((c) => c.close))
    : Math.max(...candles.map((c) => c.high));
  const span = max - min || 1;
  const y = (v: number) => pad + (H - 2 * pad) * (1 - (v - min) / span);
  const W = candles.length;
  const cx = (i: number) => i + 0.5;
  const baseY = y(candles[0].close);

  return (
    <div className="w-full h-[260px]">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full">
        {/* Referenz: Kurs beim Signalstart */}
        <line
          x1={0}
          x2={W}
          y1={baseY}
          y2={baseY}
          stroke={chart.border}
          strokeWidth={1}
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />
        {mode === "line" ? (
          <polyline
            points={candles.map((c, i) => `${cx(i)},${y(c.close)}`).join(" ")}
            fill="none"
            stroke={chart.accent}
            strokeWidth={1.5}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ) : (
          candles.map((c, i) => {
            const up = c.close >= c.open;
            const col = up ? chart.up : chart.down;
            const top = y(Math.max(c.open, c.close));
            const bot = y(Math.min(c.open, c.close));
            return (
              <g key={i}>
                <line
                  x1={cx(i)}
                  x2={cx(i)}
                  y1={y(c.high)}
                  y2={y(c.low)}
                  stroke={col}
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
                <rect
                  x={cx(i) - 0.32}
                  width={0.64}
                  y={top}
                  height={Math.max(bot - top, 0.4)}
                  fill={col}
                />
              </g>
            );
          })
        )}
      </svg>
    </div>
  );
}
