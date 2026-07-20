"use client";

import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import type { CockpitCard } from "@/lib/cockpit/board";

/** Ranking-Detail je Währung (Champion) für das Popup. */
export interface CcyRanking {
  quintile: number;
  score: number;
  top: { feature: string; value: number }[];
}
export interface CockpitEvent {
  title: string;
  when: string; // ISO
}

const VERDICT = {
  rueckenwind: { tone: "up" as const, label: "Rückenwind", icon: "ph-arrow-up-right" },
  gegenwind: { tone: "down" as const, label: "Gegenwind", icon: "ph-arrow-down-right" },
  neutral: { tone: "neutral" as const, label: "Neutral", icon: "ph-minus" },
};

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("de-CH", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function signed(n: number, digits = 2): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}`;
}

function CcyBlock({
  code,
  role,
  detail,
}: {
  code: string;
  role: string;
  detail: CcyRanking | undefined;
}) {
  const q = detail?.quintile;
  const tone = q === 5 ? "up" : q === 1 ? "down" : "neutral";
  return (
    <div className="rounded-md border border-border/60 p-3">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-[13px]">
          {code} <span className="text-muted font-normal text-[11px]">{role}</span>
        </span>
        <Badge tone={tone}>Q{q ?? "?"}</Badge>
      </div>
      {detail ? (
        <>
          <div className="mt-1 font-mono text-[12px] text-text">Score {signed(detail.score)}</div>
          {detail.top.length > 0 && (
            <div className="mt-1 font-mono text-[11px] text-muted">
              {detail.top.map((f) => `${f.feature} ${signed(f.value)}`).join(" · ")}
            </div>
          )}
        </>
      ) : (
        <div className="mt-1 text-[11px] text-faint">kein Ranking</div>
      )}
    </div>
  );
}

export default function FundamentalModal({
  card,
  rankingByCcy,
  eventsByCcy,
  busy,
  onClose,
  onTake,
  onWatch,
  onDismiss,
}: {
  card: CockpitCard | null;
  rankingByCcy: Record<string, CcyRanking>;
  eventsByCcy: Record<string, CockpitEvent[]>;
  busy: boolean;
  onClose: () => void;
  onTake: (c: CockpitCard) => void;
  onWatch: (c: CockpitCard) => void;
  onDismiss: (c: CockpitCard) => void;
}) {
  if (!card) return null;
  const v = VERDICT[card.confluence.verdict];
  const dirTxt = card.lineDir ? card.lineDir.toUpperCase() : "—";
  const events = [
    ...(eventsByCcy[card.base] ?? []),
    ...(eventsByCcy[card.quote] ?? []),
  ].sort((a, b) => a.when.localeCompare(b.when));

  const subtitleParts = [
    card.lineDir ? `${dirTxt}-Linie` : null,
    card.lineLevel != null ? String(card.lineLevel) : null,
    card.distance != null ? `${card.distance.toFixed(0)}p entfernt` : null,
    card.hitAt ? `HIT ${fmtWhen(card.hitAt)}` : null,
  ].filter(Boolean);

  const canAct = card.signalId != null;

  return (
    <Modal
      open={!!card}
      onClose={onClose}
      title={card.pair}
      subtitle={subtitleParts.join(" · ")}
      size="md"
      footer={
        canAct ? (
          <>
            <Button variant="ghost" size="sm" icon="ph-x" disabled={busy} onClick={() => onDismiss(card)}>
              Verwerfen
            </Button>
            <Button variant="subtle" size="sm" icon="ph-eye" disabled={busy} onClick={() => onWatch(card)}>
              Beobachten
            </Button>
            <Button variant="primary" size="sm" icon="ph-notebook" disabled={busy} onClick={() => onTake(card)}>
              Genommen → Journal
            </Button>
          </>
        ) : (
          <span className="text-[11px] text-faint">
            Noch kein HIT — erscheint bei Berührung der Linie in «Aktiv».
          </span>
        )
      }
    >
      <div className="space-y-3">
        <div className={`rounded-md border px-3 py-2 flex items-center gap-2 ${
          card.confluence.verdict === "rueckenwind"
            ? "border-up/40 bg-up/10 text-up"
            : card.confluence.verdict === "gegenwind"
              ? "border-down/40 bg-down/10 text-down"
              : "border-border2 bg-surface2 text-muted"
        }`}>
          <i className={`ph-bold ${v.icon}`} />
          <span className="font-semibold text-[13px]">
            {v.label} für {dirTxt}
          </span>
          {card.confluence.reason && (
            <span className="ml-auto font-mono text-[11px] opacity-90">{card.confluence.reason}</span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <CcyBlock code={card.base} role="Basis" detail={rankingByCcy[card.base]} />
          <CcyBlock code={card.quote} role="Quote" detail={rankingByCcy[card.quote]} />
        </div>

        <div className="rounded-md border border-border/60 p-3 text-[12px] font-mono space-y-1">
          <div className="flex justify-between">
            <span className="text-muted">GVA-Linie</span>
            <span>
              {dirTxt}
              {card.lineLevel != null ? ` · ${card.lineLevel}` : ""}
            </span>
          </div>
          {card.distance != null && (
            <div className="flex justify-between">
              <span className="text-muted">Distanz</span>
              <span>{card.distance.toFixed(0)} Pips</span>
            </div>
          )}
          {card.hitAt && (
            <div className="flex justify-between">
              <span className="text-muted">HIT</span>
              <span>{fmtWhen(card.hitAt)}</span>
            </div>
          )}
        </div>

        {events.length > 0 && (
          <div className="rounded-md border border-warn/30 bg-warn/5 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wide text-warn mb-1">
              High-Impact diese Woche
            </div>
            <ul className="text-[11px] text-muted space-y-0.5">
              {events.map((e, i) => (
                <li key={i}>
                  {fmtWhen(e.when)} · {e.title}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
