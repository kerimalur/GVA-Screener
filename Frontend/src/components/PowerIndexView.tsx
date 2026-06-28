import Panel, { LiveTag } from './Panel';

// PLATZHALTER-Daten. Später aus Backend (Fundamental-Bias / Currency-Strength) ersetzbar:
// einfach POWER_INDEX mit echten Werten füttern, Rest bleibt.
const POWER_INDEX: { ccy: string; score: number; change: number }[] = [
  { ccy: 'CAD', score: 8.5, change: 0.42 },
  { ccy: 'NZD', score: 6.2, change: 0.18 },
  { ccy: 'USD', score: 1.5, change: -0.21 },
  { ccy: 'EUR', score: -0.8, change: 0.05 },
  { ccy: 'CHF', score: -6.0, change: -0.33 },
  { ccy: 'JPY', score: -9.2, change: -0.51 },
];

const MAX_ABS = 10; // Skala -10 … +10

export default function PowerIndexView() {
  const rows = [...POWER_INDEX].sort((a, b) => b.score - a.score);
  const stamp = new Date().toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="tab-view block max-w-3xl mx-auto space-y-4">
      <Panel
        title="G8 Relative Strength"
        subtitle={`Stand ${stamp}`}
        right={<LiveTag />}
        bodyClass="p-0"
      >
        {/* Spaltenkopf */}
        <div className="flex items-center px-5 py-2.5 border-b border-borderLight text-[10px] font-bold uppercase tracking-wider text-neutral">
          <span className="w-8">#</span>
          <span className="w-14">Asset</span>
          <span className="flex-1 px-4 text-center">Strength</span>
          <span className="w-20 text-right">1D Δ</span>
          <span className="w-16 text-right">Score</span>
        </div>

        <div className="divide-y divide-borderLight">
          {rows.map((row, i) => {
            const positive = row.score >= 0;
            const widthPct = Math.min(100, (Math.abs(row.score) / MAX_ABS) * 100);
            const chgUp = row.change >= 0;
            return (
              <div key={row.ccy} className="flex items-center px-5 py-2.5 hover:bg-bgBase transition-colors">
                <span className="w-8 font-mono text-xs text-neutral">{i + 1}</span>
                <span className="w-14">
                  <span className="inline-flex items-center justify-center w-11 h-7 rounded-md bg-bgBase border border-borderLight font-mono font-bold text-sm text-textMain">
                    {row.ccy}
                  </span>
                </span>

                {/* diverging Bar */}
                <div className="flex-1 px-4 flex items-center">
                  <div className="w-full flex items-center">
                    <div className="w-1/2 flex justify-end">
                      {!positive && (
                        <div className="h-2 rounded-l-sm bg-loss/80" style={{ width: `${widthPct}%` }}></div>
                      )}
                    </div>
                    <div className="w-px h-4 bg-borderLight"></div>
                    <div className="w-1/2 flex justify-start">
                      {positive && (
                        <div className="h-2 rounded-r-sm bg-win/80" style={{ width: `${widthPct}%` }}></div>
                      )}
                    </div>
                  </div>
                </div>

                <span className={`w-20 text-right font-mono text-xs ${chgUp ? 'text-win' : 'text-loss'}`}>
                  {chgUp ? '▲' : '▼'} {Math.abs(row.change).toFixed(2)}
                </span>
                <span className={`w-16 text-right font-mono font-bold text-sm ${positive ? 'text-win' : 'text-loss'}`}>
                  {positive ? '+' : ''}
                  {row.score.toFixed(1)}
                </span>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
