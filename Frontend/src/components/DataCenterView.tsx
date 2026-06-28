import { useState } from 'react';

// PLATZHALTER-Daten. Später aus Backend/fundamentals.py (FRED Zinsen + CPI) ersetzbar:
// - INDEX[ccy]   ← z.B. aggregierter Fundamental-Score je Währung
// - CB_RATES     ← Zentralbank-Leitzinsen (live)
const CURRENCIES = ['USD', 'EUR', 'GBP', 'CHF', 'JPY'] as const;
type Ccy = (typeof CURRENCIES)[number];

const INDEX: Record<Ccy, { value: number; label: string }> = {
  USD: { value: 4.82, label: 'Signifikant Bullish' },
  EUR: { value: -0.8, label: 'Neutral / Schwach' },
  GBP: { value: 2.1, label: 'Leicht Bullish' },
  CHF: { value: -6.0, label: 'Bearish' },
  JPY: { value: -9.2, label: 'Signifikant Bearish' },
};

// Zentralbank-Leitzinsen (Platzhalter). Quelle später: fundamentals.long_term_rate / Policy-Rates.
const CB_RATES: { bank: string; ccy: string; rate: string }[] = [
  { bank: 'FED', ccy: 'USD', rate: '5.50%' },
  { bank: 'ECB', ccy: 'EUR', rate: '4.25%' },
  { bank: 'SNB', ccy: 'CHF', rate: '1.50%' },
  { bank: 'BOJ', ccy: 'JPY', rate: '0.10%' },
];

export default function DataCenterView() {
  const [selected, setSelected] = useState<Ccy>('USD');
  const idx = INDEX[selected];
  const positive = idx.value >= 0;

  return (
    <div className="tab-view block max-w-[1400px] mx-auto space-y-6">
      {/* Währungsauswahl */}
      <div className="flex justify-center mb-2">
        <div className="inline-flex bg-bgSurface p-1.5 rounded-xl border border-borderLight shadow-sm">
          {CURRENCIES.map((ccy) => (
            <button
              key={ccy}
              onClick={() => setSelected(ccy)}
              className={`px-5 py-2 rounded-lg text-sm transition-all ${
                selected === ccy ? 'font-bold bg-bgBase text-accent shadow-sm' : 'font-medium text-textMuted hover:text-textMain'
              }`}
            >
              {ccy}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl shadow-md p-6 text-white relative overflow-hidden">
          <i className="ph-fill ph-cpu text-6xl absolute -bottom-2 -right-2 opacity-10"></i>
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">{selected} Index</h3>
          <div className="text-4xl font-black mb-1">
            {positive ? '+' : ''}
            {idx.value.toFixed(2)}
          </div>
          <p className={`text-sm font-bold ${positive ? 'text-win' : 'text-loss'}`}>{idx.label}</p>
        </div>

        <div className="md:col-span-2 bg-bgSurface rounded-2xl border border-borderLight shadow-sm p-6">
          <h3 className="text-xs font-bold text-textMuted uppercase tracking-widest mb-4">Zentralbank Leitzinsen</h3>
          <div className="flex justify-between items-center h-full pb-4">
            {CB_RATES.map((r, i) => (
              <div key={r.bank} className="flex items-center">
                {i > 0 && <div className="w-px h-8 bg-borderLight mr-4 sm:mr-8"></div>}
                <div className={`text-center ${r.ccy === selected ? 'text-accent' : ''}`}>
                  <div className="text-2xl font-bold">{r.rate}</div>
                  <div className="text-xs text-textMuted font-medium">
                    {r.bank} ({r.ccy})
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
