// PLATZHALTER-Daten. Später aus Backend (z.B. Fundamental-Bias / Currency-Strength) ersetzbar:
// einfach POWER_INDEX mit echten {ccy, score}-Werten füttern, Rest bleibt.
const POWER_INDEX: { ccy: string; score: number }[] = [
  { ccy: 'CAD', score: 8.5 },
  { ccy: 'NZD', score: 6.2 },
  { ccy: 'USD', score: 1.5 },
  { ccy: 'EUR', score: -0.8 },
  { ccy: 'CHF', score: -6.0 },
  { ccy: 'JPY', score: -9.2 },
];

const MAX_ABS = 10; // Skala -10 … +10

export default function PowerIndexView() {
  return (
    <div className="tab-view block max-w-4xl mx-auto space-y-6">
      <div className="mb-2 text-center">
        <p className="text-textMuted text-sm font-medium">
          Das institutionelle Barometer. Entdecke absolute Stärke und absolute Schwäche in Echtzeit.
        </p>
      </div>

      <div className="bg-bgSurface rounded-3xl border border-borderLight shadow-lg p-6 sm:p-10 relative overflow-hidden">
        {/* Achsen-Label */}
        <div className="flex text-[11px] font-bold text-textMuted uppercase tracking-widest mb-8 border-b border-borderLight pb-4 relative z-10">
          <div className="w-16 sm:w-20 text-center">Asset</div>
          <div className="flex-1 flex justify-between relative px-2 sm:px-6">
            <span className="text-loss">Verkäufer (-)</span>
            <span className="absolute left-1/2 -translate-x-1/2 bg-bgBase px-3 py-0.5 rounded-full border border-borderLight">0.0</span>
            <span className="text-win">Käufer (+)</span>
          </div>
          <div className="w-16 sm:w-20 text-center">Score</div>
        </div>

        <div className="space-y-6 relative z-10">
          {/* zentrale Nulllinie */}
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-borderLight -translate-x-1/2"></div>

          {POWER_INDEX.map((row) => {
            const positive = row.score >= 0;
            const widthPct = Math.min(100, (Math.abs(row.score) / MAX_ABS) * 100);
            return (
              <div key={row.ccy} className="flex items-center group cursor-default">
                <div className="w-16 sm:w-20 flex justify-center z-10">
                  <span
                    className={`w-12 h-12 flex items-center justify-center rounded-2xl font-black text-lg border shadow-sm group-hover:scale-110 transition-transform duration-300 ${
                      positive ? 'bg-winBg text-win border-win/20' : 'bg-lossBg text-loss border-loss/20'
                    }`}
                  >
                    {row.ccy}
                  </span>
                </div>
                <div className="flex-1 flex items-center h-12 px-2 sm:px-6 relative">
                  <div className="w-1/2 flex justify-end pr-2">
                    {!positive && (
                      <div
                        className="h-5 rounded-l-xl rounded-r-sm bg-gradient-to-l from-loss to-rose-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]"
                        style={{ width: `${widthPct}%` }}
                      ></div>
                    )}
                  </div>
                  <div className="w-1/2 flex justify-start pl-2">
                    {positive && (
                      <div
                        className="h-5 rounded-r-xl rounded-l-sm bg-gradient-to-r from-win to-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                        style={{ width: `${widthPct}%` }}
                      ></div>
                    )}
                  </div>
                </div>
                <div
                  className={`w-16 sm:w-20 text-center font-mono font-black text-lg z-10 ${positive ? 'text-win' : 'text-loss'}`}
                >
                  {positive ? '+' : ''}
                  {row.score.toFixed(1)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
