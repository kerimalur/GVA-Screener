import type { MarketData, RadarType } from '../types';
import { radarType, sortByDistance } from '../api';

interface TileStyle {
  wrapper: string;
  pairText: string;
  subText: string;
}

function tileStyle(type: RadarType): TileStyle {
  switch (type) {
    case 'hit-short':
    case 'hit-long':
      return {
        wrapper: 'bg-hit border-hit/50 text-white shadow-md',
        pairText: 'text-white',
        subText: 'text-white/90 bg-black/10',
      };
    case 'short':
      return {
        wrapper: 'bg-loss border-loss/50 text-white shadow-sm',
        pairText: 'text-white',
        subText: 'text-white/90 bg-black/10',
      };
    case 'long':
      return {
        wrapper: 'bg-win border-win/50 text-white shadow-sm',
        pairText: 'text-white',
        subText: 'text-white/90 bg-black/10',
      };
    default:
      return {
        wrapper: 'bg-bgBase border-borderLight text-textMuted hover:bg-gray-200',
        pairText: 'text-textMain',
        subText: 'text-textMuted',
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
    <div className="tab-view block max-w-[1400px] mx-auto space-y-6">
      <div className="mb-2">
        <p className="text-sm text-textMuted">
          Ultra-kompakt. Die Farbe verrät alles. <strong className="text-textMain">Hits</strong> zeigen ein
          <span className="bg-loss text-white px-1.5 py-0.5 rounded text-[10px] font-bold mx-1">S</span> (Short) oder
          <span className="bg-win text-white px-1.5 py-0.5 rounded text-[10px] font-bold mx-1">L</span> (Long) Abzeichen.
        </p>
      </div>

      <div className="bg-bgSurface rounded-2xl border border-borderLight shadow-sm p-6">
        <div className="grid grid-cols-4 md:grid-cols-7 gap-4">
          {tiles.map((item) => {
            const type = radarType(item);
            const style = tileStyle(type);
            const isHit = type === 'hit-short' || type === 'hit-long';
            const badge = type === 'hit-short' ? 'S' : type === 'hit-long' ? 'L' : null;
            const sub = isHit
              ? type === 'hit-short'
                ? 'Hit Short'
                : 'Hit Long'
              : item.distance != null
              ? `${item.distance.toFixed(0)} pips`
              : null;

            return (
              <div
                key={item.pair}
                onClick={() => onSelect(item)}
                className={`aspect-square flex flex-col justify-center items-center rounded-xl cursor-pointer hover:scale-105 transition-transform relative border ${style.wrapper}`}
              >
                {badge && (
                  <div
                    className={`absolute top-2 right-2 flex items-center justify-center w-5 h-5 rounded-full text-white text-xs font-bold shadow-md border border-white/20 ${
                      badge === 'S' ? 'bg-loss' : 'bg-win'
                    }`}
                  >
                    {badge}
                  </div>
                )}
                {isHit && <i className="ph-fill ph-warning-circle text-white text-2xl mb-1.5 animate-pulse"></i>}
                <span className={`font-black text-sm tracking-wide ${style.pairText}`}>{item.pair}</span>
                {sub && (
                  <span className={`text-[10px] font-bold mt-1 px-2 py-0.5 rounded-full ${style.subText}`}>{sub}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
