import type { G8Currency } from '../data/g8';
import { tierLabel, UPDATED } from '../data/g8';
import ModalShell from './ModalShell';

interface Props {
  ccy: G8Currency;
  rank: number;
  onClose: () => void;
}

function Factor({ label, value, positive }: { label: string; value: string; positive: boolean }) {
  return (
    <div className="flex justify-between items-center p-3 bg-bgBase rounded-lg border border-borderLight">
      <span className="text-sm font-medium text-textMuted">{label}</span>
      <span className={`font-mono font-bold text-sm ${positive ? 'text-win' : 'text-loss'}`}>{value}</span>
    </div>
  );
}

export default function CurrencyStrengthModal({ ccy, rank, onClose }: Props) {
  const positive = ccy.score >= 0;

  return (
    <ModalShell
      title={`${ccy.code} · ${ccy.name}`}
      badge={
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold ${positive ? 'bg-winBg text-win' : 'bg-lossBg text-loss'}`}>
          {tierLabel(ccy.score)} · Rang {rank}/8
        </span>
      }
      onClose={onClose}
      footer={<><i className="ph ph-clock"></i> {UPDATED}</>}
    >
      <div className="flex justify-between items-center p-4 bg-bgBase rounded-xl border border-borderLight">
        <span className="text-sm font-semibold text-textMuted uppercase tracking-wider">Stärke-Score</span>
        <span className={`font-mono text-3xl font-black ${positive ? 'text-win' : 'text-loss'}`}>
          {positive ? '+' : ''}{ccy.score.toFixed(1)}
        </span>
      </div>

      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-neutral mb-2">Score-Komponenten</div>
        <div className="grid grid-cols-2 gap-2">
          <Factor label="Real-Zins" value={`${ccy.realRate.toFixed(1)}%`} positive={ccy.realRate >= 0} />
          <Factor label="Zins-Drehung (7T)" value={`${ccy.chg >= 0 ? '+' : ''}${ccy.chg.toFixed(1)}`} positive={ccy.chg >= 0} />
          <Factor label="Leitzins" value={`${ccy.rate.toFixed(2)}%`} positive={true} />
          <Factor label="CPI YoY" value={`${ccy.cpi.toFixed(1)}%`} positive={ccy.cpi <= 2.5} />
        </div>
      </div>

      <p className="text-xs text-textMuted leading-relaxed">{ccy.gdpRole}</p>
    </ModalShell>
  );
}
