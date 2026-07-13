"use client";

import { radarType, sortByDistance, type MarketData, type RadarType } from "@/lib/gva/api";

function tileStyle(type: RadarType): { wrapper: string; pairText: string; subText: string } {
  switch (type) {
    case "hit-short":
    case "hit-long":
      return {
        wrapper: "bg-warn/85 border-warn text-active",
        pairText: "text-active",
        subText: "text-active/90 bg-black/15",
      };
    case "short":
      return {
        wrapper: "bg-down/80 border-down text-active",
        pairText: "text-active",
        subText: "text-active/90 bg-black/15",
      };
    case "long":
      return {
        wrapper: "bg-up/80 border-up text-active",
        pairText: "text-active",
        subText: "text-active/90 bg-black/15",
      };
    default:
      return {
        wrapper: "bg-surface2 border-border text-muted hover:border-border2",
        pairText: "text-text",
        subText: "text-muted",
      };
  }
}

interface HeatmapViewProps {
  data: MarketData[];
  onSelect: (item: MarketData) => void;
}

export default function HeatmapView({ data, onSelect }: HeatmapViewProps) {
  const tiles = sortByDistance(data);

  return (
    <div className="max-w-[1400px] mx-auto space-y-4">
      <p className="text-[13px] text-muted">
        Ultra-kompakt. Die Farbe verrät alles. <strong className="text-text">Hits</strong> zeigen ein
        <span className="bg-down text-active px-1.5 py-0.5 rounded text-[10px] font-bold mx-1">S</span>
        (Short) oder
        <span className="bg-up text-active px-1.5 py-0.5 rounded text-[10px] font-bold mx-1">L</span>
        (Long) Abzeichen.
      </p>

      <div className="bg-surface rounded-md border border-border p-5">
        <div className="grid grid-cols-4 md:grid-cols-7 gap-3">
          {tiles.map((item) => {
            const type = radarType(item);
            const style = tileStyle(type);
            const isHit = type === "hit-short" || type === "hit-long";
            const badge = type === "hit-short" ? "S" : type === "hit-long" ? "L" : null;
            const sub = isHit
              ? type === "hit-short"
                ? "Hit Short"
                : "Hit Long"
              : item.distance != null
                ? `${item.distance.toFixed(0)} pips`
                : null;

            return (
              <div
                key={item.pair}
                onClick={() => onSelect(item)}
                className={`aspect-square flex flex-col justify-center items-center rounded cursor-pointer hover:scale-105 transition-transform relative border ${style.wrapper}`}
              >
                {badge && (
                  <div
                    className={`absolute top-2 right-2 flex items-center justify-center w-5 h-5 rounded-full text-active text-xs font-bold border border-active/20 ${
                      badge === "S" ? "bg-down" : "bg-up"
                    }`}
                  >
                    {badge}
                  </div>
                )}
                {isHit && (
                  <i className="ph-bold ph-warning-circle text-active text-2xl mb-1.5 animate-pulse" />
                )}
                <span className={`font-black text-sm tracking-wide ${style.pairText}`}>
                  {item.pair}
                </span>
                {sub && (
                  <span
                    className={`text-[10px] font-bold mt-1 px-2 py-0.5 rounded-full ${style.subText}`}
                  >
                    {sub}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
