import { useState } from 'react';
import type { G8Currency } from '../data/g8';
import { sortByScore, tierLabel } from '../data/g8';
import { useG8 } from '../data/useMacro';
import CurrencyStrengthModal from './CurrencyStrengthModal';

const MAX_ABS = 9.5;

export default function PowerIndexView() {
  const [selected, setSelected] = useState<{ ccy: G8Currency; rank: number } | null>(null);
  const rows = sortByScore(useG8());

  return (
    <div className="tab-view block max-w-3xl mx-auto space-y-4">
      <div>
        <h3 className="text-lg font-bold text-textMain">G8 Stärke-Rangliste</h3>
        <p className="text-sm text-textMuted mt-1 max-w-xl">
          Alle acht Hauptwährungen, sortiert von stark zu schwach an einer gemeinsamen Null-Linie.{' '}
          <strong className="text-accent font-medium">Klicke eine Währung für Details.</strong>
        </p>
      </div>

      <div className="bg-bgSurface rounded-xl border border-borderLight shadow-sm overflow-hidden">
        <div className="grid grid-cols-[36px_180px_1fr_96px] items-center gap-4 px-5 py-2.5 bg-bgBase border-b border-borderLight text-[10px] font-bold uppercase tracking-wider text-neutral">
          <span>#</span>
          <span>Währung</span>
          <span className="flex justify-between"><span className="text-loss/70">Schwäche</span><span>Null</span><span className="text-win/70">Stärke</span></span>
          <span className="text-right">Score</span>
        </div>

        <div className="divide-y divide-borderLight">
          {rows.map((row, i) => {
            const positive = row.score >= 0;
            const chip = positive ? 'bg-winBg text-win border-win/20' : 'bg-lossBg text-loss border-loss/20';
            const scoreColor = positive ? 'text-win' : 'text-loss';
            const pct = Math.max(Math.min((Math.abs(row.score) / MAX_ABS) * 100, 100), 5);
            return (
              <button
                key={row.code}
                onClick={() => setSelected({ ccy: row, rank: i + 1 })}
                className="w-full grid grid-cols-[36px_180px_1fr_96px] items-center gap-4 px-5 py-3.5 hover:bg-bgBase transition-colors text-left"
              >
                <span className="font-mono text-xs text-neutral">{String(i + 1).padStart(2, '0')}</span>
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`w-11 h-8 rounded-md flex items-center justify-center font-bold text-sm border ${chip}`}>
                    {row.code}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-textMain truncate">{row.name}</div>
                    <div className="text-[11px] font-semibold text-neutral">{tierLabel(row.score)}</div>
                  </div>
                </div>
                <div className="flex items-center h-9 relative">
                  <div className="absolute left-1/2 top-0 bottom-0 w-px bg-borderLight"></div>
                  <div className="w-1/2 flex justify-end pr-1">
                    {!positive && <div className="h-3 rounded-l-md bg-loss/80" style={{ width: `${pct}%` }}></div>}
                  </div>
                  <div className="w-1/2 flex justify-start pl-1">
                    {positive && <div className="h-3 rounded-r-md bg-win/80" style={{ width: `${pct}%` }}></div>}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-mono text-lg font-bold ${scoreColor}`}>{positive ? '+' : ''}{row.score.toFixed(1)}</div>
                  <div className={`text-[10.5px] font-semibold ${row.chg >= 0 ? 'text-win' : 'text-loss'}`}>
                    {row.chg >= 0 ? '▲ +' : '▼ '}{Math.abs(row.chg).toFixed(1)} (7T)
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selected && <CurrencyStrengthModal ccy={selected.ccy} rank={selected.rank} onClose={() => setSelected(null)} />}
    </div>
  );
}
