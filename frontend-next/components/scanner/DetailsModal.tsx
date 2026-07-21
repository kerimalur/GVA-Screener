"use client";

import { radarType, targetLine, type MarketData, type RadarType } from "@/lib/gva/api";

interface TypeStyle {
  badge: string;
  statusText: string;
  targetLabel: string;
  targetLabelColor: string;
  container: string;
  pulse: boolean;
}

function typeStyle(type: RadarType): TypeStyle {
  switch (type) {
    case "hit-short":
      return {
        badge: "bg-warn/15 text-warn",
        statusText: "HIT AUSGELÖST (SHORT)",
        targetLabel: "Auslöser (Short Line)",
        targetLabelColor: "text-down",
        container: "bg-down/10 border-down/30",
        pulse: true,
      };
    case "hit-long":
      return {
        badge: "bg-warn/15 text-warn",
        statusText: "HIT AUSGELÖST (LONG)",
        targetLabel: "Auslöser (Long Line)",
        targetLabelColor: "text-up",
        container: "bg-up/10 border-up/30",
        pulse: true,
      };
    case "short":
      return {
        badge: "bg-down/15 text-down",
        statusText: "Fokus: Short Line",
        targetLabel: "Short Line",
        targetLabelColor: "text-down",
        container: "bg-down/10 border-down/30",
        pulse: false,
      };
    case "long":
      return {
        badge: "bg-up/15 text-up",
        statusText: "Fokus: Long Line",
        targetLabel: "Long Line",
        targetLabelColor: "text-up",
        container: "bg-up/10 border-up/30",
        pulse: false,
      };
    default:
      return {
        badge: "bg-surface2 text-muted",
        statusText: "Beobachten (Neutral)",
        targetLabel: "Nächste Linie",
        targetLabelColor: "text-muted",
        container: "bg-surface2 border-border",
        pulse: false,
      };
  }
}

interface DetailsModalProps {
  item: MarketData;
  onClose: () => void;
  onMark: (pair: string, action: "pending" | "done") => void;
  /** „Pending" = Hit-Pair manuell übernehmen (Cockpit + Outlook auf „Aktiv"). */
  onAdopt: (item: MarketData) => void;
}

export default function DetailsModal({ item, onClose, onMark, onAdopt }: DetailsModalProps) {
  const type = radarType(item);
  const style = typeStyle(type);
  const target = targetLine(item, type);
  const distanceLabel = item.distance != null ? `${item.distance.toFixed(1)} Pips` : "– Pips";
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
        className="bg-surface border border-border2 rounded-md w-full max-w-sm p-6"
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

          <div className={`p-4 rounded border flex flex-col gap-2 ${style.container}`}>
            <div className="flex justify-between items-start">
              <div>
                <span
                  className={`text-[10px] font-bold uppercase tracking-widest block mb-1 ${style.targetLabelColor}`}
                >
                  {style.targetLabel}
                </span>
                <span className="font-mono text-lg font-bold">
                  {target.level != null ? target.level.toFixed(5) : "–"}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-semibold text-muted uppercase tracking-widest block mb-1">
                  Distanz
                </span>
                <span className="text-base font-bold font-mono">{distanceLabel}</span>
              </div>
            </div>
            <div className="text-[11px] text-muted mt-1">
              Linie generiert am: {target.date ?? "–"}
            </div>
          </div>

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
