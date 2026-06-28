import { useState } from 'react';

// PLATZHALTER-Daten. Später aus Backend (Stark-vs-Schwach-Logik) ersetzbar.
const BULLISH: string[] = ['CADJPY', 'CADCHF', 'NZDJPY', 'NZDCHF'];
const BEARISH: string[] = ['JPYCAD', 'CHFCAD', 'EURCAD'];

interface PillProps {
  pair: string;
  variant: 'bull' | 'bear';
}

function Pill({ pair, variant }: PillProps) {
  const dot = variant === 'bull' ? 'bg-win' : 'bg-loss';
  const hover = variant === 'bull' ? 'hover:border-win/30 hover:bg-winBg/30' : 'hover:border-loss/30 hover:bg-lossBg/30';
  return (
    <div className={`matrix-pill flex items-center justify-between p-3 rounded-xl bg-bgBase border border-transparent transition-all cursor-pointer ${hover}`}>
      <div className="flex items-center gap-2">
        <div className={`w-1.5 h-1.5 rounded-full ${dot}`}></div>
        <span className="font-bold text-sm">{pair}</span>
      </div>
    </div>
  );
}

export default function StrengthMatrixView() {
  const [search, setSearch] = useState('');
  const q = search.toUpperCase();

  const bull = BULLISH.filter((p) => p.includes(q));
  const bear = BEARISH.filter((p) => p.includes(q));

  return (
    <div className="tab-view block max-w-[1400px] mx-auto space-y-6">
      <div className="mb-2 flex justify-between items-end">
        <p className="text-textMuted text-sm mt-1">
          Übersicht basierend auf der <strong className="text-textMain">Stark vs. Schwach</strong> Logik. Neutrale Paare sind ausgeblendet.
        </p>
        <div className="relative w-64">
          <i className="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-textMuted text-lg"></i>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Paar suchen (z.B. EUR)..."
            className="w-full bg-bgSurface border border-borderLight text-textMain text-sm font-medium rounded-lg pl-10 pr-3 py-2.5 focus:outline-none focus:border-accent shadow-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* BULLISH */}
        <div className="bg-bgSurface rounded-2xl border border-borderLight shadow-sm p-6">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-borderLight">
            <div className="w-10 h-10 rounded-xl bg-winBg text-win flex items-center justify-center">
              <i className="ph-bold ph-trend-up text-xl"></i>
            </div>
            <div>
              <h3 className="font-bold text-textMain">Bullish Fokus (Long)</h3>
              <p className="text-xs text-textMuted">Starke vs Schwache Währungen</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {bull.length === 0 ? (
              <p className="text-textMuted text-sm col-span-2">Keine Treffer.</p>
            ) : (
              bull.map((p) => <Pill key={p} pair={p} variant="bull" />)
            )}
          </div>
        </div>

        {/* BEARISH */}
        <div className="bg-bgSurface rounded-2xl border border-borderLight shadow-sm p-6">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-borderLight">
            <div className="w-10 h-10 rounded-xl bg-lossBg text-loss flex items-center justify-center">
              <i className="ph-bold ph-trend-down text-xl"></i>
            </div>
            <div>
              <h3 className="font-bold text-textMain">Bearish Fokus (Short)</h3>
              <p className="text-xs text-textMuted">Schwache vs Starke Währungen</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {bear.length === 0 ? (
              <p className="text-textMuted text-sm col-span-2">Keine Treffer.</p>
            ) : (
              bear.map((p) => <Pill key={p} pair={p} variant="bear" />)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
