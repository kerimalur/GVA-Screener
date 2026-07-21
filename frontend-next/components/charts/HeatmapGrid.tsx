"use client";

export interface HeatCell {
  value: number | null;
  label?: string; // Anzeige-Override (default: Zahl)
  title?: string; // Tooltip
  highlight?: boolean;
}

interface HeatmapGridProps {
  rows: string[];
  cols: string[];
  cells: HeatCell[][]; // [rowIdx][colIdx]
  /** Wertebereich für Farbskala (symmetrisch um 0 wenn min<0) */
  min: number;
  max: number;
  digits?: number;
  cellClassName?: string;
  onCellClick?: (row: number, col: number) => void;
}

// RGB-Komponenten von --color-up / --color-down (globals.css). Die Deckkraft
// trägt hier die Information, deshalb braucht es die Kanäle einzeln.
const UP_RGB = "79, 216, 138";
const DOWN_RGB = "240, 102, 92";

/** Wert → Farbe: negativ rot, positiv grün, um 0 neutral (Terminal-Palette). */
function cellColor(v: number, min: number, max: number): string {
  if (v >= 0) {
    const t = max > 0 ? Math.min(v / max, 1) : 0;
    return `rgba(${UP_RGB}, ${0.08 + t * 0.72})`;
  }
  const t = min < 0 ? Math.min(v / min, 1) : 0;
  return `rgba(${DOWN_RGB}, ${0.08 + t * 0.72})`;
}

export default function HeatmapGrid({
  rows,
  cols,
  cells,
  min,
  max,
  digits = 1,
  cellClassName = "",
  onCellClick,
}: HeatmapGridProps) {
  return (
    <div className="overflow-x-auto">
      <table className="border-collapse w-full">
        <thead>
          <tr>
            <th className="sticky left-0 bg-surface z-10" />
            {cols.map((c) => (
              <th
                key={c}
                className="px-1 py-1 text-[10px] font-mono font-semibold text-muted text-center whitespace-nowrap"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={r}>
              <td className="sticky left-0 bg-surface z-10 pr-2 py-0.5 text-[11px] font-mono font-semibold text-muted whitespace-nowrap">
                {r}
              </td>
              {cols.map((_, ci) => {
                const cell = cells[ri]?.[ci];
                if (!cell || cell.value === null) {
                  return (
                    <td key={ci} className="p-0.5">
                      <div className={`h-7 rounded-sm bg-surface2 flex items-center justify-center text-[10px] text-faint font-mono ${cellClassName}`}>
                        –
                      </div>
                    </td>
                  );
                }
                return (
                  <td key={ci} className="p-0.5">
                    <div
                      title={cell.title}
                      onClick={onCellClick ? () => onCellClick(ri, ci) : undefined}
                      className={`h-7 rounded-sm flex items-center justify-center text-[10px] font-mono font-semibold ${
                        onCellClick ? "cursor-pointer hover:ring-1 hover:ring-accent" : ""
                      } ${cell.highlight ? "ring-1 ring-accent" : ""} ${cellClassName}`}
                      style={{ backgroundColor: cellColor(cell.value, min, max) }}
                    >
                      {cell.label ?? cell.value.toFixed(digits)}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
