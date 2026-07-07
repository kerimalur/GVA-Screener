import SpectrumBar from "@/components/charts/SpectrumBar";
import type { StanceResult } from "@/lib/calc/cbStance";

/** Hawkish/Dovish-Spektrum aller 8 Zentralbanken. */
export default function CbSpectrumPanel({ stances }: { stances: StanceResult[] }) {
  const sorted = [...stances].sort((a, b) => b.score - a.score);
  return (
    <div className="space-y-2.5">
      <div className="flex justify-between text-[10px] uppercase tracking-widest text-faint px-14">
        <span className="text-down">← sehr dovish</span>
        <span>neutral</span>
        <span className="text-up">sehr hawkish →</span>
      </div>
      {sorted.map((s) => (
        <SpectrumBar
          key={s.bank}
          score={s.score}
          label={s.bank}
          sublabel={s.ccy}
          title={`${s.rationale} · manuell ${s.manualScore.toFixed(1)} / Trajektorie ${s.trajectoryScore.toFixed(1)}`}
        />
      ))}
      <p className="text-[10px] text-faint pt-1">
        60 % manueller Score (Supabase: cb_stance, editierbar) + 40 % berechnete
        Leitzins-Trajektorie (Δ 6 Monate). Tooltip zeigt Begründung.
      </p>
    </div>
  );
}
