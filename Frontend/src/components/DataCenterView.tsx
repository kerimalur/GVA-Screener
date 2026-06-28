import { useState } from 'react';
import Panel, { LiveTag } from './Panel';

// PLATZHALTER-Daten. Später aus Backend/fundamentals.py (FRED Zinsen + CPI) ersetzbar:
// - INDEX[ccy]   ← aggregierter Fundamental-Score + Sub-Metriken je Währung
// - CB_RATES     ← Zentralbank-Leitzinsen (live)
const CURRENCIES = ['USD', 'EUR', 'GBP', 'CHF', 'JPY'] as const;
type Ccy = (typeof CURRENCIES)[number];

interface IndexEntry {
  value: number;
  label: string;
  realRate: number; // Zins − CPI
  cpi: number; // CPI YoY
  tenY: number; // 10Y Rendite
}

const INDEX: Record<Ccy, IndexEntry> = {
  USD: { value: 4.82, label: 'Signifikant Bullish', realRate: 2.4, cpi: 3.1, tenY: 4.28 },
  EUR: { value: -0.8, label: 'Neutral / Schwach', realRate: 1.8, cpi: 2.4, tenY: 2.51 },
  GBP: { value: 2.1, label: 'Leicht Bullish', realRate: 1.1, cpi: 3.4, tenY: 4.12 },
  CHF: { value: -6.0, label: 'Bearish', realRate: 0.4, cpi: 1.1, tenY: 0.68 },
  JPY: { value: -9.2, label: 'Signifikant Bearish', realRate: -2.9, cpi: 3.0, tenY: 0.98 },
};

// Zentralbank-Leitzinsen (Platzhalter). Quelle später: fundamentals / Policy-Rates.
const CB_RATES: { bank: string; ccy: string; rate: number; change: number; next: string }[] = [
  { bank: 'FED', ccy: 'USD', rate: 5.5, change: 0, next: '17. Jul' },
  { bank: 'ECB', ccy: 'EUR', rate: 4.25, change: -0.25, next: '24. Jul' },
  { bank: 'BOE', ccy: 'GBP', rate: 5.0, change: -0.25, next: '01. Aug' },
  { bank: 'SNB', ccy: 'CHF', rate: 1.5, change: -0.25, next: '26. Sep' },
  { bank: 'BOJ', ccy: 'JPY', rate: 0.1, change: 0, next: '31. Jul' },
];

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">{label}</div>
      <div className={`font-mono font-bold text-base ${color ?? 'text-white'}`}>{value}</div>
    </div>
  );
}

export default function DataCenterView() {
  const [selected, setSelected] = useState<Ccy>('USD');
  const idx = INDEX[selected];
  const positive = idx.value >= 0;

  return (
    <div className="tab-view block max-w-[1400px] mx-auto space-y-4">
      {/* Währungsauswahl — segmentiert, mono */}
      <div className="flex justify-center">
        <div className="inline-flex bg-bgSurface p-1 rounded-lg border border-borderLight shadow-sm">
          {CURRENCIES.map((ccy) => (
            <button
              key={ccy}
              onClick={() => setSelected(ccy)}
              className={`px-5 py-1.5 rounded-md text-sm font-mono font-bold transition-all ${
                selected === ccy ? 'bg-textMain text-white shadow-sm' : 'text-textMuted hover:text-textMain'
              }`}
            >
              {ccy}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Primär-Metrik — dunkles Terminal-Panel */}
        <div className="md:col-span-1 bg-textMain rounded-xl border border-slate-700 shadow-md p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">{selected} Index</h3>
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <span className="w-1.5 h-1.5 rounded-full bg-win animate-pulse"></span>Live
            </span>
          </div>
          <div className={`font-mono text-5xl font-black mb-1 ${positive ? 'text-win' : 'text-loss'}`}>
            {positive ? '+' : ''}
            {idx.value.toFixed(2)}
          </div>
          <p className="text-sm font-semibold text-slate-300 mb-5">{idx.label}</p>
          <div className="grid grid-cols-3 gap-3 pt-4 border-t border-slate-700">
            <Stat label="Real Rate" value={`${idx.realRate.toFixed(1)}%`} color={idx.realRate >= 0 ? 'text-win' : 'text-loss'} />
            <Stat label="CPI YoY" value={`${idx.cpi.toFixed(1)}%`} />
            <Stat label="10Y" value={`${idx.tenY.toFixed(2)}%`} />
          </div>
        </div>

        {/* Zentralbank-Leitzinsen — Tabelle */}
        <Panel title="Zentralbank Leitzinsen" right={<LiveTag />} className="md:col-span-2" bodyClass="p-0">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-borderLight text-[10px] text-neutral uppercase tracking-wider">
                <th className="px-5 py-2.5 font-bold">Bank</th>
                <th className="px-3 py-2.5 font-bold">CCY</th>
                <th className="px-3 py-2.5 font-bold text-right">Leitzins</th>
                <th className="px-3 py-2.5 font-bold text-right">Δ letzte</th>
                <th className="px-5 py-2.5 font-bold text-right">Nächste Sitzung</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderLight text-sm">
              {CB_RATES.map((r) => {
                const isSel = r.ccy === selected;
                return (
                  <tr key={r.bank} className={`transition-colors ${isSel ? 'bg-accent/5' : 'hover:bg-bgBase'}`}>
                    <td className={`px-5 py-3 font-bold ${isSel ? 'text-accent' : 'text-textMain'}`}>{r.bank}</td>
                    <td className="px-3 py-3 font-mono text-xs text-textMuted">{r.ccy}</td>
                    <td className="px-3 py-3 text-right font-mono font-bold text-textMain">{r.rate.toFixed(2)}%</td>
                    <td
                      className={`px-3 py-3 text-right font-mono text-xs ${
                        r.change === 0 ? 'text-textMuted' : r.change > 0 ? 'text-win' : 'text-loss'
                      }`}
                    >
                      {r.change === 0 ? '—' : `${r.change > 0 ? '+' : ''}${r.change.toFixed(2)}`}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-xs text-textMuted">{r.next}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}
