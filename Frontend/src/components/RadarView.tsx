import { useState } from 'react';
import type { MarketData, RadarType } from '../types';
import { radarType, sortByDistance } from '../api';

const CURRENCIES = ['Alle', 'EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'JPY'];

// Marker-Position (left %) auf der Bar: 0% = Long-Linie (links), 100% = Short-Linie (rechts).
function markerPct(item: MarketData, type: RadarType): number {
  const d = Math.min(item.distance ?? 100, 100);
  switch (type) {
    case 'hit-short':
      return 100;
    case 'hit-long':
      return 0;
    case 'short':
      return Math.max(20, 100 - d * 0.8); // näher an Short → weiter rechts
    case 'long':
      return Math.min(80, d * 0.8); // näher an Long → weiter links
    default:
      return 50;
  }
}

interface RadarRowStyle {
  marker: string;
  distanceText: string;
  pulse: boolean;
}

function rowStyle(type: RadarType): RadarRowStyle {
  switch (type) {
    case 'hit-short':
    case 'hit-long':
      return { marker: 'bg-hit', distanceText: 'text-hit', pulse: true };
    case 'short':
      return { marker: 'bg-loss', distanceText: 'text-loss', pulse: false };
    case 'long':
      return { marker: 'bg-win', distanceText: 'text-win', pulse: false };
    default:
      return { marker: 'bg-neutral', distanceText: 'text-textMuted', pulse: false };
  }
}

interface RadarViewProps {
  data: MarketData[];
  onSelect: (item: MarketData) => void;
}

export default function RadarView({ data, onSelect }: RadarViewProps) {
  const [filter, setFilter] = useState<string>('Alle');

  const filtered = filter === 'Alle' ? data : data.filter((d) => d.pair.includes(filter));
  const rows = sortByDistance(filtered);

  return (
    <div className="tab-view block max-w-[1400px] mx-auto space-y-6">
      <div className="mb-2">
        <p className="text-textMuted text-sm">
          Der Marktpreis wandert wie auf einem Zeitstrahl zwischen Short und Long.{' '}
          <strong className="text-accent font-medium">Klicke auf ein Paar für Details!</strong>
        </p>
      </div>

      {/* Währungs-Filter (ersetzt die alte Groups-Ansicht) */}
      <div className="flex flex-wrap gap-2">
        {CURRENCIES.map((ccy) => (
          <button
            key={ccy}
            onClick={() => setFilter(ccy)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${
              filter === ccy
                ? 'bg-accent text-white border-accent shadow-glow'
                : 'bg-bgSurface text-textMuted border-borderLight hover:text-textMain hover:border-accent/30'
            }`}
          >
            {ccy}
          </button>
        ))}
      </div>

      <div className="bg-bgSurface rounded-2xl border border-borderLight shadow-sm p-6 space-y-4">
        {/* Radar Header */}
        <div className="flex items-center text-xs font-bold uppercase tracking-wider text-textMuted border-b border-borderLight pb-3 px-2">
          <span className="w-24">Paar</span>
          <div className="flex-1 flex justify-between px-4">
            <span className="text-win">Long Line</span>
            <span>Markt Position</span>
            <span className="text-loss">Short Line</span>
          </div>
          <span className="w-24 text-right">Distanz</span>
        </div>

        {rows.length === 0 && (
          <div className="text-center text-textMuted text-sm py-10">Keine Paare für diesen Filter.</div>
        )}

        {rows.map((item) => {
          const type = radarType(item);
          const style = rowStyle(type);
          const pct = markerPct(item, type);
          const isHit = type === 'hit-short' || type === 'hit-long';
          const distanceLabel = isHit
            ? 'HIT'
            : item.distance != null
            ? `${item.distance.toFixed(1)} Pips`
            : '–';

          return (
            <div
              key={item.pair}
              onClick={() => onSelect(item)}
              className="flex items-center group cursor-pointer hover:bg-bgBase p-2.5 rounded-xl transition-colors -mx-2 border border-transparent hover:border-borderLight shadow-sm hover:shadow"
            >
              <div className="w-24 font-bold flex items-center gap-2 text-textMain group-hover:text-accent transition-colors">
                <div className={`w-2.5 h-2.5 rounded-full ${style.marker} ${style.pulse ? 'animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.6)]' : ''}`}></div>
                {item.pair}
              </div>

              <div className="flex-1 px-4 relative flex items-center">
                <div className="w-full h-1.5 bg-borderLight rounded-full relative">
                  {/* Long-Linie links (win), Short-Linie rechts (loss) */}
                  <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-4 bg-win rounded-full ${item.near === 'LONG' ? '' : 'opacity-30'}`}></div>
                  <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-4 bg-loss rounded-full ${item.near === 'SHORT' ? '' : 'opacity-30'}`}></div>
                  {/* Markt-Marker */}
                  <div
                    className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 ${style.marker} border-2 border-white rounded-full shadow-md z-10 transition-transform group-hover:scale-125`}
                    style={{ left: `${pct}%` }}
                  ></div>
                </div>
              </div>

              <div className={`w-24 text-right font-bold text-sm ${style.distanceText} group-hover:scale-105 transition-transform`}>
                {distanceLabel}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
