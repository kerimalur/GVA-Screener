import type { ReactNode } from "react";

export interface TerminalColumn<T> {
  key: string;
  header: ReactNode;
  align?: "left" | "right" | "center";
  /** Monospace-Zelle (Pflicht für alle Zahlenwerte) */
  mono?: boolean;
  render: (row: T) => ReactNode;
}

/**
 * Einheitliche Terminal-Tabelle: Uppercase-Header in blassem Grau,
 * dezente Zeilen-Trenner, kein Zebra, Monospace für Zahlen-Spalten.
 */
export default function TerminalTable<T>({
  columns,
  rows,
  rowKey,
  className = "",
}: {
  columns: TerminalColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  className?: string;
}) {
  const alignCls = (a?: string) =>
    a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-widest text-muted border-b border-border">
            {columns.map((c) => (
              <th key={c.key} className={`py-1.5 px-2 first:pl-0 last:pr-0 font-semibold ${alignCls(c.align)}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey(row, i)} className="border-b border-border/40">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`py-1.5 px-2 first:pl-0 last:pr-0 ${alignCls(c.align)} ${c.mono ? "font-mono" : ""}`}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
