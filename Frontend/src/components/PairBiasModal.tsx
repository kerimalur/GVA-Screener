import type { G8Currency } from '../data/g8';
import { tierLabel, UPDATED } from '../data/g8';
import ModalShell from './ModalShell';

interface Props {
  strong: G8Currency; // Basiswährung (Long)
  weak: G8Currency;   // Quotewährung (Short)
  onClose: () => void;
}

function Side({ ccy, kind }: { ccy: G8Currency; kind: 'strong' | 'weak' }) {
  const isStrong = kind === 'strong';
  const box = isStrong ? 'bg-winBg/40 border-win/30' : 'bg-lossBg/40 border-loss/30';
  const label = isStrong ? 'text-win' : 'text-loss';
  const sign = ccy.score >= 0 ? '+' : '';
  return (
    <div className={`p-4 rounded-xl border ${box}`}>
      <div className="flex justify-between items-center mb-2">
        <span className={`text-xs font-bold uppercase tracking-wider ${label}`}>
          {isStrong ? 'Stark · Long' : 'Schwach · Short'}
        </span>
        <span className="font-bold text-sm">{ccy.code} · {ccy.name}</span>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-[11px] text-textMuted">{tierLabel(ccy.score)}</span>
        <span className={`font-mono font-bold ${label}`}>{sign}{ccy.score.toFixed(1)}</span>
      </div>
      <p className="text-[11px] text-textMuted leading-relaxed mt-2">{isStrong ? ccy.tradeRole : ccy.gdpRole}</p>
    </div>
  );
}

export default function PairBiasModal({ strong, weak, onClose }: Props) {
  const edge = strong.score - weak.score;
  return (
    <ModalShell
      title={`${strong.code}${weak.code}`}
      badge={
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-winBg text-win">
          Bullish · Long {strong.code} / Short {weak.code}
        </span>
      }
      onClose={onClose}
      footer={<><i className="ph ph-clock"></i> {UPDATED}</>}
    >
      <div className="flex justify-between items-center p-4 bg-bgBase rounded-xl border border-borderLight">
        <span className="text-sm font-semibold text-textMuted uppercase tracking-wider">Edge (Score-Differenz)</span>
        <span className="font-mono text-2xl font-black text-win">+{edge.toFixed(1)}</span>
      </div>
      <Side ccy={strong} kind="strong" />
      <Side ccy={weak} kind="weak" />
      <p className="text-[11px] text-textMuted leading-relaxed">
        Das inverse Paar ({weak.code}{strong.code}) entspricht dem Short-Setup mit umgekehrtem Edge.
      </p>
    </ModalShell>
  );
}
