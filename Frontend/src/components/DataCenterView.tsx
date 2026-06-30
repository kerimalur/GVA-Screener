import { useState } from 'react';
import { UPDATED } from '../data/g8';
import { useG8 } from '../data/useMacro';
import CotChart from './CotChart';
import RateInfoModal from './RateInfoModal';

const ACCENT = '#2563EB';

export default function DataCenterView() {
  const [selected, setSelected] = useState<string>('USD');
  const [rateInfo, setRateInfo] = useState(false);

  const currencies = useG8();
  const fd = currencies.find((c) => c.code === selected) ?? currencies[0];
  const positive = fd.score >= 0;
  const latest = fd.cot[fd.cot.length - 1];
  const first = fd.cot[0];
  const delta = latest - first;
  const rank = currencies.slice().sort((a, b) => b.score - a.score).findIndex((c) => c.code === fd.code) + 1;

  return (
    <div className="tab-view block max-w-5xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-textMain">COT-Datenzentrum</h3>
          <p className="text-sm text-textMuted mt-1 max-w-md">
            Commitments of Traders — Netto-Positionierung der <strong className="text-textMain font-semibold">Commercials</strong> über 52 Wochen.
          </p>
        </div>
        <div className="inline-flex flex-wrap gap-1 bg-bgSurface p-1.5 rounded-xl border border-borderLight shadow-sm">
          {currencies.map((c) => (
            <button
              key={c.code}
              onClick={() => setSelected(c.code)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-mono font-bold transition-all ${
                selected === c.code ? 'bg-textMain text-white shadow-sm' : 'text-textMuted hover:text-textMain'
              }`}
            >
              {c.code}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[284px_1fr] gap-5 items-stretch">
        {/* Primär-Metrik */}
        <div className="bg-textMain rounded-2xl border border-slate-700 shadow-md p-6 text-white relative overflow-hidden flex flex-col">
          <i className="ph-fill ph-bank text-7xl absolute -bottom-3 -right-3 opacity-[0.07]"></i>
          <div className="relative z-10">
            <div className="font-mono text-4xl font-black tracking-wide">{fd.code}</div>
            <div className="text-sm text-slate-400 font-medium mt-2">{fd.name}</div>
          </div>
          <div className="h-px bg-slate-700 my-5 relative z-10"></div>
          <div className="flex flex-col gap-4 relative z-10">
            <button onClick={() => setRateInfo(true)} className="flex justify-between items-center group">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1.5">
                Leitzins <i className="ph ph-info text-slate-500 group-hover:text-white transition-colors"></i>
              </span>
              <span className="font-mono text-lg font-bold group-hover:text-accent transition-colors">{fd.rate.toFixed(2)}%</span>
            </button>
            <div className="flex justify-between items-center">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Stärke-Score</span>
              <span className={`font-mono text-lg font-bold ${positive ? 'text-win' : 'text-loss'}`}>
                {positive ? '+' : ''}{fd.score.toFixed(1)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Rangliste</span>
              <span className="text-sm font-semibold">Rang {rank} / 8</span>
            </div>
          </div>
        </div>

        {/* COT-Chart */}
        <div className="bg-bgSurface rounded-2xl border border-borderLight shadow-sm p-6 flex flex-col">
          <div className="flex justify-between items-start mb-2 flex-wrap gap-2">
            <div>
              <div className="text-sm font-semibold text-textMain">Commercials · Netto-Position</div>
              <div className="text-[11px] text-neutral font-medium mt-0.5">in Tausend Kontrakten · letzte 52 Wochen</div>
            </div>
            {latest >= 0 ? (
              <span className="inline-flex items-center gap-1.5 bg-winBg text-win px-2.5 py-1 rounded-lg text-[11px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-win"></span>Netto Long
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 bg-lossBg text-loss px-2.5 py-1 rounded-lg text-[11px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-loss"></span>Netto Short
              </span>
            )}
          </div>

          <div className="flex-1 min-h-[200px] flex items-center">
            <CotChart data={fd.cot} color={ACCENT} />
          </div>

          <div className="grid grid-cols-3 gap-3.5 mt-4 pt-4 border-t border-borderLight">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-neutral font-bold mb-1.5">Aktuell</div>
              <div className="font-mono text-lg font-bold text-textMain">{latest >= 0 ? '+' : '−'}{Math.abs(latest)}K</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-neutral font-bold mb-1.5">52-Wochen-Δ</div>
              <div className={`font-mono text-lg font-bold ${delta >= 0 ? 'text-win' : 'text-loss'}`}>
                {delta >= 0 ? '▲ ' : '▼ '}{Math.abs(delta)}K
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-neutral font-bold mb-1.5">Trend</div>
              <div className="text-[15px] font-semibold text-textMain">{delta >= 0 ? 'Steigend' : 'Fallend'}</div>
            </div>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-textMuted">{UPDATED} · Quelle (geplant): CFTC Commitments of Traders.</p>

      {rateInfo && <RateInfoModal ccy={fd} onClose={() => setRateInfo(false)} />}
    </div>
  );
}
