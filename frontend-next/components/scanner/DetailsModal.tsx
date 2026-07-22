"use client";

import { radarType, type MarketData, type RadarType, type RecentGva } from "@/lib/gva/api";

interface BadgeStyle {
  badge: string;
  statusText: string;
  pulse: boolean;
}

function badgeStyle(type: RadarType): BadgeStyle {
  switch (type) {
    case "hit-short":
      return { badge: "bg-warn/15 text-warn", statusText: "HIT AUSGELÖST (SHORT)", pulse: true };
    case "hit-long":
      return { badge: "bg-warn/15 text-warn", statusText: "HIT AUSGELÖST (LONG)", pulse: true };
    case "short":
      return { badge: "bg-down/15 text-down", statusText: "Fokus: Short Line", pulse: false };
    case "long":
      return { badge: "bg-up/15 text-up", statusText: "Fokus: Long Line", pulse: false };
    default:
      return { badge: "bg-surface2 text-muted", statusText: "Beobachten (Neutral)", pulse: false };
  }
}

/** Pip-Distanz Preis → Linie (positiv = Linie noch nicht erreicht). */
function pipDistance(pair: string, price: number, level: number, side: "SHORT" | "LONG"): number {
  const pip = pair.includes("JPY") ? 0.01 : 0.0001;
  return (side === "SHORT" ? level - price : price - level) / pip;
}

/** Eine der beiden nächsten Linien (Long bzw. Short), klar beschriftet. */
function LineRow({
  side,
  level,
  date,
  price,
  pair,
  isNear,
}: {
  side: "SHORT" | "LONG";
  level: number | null;
  date: string | null;
  price: number;
  pair: string;
  isNear: boolean;
}) {
  const long = side === "LONG";
  const label = long ? "Nächste Long-Linie" : "Nächste Short-Linie";
  const color = long ? "text-up" : "text-down";
  const container = long ? "bg-up/10 border-up/30" : "bg-down/10 border-down/30";
  const dist = level != null ? pipDistance(pair, price, level, side) : null;

  return (
    <div className={`p-4 rounded border flex flex-col gap-2 ${container}`}>
      <div className="flex justify-between items-start">
        <div>
          <span className={`text-[10px] font-bold uppercase tracking-widest block mb-1 ${color}`}>
            {label}
            {isNear && level != null && (
              <span className="ml-1.5 text-[9px] text-muted normal-case tracking-normal">
                (am nächsten)
              </span>
            )}
          </span>
          <span className="font-mono text-lg font-bold">
            {level != null ? level.toFixed(5) : "–"}
          </span>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-semibold text-muted uppercase tracking-widest block mb-1">
            Distanz
          </span>
          <span className="text-base font-bold font-mono">
            {dist != null ? `${Math.abs(dist).toFixed(1)} Pips` : "– Pips"}
          </span>
        </div>
      </div>
      <div className="text-[11px] text-muted mt-1">Linie generiert am: {date ?? "–"}</div>
    </div>
  );
}

function HistoryRow({ g }: { g: RecentGva }) {
  const long = g.type === "LONG";
  return (
    <div className="flex justify-between items-center bg-surface2 p-2.5 rounded border border-border">
      <span
        className={`text-[10px] font-bold tracking-widest px-1.5 py-0.5 rounded ${
          long ? "bg-up/15 text-up" : "bg-down/15 text-down"
        }`}
      >
        {long ? "LONG" : "SHORT"}
      </span>
      <span className="font-mono text-sm">{g.level.toFixed(5)}</span>
      <span className="text-[10px] font-mono text-muted">{g.date}</span>
    </div>
  );
}

interface DetailsModalProps {
  item: MarketData;
  onClose: () => void;
  onMark: (pair: string, action: "pending" | "done") => void;
  /** „Pending" = Hit-Pair manuell übernehmen (Cockpit + Outlook auf „Aktiv"). */
  onAdopt: (item: MarketData) => void;
}

export default function DetailsModal({ item, onClose, onMark, onAdopt }: DetailsModalProps) {
  const style = badgeStyle(radarType(item));
  const history = item.recent_gvas ?? [];
  const now = new Date().toLocaleDateString("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border2 rounded-md w-full max-w-sm p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className="text-2xl font-black tracking-tight">{item.pair}</h3>
            <div className="mt-2">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold ${style.badge}`}
              >
                <span
                  className={`w-2 h-2 rounded-full bg-current ${style.pulse ? "animate-pulse" : ""}`}
                />
                {style.statusText}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-text hover:bg-surface2 p-2 rounded transition-colors"
          >
            <i className="ph-bold ph-x text-lg" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-center p-4 bg-surface2 rounded border border-border">
            <span className="text-xs font-semibold text-muted uppercase tracking-wider">
              Marktpreis
            </span>
            <span className="font-mono text-lg font-bold">{item.price.toFixed(5)}</span>
          </div>

          {/* Nächste Long- UND nächste Short-Linie, jeweils klar beschriftet. */}
          <LineRow
            side="LONG"
            level={item.long}
            date={item.long_date}
            price={item.price}
            pair={item.pair}
            isNear={item.near === "LONG"}
          />
          <LineRow
            side="SHORT"
            level={item.short}
            date={item.short_date}
            price={item.price}
            pair={item.pair}
            isNear={item.near === "SHORT"}
          />

          {/* Aufklappbare Historie: letzte GVAs zur manuellen Setup-Verifikation. */}
          <details className="group">
            <summary className="cursor-pointer select-none text-[11px] font-bold tracking-widest uppercase text-muted hover:text-text py-1 flex items-center gap-1.5">
              <i className="ph-bold ph-caret-right text-xs transition-transform group-open:rotate-90" />
              Letzte GVA-Linien ({history.length})
            </summary>
            <div className="pt-2 space-y-1.5">
              {history.length > 0 ? (
                history.map((g, i) => <HistoryRow key={`${g.type}-${g.level}-${i}`} g={g} />)
              ) : (
                <p className="text-[11px] text-muted">
                  Keine aktiven GVA-Linien hinterlegt (oder Backend-Version ohne Historie).
                </p>
              )}
            </div>
          </details>

          {item.last_touched && (
            <div className="pt-2">
              <div className="text-muted text-[10px] font-bold tracking-widest mb-2 uppercase">
                Historische Mitigation
              </div>
              <div className="flex justify-between items-center bg-surface2 p-3 rounded border border-border">
                <span
                  className={`text-xs font-bold tracking-widest ${
                    item.last_touched.type === "SHORT" ? "text-down" : "text-up"
                  }`}
                >
                  {item.last_touched.type}
                </span>
                <span className="font-mono text-sm">{item.last_touched.level.toFixed(5)}</span>
              </div>
              <div className="flex justify-between mt-1.5 text-[10px] font-mono text-muted">
                <span>Est: {item.last_touched.date}</span>
                <span>Hit: {item.last_touched.touched_date}</span>
              </div>
            </div>
          )}
        </div>

        {/* Aktionen nur bei getroffenem (HIT/triggered) Paar — Sticky-HIT-Lifecycle.
            „Pending" übernimmt das Pair manuell: es bleibt im Cockpit als Getroffen
            stehen und taucht im Outlook mit Status „Aktiv" auf. „Setup fertig"
            verbraucht die Linie. */}
        {item.triggered && (
          <div className="flex gap-3 mt-6">
            <button
              onClick={() => onAdopt(item)}
              title={'Ins Cockpit übernehmen & Outlook auf „Aktiv" setzen'}
              className="flex-1 py-3 rounded text-xs font-bold tracking-widest transition-all border bg-surface2 border-border text-text hover:border-warn hover:text-warn"
            >
              PENDING → COCKPIT
            </button>
            <button
              onClick={() => onMark(item.pair, "done")}
              className="flex-1 py-3 rounded text-xs font-bold tracking-widest transition-all bg-up hover:bg-up/80 text-active"
            >
              SETUP FERTIG
            </button>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-border flex justify-between items-center">
          <span className="text-[11px] text-muted flex items-center gap-1">
            <i className="ph-bold ph-clock" /> {now} Uhr
          </span>
        </div>
      </div>
    </div>
  );
}
