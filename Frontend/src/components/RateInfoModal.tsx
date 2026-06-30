import type { G8Currency } from '../data/g8';
import { UPDATED } from '../data/g8';
import ModalShell from './ModalShell';

interface Props {
  ccy: G8Currency;
  onClose: () => void;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 bg-bgBase rounded-lg border border-borderLight">
      <div className="text-[10px] uppercase tracking-wider text-neutral font-bold mb-1">{label}</div>
      <div className="font-mono font-bold text-sm text-textMain">{value}</div>
    </div>
  );
}

export default function RateInfoModal({ ccy, onClose }: Props) {
  return (
    <ModalShell
      title={`${ccy.code} · Leitzins`}
      badge={
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-accent/10 text-accent">
          {ccy.name} · {ccy.rate.toFixed(2)}%
        </span>
      }
      onClose={onClose}
      footer={<><i className="ph ph-clock"></i> {UPDATED}</>}
    >
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Leitzins" value={`${ccy.rate.toFixed(2)}%`} />
        <Stat label="Real-Zins" value={`${ccy.realRate.toFixed(1)}%`} />
        <Stat label="CPI YoY" value={`${ccy.cpi.toFixed(1)}%`} />
      </div>

      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-neutral mb-1">Was der Leitzins bedeutet</div>
        <p className="text-xs text-textMuted leading-relaxed">
          Der Leitzins ist der Zinssatz der Zentralbank. Höhere Zinsen ziehen Kapital an und stützen die Währung
          (höherer Real-Zins = stärkere Währung), dämpfen aber Wachstum und Inflation.
        </p>
      </div>

      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-neutral mb-1">Rolle des BIP</div>
        <p className="text-xs text-textMuted leading-relaxed">{ccy.gdpRole}</p>
      </div>

      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-neutral mb-1">Import / Export &amp; Handelsbilanz</div>
        <p className="text-xs text-textMuted leading-relaxed">{ccy.tradeRole}</p>
      </div>
    </ModalShell>
  );
}
