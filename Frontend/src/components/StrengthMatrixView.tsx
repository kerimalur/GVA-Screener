import { useState } from 'react';
import Panel from './Panel';

// PLATZHALTER-Daten. Später aus Backend (Stark-vs-Schwach-Logik) ersetzbar.
// strength = aggregierter Bias (0–100), treibt die Balkenbreite.
const BULLISH: { pair: string; strength: number }[] = [
  { pair: 'CADJPY', strength: 92 },
  { pair: 'CADCHF', strength: 81 },
  { pair: 'NZDJPY', strength: 74 },
  { pair: 'NZDCHF', strength: 63 },
];
const BEARISH: { pair: string; strength: number }[] = [
  { pair: 'JPYCAD', strength: 88 },
  { pair: 'CHFCAD', strength: 70 },
  { pair: 'EURCAD', strength: 58 },
];

interface RowProps {
  pair: string;
  strength: number;
  variant: 'bull' | 'bear';
}

function MatrixRow({ pair, strength, variant }: RowProps) {
  const isBull = variant === 'bull';
  const bar = isBull ? 'bg-win/80' : 'bg-loss/80';
  const val = isBull ? 'text-win' : 'text-loss';
  return (
    <div className="matrix-pill flex items-center gap-3 px-5 py-2.5 hover:bg-bgBase transition-colors">
      <span className="font-mono font-bold text-sm text-textMain w-20">{pair}</span>
      <div className="flex-1 h-1.5 bg-bgBase rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${strength}%` }}></div>
      </div>
      <span className={`font-mono text-xs font-semibold w-10 text-right ${val}`}>{strength}</span>
    </div>
  );
}

export default function StrengthMatrixView() {
  const [search, setSearch] = useState('');
  const q = search.toUpperCase();

  const bull = BULLISH.filter((p) => p.pair.includes(q));
  const bear = BEARISH.filter((p) => p.pair.includes(q));

  return (
    <div className="tab-view block max-w-[1400px] mx-auto space-y-4">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
        <p className="text-textMuted text-sm">
          Bias aus der <strong className="text-textMain font-semibold">Stark vs. Schwach</strong> Logik. Neutrale Paare ausgeblendet.
        </p>
        <div className="relative w-full sm:w-64">
          <i className="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-textMuted text-base"></i>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Paar filtern (z.B. EUR)…"
            className="w-full bg-bgSurface border border-borderLight text-textMain text-sm font-mono rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:border-accent shadow-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel
          title="Bullish Fokus · Long"
          bodyClass="p-0"
          right={<span className="font-mono text-xs text-textMuted">{bull.length}</span>}
        >
          <div className="divide-y divide-borderLight">
            {bull.length === 0 ? (
              <p className="text-textMuted text-sm px-5 py-4">Keine Treffer.</p>
            ) : (
              bull.map((p) => <MatrixRow key={p.pair} pair={p.pair} strength={p.strength} variant="bull" />)
            )}
          </div>
        </Panel>

        <Panel
          title="Bearish Fokus · Short"
          bodyClass="p-0"
          right={<span className="font-mono text-xs text-textMuted">{bear.length}</span>}
        >
          <div className="divide-y divide-borderLight">
            {bear.length === 0 ? (
              <p className="text-textMuted text-sm px-5 py-4">Keine Treffer.</p>
            ) : (
              bear.map((p) => <MatrixRow key={p.pair} pair={p.pair} strength={p.strength} variant="bear" />)
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
