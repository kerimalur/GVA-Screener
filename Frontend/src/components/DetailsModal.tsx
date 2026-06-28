import type { MarketData, RadarType } from '../types';
import { radarType, targetLine } from '../api';

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
    case 'hit-short':
      return {
        badge: 'bg-hitBg text-hit',
        statusText: 'HIT AUSGELÖST (SHORT)',
        targetLabel: 'Auslöser (Short Line)',
        targetLabelColor: 'text-loss',
        container: 'bg-lossBg/30 border-loss/30',
        pulse: true,
      };
    case 'hit-long':
      return {
        badge: 'bg-hitBg text-hit',
        statusText: 'HIT AUSGELÖST (LONG)',
        targetLabel: 'Auslöser (Long Line)',
        targetLabelColor: 'text-win',
        container: 'bg-winBg/30 border-win/30',
        pulse: true,
      };
    case 'short':
      return {
        badge: 'bg-lossBg text-loss',
        statusText: 'Fokus: Short Line',
        targetLabel: 'Short Line',
        targetLabelColor: 'text-loss',
        container: 'bg-lossBg/40 border-loss/30',
        pulse: false,
      };
    case 'long':
      return {
        badge: 'bg-winBg text-win',
        statusText: 'Fokus: Long Line',
        targetLabel: 'Long Line',
        targetLabelColor: 'text-win',
        container: 'bg-winBg/40 border-win/30',
        pulse: false,
      };
    default:
      return {
        badge: 'bg-bgBase text-textMuted',
        statusText: 'Beobachten (Neutral)',
        targetLabel: 'Nächste Linie',
        targetLabelColor: 'text-textMuted',
        container: 'bg-bgSurface border-borderLight',
        pulse: false,
      };
  }
}

interface DetailsModalProps {
  item: MarketData;
  onClose: () => void;
  onMark: (pair: string, action: 'pending' | 'done') => void;
}

export default function DetailsModal({ item, onClose, onMark }: DetailsModalProps) {
  const type = radarType(item);
  const style = typeStyle(type);
  const target = targetLine(item, type);
  const distanceLabel = item.distance != null ? `${item.distance.toFixed(1)} Pips` : '– Pips';
  const now = new Date().toLocaleDateString('de-CH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className="fixed inset-0 bg-textMain/40 backdrop-blur-sm z-50 flex items-center justify-center transition-opacity duration-300 p-4"
      onClick={onClose}
    >
      <div className="bg-bgSurface rounded-2xl shadow-hover w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className="text-3xl font-black text-textMain tracking-tight">{item.pair}</h3>
            <div className="mt-2">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold ${style.badge}`}>
                <span className={`w-2 h-2 rounded-full bg-current ${style.pulse ? 'animate-pulse' : ''}`}></span>
                {style.statusText}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-textMuted hover:text-textMain hover:bg-bgBase p-2 rounded-lg transition-colors"
          >
            <i className="ph-bold ph-x text-lg"></i>
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-center p-4 bg-bgBase rounded-xl border border-borderLight">
            <span className="text-sm font-semibold text-textMuted uppercase tracking-wider">Marktpreis</span>
            <span className="font-mono text-xl font-bold text-textMain">{item.price.toFixed(5)}</span>
          </div>

          <div className={`p-4 rounded-xl border flex flex-col gap-2 relative overflow-hidden ${style.container}`}>
            <div className="flex justify-between items-start z-10">
              <div>
                <span className={`text-xs font-bold uppercase tracking-wider block mb-1 ${style.targetLabelColor}`}>
                  {style.targetLabel}
                </span>
                <span className="font-mono text-xl font-bold">{target.level != null ? target.level.toFixed(5) : '–'}</span>
              </div>
              <div className="text-right">
                <span className="text-xs font-semibold text-textMuted uppercase tracking-wider block mb-1">Distanz</span>
                <span className="text-lg font-bold">{distanceLabel}</span>
              </div>
            </div>
            <div className="text-[11px] text-textMuted/80 mt-1 z-10 font-medium">
              Linie generiert am: {target.date ?? '–'}
            </div>
          </div>

          {item.last_touched && (
            <div className="pt-2">
              <div className="text-textMuted text-[10px] font-bold tracking-widest mb-2 uppercase">Historische Mitigation</div>
              <div className="flex justify-between items-center bg-bgBase p-3 rounded-lg border border-borderLight">
                <span className={`text-xs font-bold tracking-widest ${item.last_touched.type === 'SHORT' ? 'text-loss' : 'text-win'}`}>
                  {item.last_touched.type}
                </span>
                <span className="font-mono text-sm text-textMain">{item.last_touched.level.toFixed(5)}</span>
              </div>
              <div className="flex justify-between mt-1.5 text-[10px] font-mono text-textMuted">
                <span>Est: {item.last_touched.date}</span>
                <span>Hit: {item.last_touched.touched_date}</span>
              </div>
            </div>
          )}
        </div>

        {/* Aktionen nur bei getroffenem (HIT/triggered) Paar — Sticky-HIT-Lifecycle */}
        {item.triggered && (
          <div className="flex gap-3 mt-6">
            <button
              onClick={() => onMark(item.pair, 'pending')}
              className={`flex-1 py-3 rounded-xl text-xs font-bold tracking-widest transition-all border ${
                item.pending
                  ? 'bg-hitBg border-hit text-hit'
                  : 'bg-bgBase border-borderLight text-textMain hover:border-hit'
              }`}
            >
              {item.pending ? 'PENDING ✓' : 'PENDING'}
            </button>
            <button
              onClick={() => onMark(item.pair, 'done')}
              className="flex-1 py-3 rounded-xl text-xs font-bold tracking-widest transition-all bg-win hover:bg-emerald-600 text-white"
            >
              SETUP FERTIG
            </button>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-borderLight flex justify-between items-center">
          <span className="text-[11px] text-textMuted font-medium flex items-center gap-1">
            <i className="ph ph-clock"></i> {now} Uhr
          </span>
        </div>
      </div>
    </div>
  );
}
