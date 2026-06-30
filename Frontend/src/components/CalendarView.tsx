import Panel from './Panel';
import { useCalendar } from '../data/useMacro';

// Countdown bis zum nächsten High-Impact-Event (Platzhalter: festes Zieldatum).
const NFP_TARGET = new Date('2026-06-30T12:30:00Z');

function countdown(): { days: number; hours: number; mins: number } {
  const diff = Math.max(0, NFP_TARGET.getTime() - Date.now());
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff / 3600000) % 24);
  const mins = Math.floor((diff / 60000) % 60);
  return { days, hours, mins };
}

function ImpactDots({ level }: { level: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          className={`w-1.5 h-1.5 rounded-full ${
            n <= level ? (level === 3 ? 'bg-loss' : level === 2 ? 'bg-hit' : 'bg-neutral') : 'bg-borderLight'
          }`}
        ></span>
      ))}
    </span>
  );
}

export default function CalendarView() {
  const { days, hours, mins } = countdown();
  const pad = (n: number) => String(n).padStart(2, '0');
  const events = useCalendar();

  return (
    <div className="tab-view block max-w-[1400px] mx-auto space-y-4">
      {/* Next High-Impact — kompakter Terminal-Strip statt Gradient-Banner */}
      <div className="bg-bgSurface rounded-xl border border-borderLight border-l-4 border-l-loss shadow-sm flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-loss bg-lossBg px-2 py-1 rounded">
            High Impact
          </span>
          <div>
            <div className="font-bold text-textMain leading-tight">Non-Farm Payrolls (NFP)</div>
            <div className="text-xs text-textMuted font-medium">USD · Bureau of Labor Statistics</div>
          </div>
        </div>
        <div className="flex items-center gap-1 font-mono text-textMain">
          <span className="text-xl font-bold tabular-nums">{pad(days)}</span>
          <span className="text-textMuted text-sm">d</span>
          <span className="text-xl font-bold tabular-nums ml-2">{pad(hours)}</span>
          <span className="text-textMuted text-sm">h</span>
          <span className="text-xl font-bold tabular-nums ml-2">{pad(mins)}</span>
          <span className="text-textMuted text-sm">m</span>
        </div>
      </div>

      <Panel title="Economic Calendar" subtitle="kommende Events" bodyClass="p-0">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-borderLight text-[10px] text-neutral uppercase tracking-wider">
              <th className="px-5 py-2.5 font-bold">Zeit</th>
              <th className="px-3 py-2.5 font-bold">Impact</th>
              <th className="px-3 py-2.5 font-bold">CCY</th>
              <th className="px-3 py-2.5 font-bold">Event</th>
              <th className="px-3 py-2.5 font-bold text-right">Actual</th>
              <th className="px-3 py-2.5 font-bold text-right">Forecast</th>
              <th className="px-5 py-2.5 font-bold text-right">Previous</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borderLight text-sm">
            {events.map((ev, i) => (
              <tr key={i} className="hover:bg-bgBase transition-colors">
                <td className="px-5 py-3 font-mono text-xs text-textMuted whitespace-nowrap">{ev.time}</td>
                <td className="px-3 py-3">
                  <ImpactDots level={ev.impact} />
                </td>
                <td className="px-3 py-3 font-mono font-bold text-xs text-textMain">{ev.ccy}</td>
                <td className="px-3 py-3 font-medium text-textMain">{ev.event}</td>
                <td className="px-3 py-3 text-right font-mono text-textMuted">{ev.actual}</td>
                <td className="px-3 py-3 text-right font-mono text-textMain">{ev.forecast}</td>
                <td className="px-5 py-3 text-right font-mono text-textMuted">{ev.previous}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
