import { useState } from 'react';
import type { G8Currency } from '../data/g8';
import { sortByScore } from '../data/g8';
import { useG8 } from '../data/useMacro';
import PairBiasModal from './PairBiasModal';

export default function StrengthMatrixView() {
  const [pair, setPair] = useState<{ strong: G8Currency; weak: G8Currency } | null>(null);

  const sorted = sortByScore(useG8());
  const strong = sorted.slice(0, 4);
  const weak = sorted.slice(4).reverse(); // schwächste zuerst rechts

  const edges = strong.flatMap((s) => weak.map((w) => s.score - w.score));
  const eMin = Math.min(...edges);
  const eMax = Math.max(...edges);

  return (
    <div className="tab-view block max-w-3xl mx-auto space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-textMain">Stärke-Matrix</h3>
          <p className="text-sm text-textMuted mt-1 max-w-md">
            Starke Währungen (Zeilen) gegen schwache (Spalten). Jede Zelle ist ein Long-Setup.{' '}
            <strong className="text-accent font-medium">Klicke eine Zelle für die Aufschlüsselung.</strong>
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-semibold text-textMuted">
          <span>Edge</span>
          <span className="w-20 h-2.5 rounded-full" style={{ background: 'linear-gradient(90deg, rgba(16,185,129,.14), rgba(16,185,129,.5))' }}></span>
          <span>hoch</span>
        </div>
      </div>

      <div className="bg-bgSurface rounded-2xl border border-borderLight shadow-sm p-5">
        <div className="grid gap-2" style={{ gridTemplateColumns: '96px repeat(4, 1fr)' }}>
          {/* Kopfzeile */}
          <div className="min-h-[60px] flex flex-col items-center justify-center gap-1 rounded-xl">
            <span className="text-[9.5px] font-bold tracking-wide text-win">LONG ▼</span>
            <span className="text-[9.5px] font-bold tracking-wide text-loss">SHORT ▶</span>
          </div>
          {weak.map((w) => (
            <div key={`h-${w.code}`} className="min-h-[60px] flex flex-col items-center justify-center gap-0.5 rounded-xl bg-lossBg/40 border border-loss/20">
              <span className="font-mono text-sm font-bold text-loss">{w.code}</span>
              <span className="text-[9px] uppercase tracking-wide text-loss/70 font-bold">schwach</span>
            </div>
          ))}

          {/* Zeilen */}
          {strong.map((s) => (
            <Row key={s.code} strong={s} weak={weak} eMin={eMin} eMax={eMax} onPick={(w) => setPair({ strong: s, weak: w })} />
          ))}
        </div>
        <p className="text-[11px] text-textMuted mt-4 leading-relaxed">
          <strong className="text-textMuted font-semibold">CADJPY</strong> = Long CAD / Short JPY. Das inverse Paar ist das Short-Setup.
        </p>
      </div>

      {pair && <PairBiasModal strong={pair.strong} weak={pair.weak} onClose={() => setPair(null)} />}
    </div>
  );
}

function Row({
  strong, weak, eMin, eMax, onPick,
}: {
  strong: G8Currency; weak: G8Currency[]; eMin: number; eMax: number; onPick: (w: G8Currency) => void;
}) {
  return (
    <>
      <div className="min-h-[60px] flex flex-col items-center justify-center gap-0.5 rounded-xl bg-winBg/40 border border-win/20">
        <span className="font-mono text-sm font-bold text-win">{strong.code}</span>
        <span className="text-[9px] uppercase tracking-wide text-win/70 font-bold">stark</span>
      </div>
      {weak.map((w) => {
        const edge = strong.score - w.score;
        const t = (edge - eMin) / (eMax - eMin || 1);
        const alpha = (0.1 + t * 0.36).toFixed(2);
        return (
          <button
            key={`${strong.code}-${w.code}`}
            onClick={() => onPick(w)}
            className="min-h-[60px] flex flex-col items-center justify-center gap-1 rounded-xl border border-win/20 hover:brightness-95 transition-all"
            style={{ background: `rgba(16,185,129,${alpha})` }}
          >
            <span className="font-mono text-[13px] font-bold text-textMain">{strong.code}{w.code}</span>
            <span className="font-mono text-[9.5px] font-bold text-win">Edge {edge.toFixed(1)}</span>
          </button>
        );
      })}
    </>
  );
}
