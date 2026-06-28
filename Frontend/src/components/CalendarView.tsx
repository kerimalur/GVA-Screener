// PLATZHALTER-Daten. Später aus Backend (Macro-Kalender / News-Feed) ersetzbar.
interface CalendarEvent {
  time: string;
  ccy: string;
  ccyColor: 'loss' | 'win' | 'accent';
  event: string;
  forecast: string;
}

const CALENDAR: CalendarEvent[] = [
  { time: 'Heute, 14:30', ccy: 'USD', ccyColor: 'loss', event: 'Core CPI (MoM)', forecast: '0.3%' },
  { time: 'Morgen, 09:30', ccy: 'CHF', ccyColor: 'win', event: 'SNB Zinsentscheid', forecast: '1.50%' },
];

// Countdown bis zum nächsten High-Impact-Event (Platzhalter: festes Zieldatum).
const NFP_TARGET = new Date('2026-06-30T12:30:00Z');

function countdown(): { days: number; hours: number } {
  const diff = Math.max(0, NFP_TARGET.getTime() - Date.now());
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  return { days, hours };
}

const badgeColor: Record<CalendarEvent['ccyColor'], string> = {
  loss: 'bg-lossBg text-loss',
  win: 'bg-winBg text-win',
  accent: 'bg-accent/10 text-accent',
};

export default function CalendarView() {
  const { days, hours } = countdown();

  return (
    <div className="tab-view block max-w-[1400px] mx-auto space-y-6">
      {/* High-Impact Countdown Banner */}
      <div className="bg-gradient-to-r from-accent to-indigo-600 rounded-2xl shadow-glow p-8 text-white flex justify-between items-center relative overflow-hidden">
        <i className="ph-fill ph-megaphone text-8xl absolute -right-6 -bottom-6 opacity-20"></i>
        <div>
          <span className="bg-white/20 text-white px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider mb-3 inline-block">
            High Impact Event
          </span>
          <h2 className="text-3xl font-black mb-1">Non-Farm Payrolls (NFP)</h2>
          <p className="text-white/80 font-medium">USD • Bureau of Labor Statistics</p>
        </div>
        <div className="flex gap-4 text-center z-10">
          <div className="bg-black/20 rounded-xl p-4 backdrop-blur-sm min-w-[80px]">
            <span className="block text-3xl font-black">{String(days).padStart(2, '0')}</span>
            <span className="text-xs font-medium text-white/70 uppercase">Tage</span>
          </div>
          <div className="bg-black/20 rounded-xl p-4 backdrop-blur-sm min-w-[80px]">
            <span className="block text-3xl font-black">{String(hours).padStart(2, '0')}</span>
            <span className="text-xs font-medium text-white/70 uppercase">Std</span>
          </div>
        </div>
      </div>

      <div className="bg-bgSurface rounded-2xl border border-borderLight shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-bgBase border-b border-borderLight text-xs text-textMuted uppercase tracking-wider">
              <th className="p-4 font-bold">Zeitpunkt</th>
              <th className="p-4 font-bold">Währung</th>
              <th className="p-4 font-bold">Event</th>
              <th className="p-4 font-bold text-right">Prognose</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {CALENDAR.map((ev, i) => (
              <tr key={i} className="border-b border-borderLight hover:bg-bgBase/50 transition-colors">
                <td className="p-4 font-medium">{ev.time}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded font-bold text-xs ${badgeColor[ev.ccyColor]}`}>{ev.ccy}</span>
                </td>
                <td className="p-4 font-bold text-textMain">{ev.event}</td>
                <td className="p-4 text-right font-mono text-textMuted">{ev.forecast}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
