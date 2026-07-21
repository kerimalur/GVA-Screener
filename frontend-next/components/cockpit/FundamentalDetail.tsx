"use client";

import Badge from "@/components/ui/Badge";
import { eventsForPair, type CcyRanking, type CockpitEvent } from "@/lib/cockpit/detail";
import type { CockpitCard } from "@/lib/cockpit/board";

/**
 * Fundamentale Lage eines Setups: Verdikt, beide Quintile, Linien-Info,
 * High-Impact-Termine.
 *
 * Das waren die Inhalte des `FundamentalModal`. Sie liegen jetzt auf der
 * Outlook-Detailseite — ein Setup hat genau eine Detailansicht, nicht zwei
 * konkurrierende.
 */

const VERDICT = {
  rueckenwind: { label: "Rückenwind", icon: "ph-arrow-up-right" },
  gegenwind: { label: "Gegenwind", icon: "ph-arrow-down-right" },
  neutral: { label: "Neutral", icon: "ph-minus" },
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

/**
 * Linien-Bildungsdatum anzeigen. Der Scanner liefert 'DD.MM.YYYY', die
 * signals-Tabelle ISO — beides wird auf die Schweizer Schreibweise gebracht.
 * Altzeilen ohne Feld zeigen einen Platzhalter statt eines Fehlers.
 */
function fmtLineDate(v: string | null): string {
  if (!v) return "–";
  const iso = /^\d{4}-\d{2}-\d{2}/.exec(v);
  if (!iso) return v; // schon 'DD.MM.YYYY'
  const [y, m, d] = v.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
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

export default function FundamentalDetail({
  card,
  rankingByCcy,
  eventsByCcy,
}: {
  card: CockpitCard;
  rankingByCcy: Record<string, CcyRanking>;
  eventsByCcy: Record<string, CockpitEvent[]>;
}) {
  const v = VERDICT[card.confluence.verdict];
  const dirTxt = card.lineDir ? card.lineDir.toUpperCase() : "—";
  const events = eventsForPair(eventsByCcy, card.base, card.quote);

  return (
    <div className="space-y-3">
      {card.detectedLate && (
        <div className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-[12px] text-warn">
          <span className="font-bold">⏱ Nachträglich erkannt.</span> Dieser Hit kam nicht
          live, sondern wurde aus der 3D-Kerzen-Historie nachgetragen (Backend war offline).
          Der Preis kann inzwischen weit weg sein — vor dem Trade prüfen.
        </div>
      )}

      <div
        className={`rounded-md border px-3 py-2 flex items-center gap-2 ${
          card.confluence.verdict === "rueckenwind"
            ? "border-up/40 bg-up/10 text-up"
            : card.confluence.verdict === "gegenwind"
              ? "border-down/40 bg-down/10 text-down"
              : "border-border2 bg-surface2 text-muted"
        }`}
      >
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
          <span className="text-muted">{card.manual ? "Setup" : "GVA-Linie"}</span>
          <span>
            {dirTxt}
            {card.lineLevel != null ? ` · ${card.lineLevel}` : ""}
          </span>
        </div>
        {/* Manuelle Setups haben keine Linie und damit auch kein Bildungsdatum. */}
        {!card.manual && (
          <div className="flex justify-between">
            <span className="text-muted">Formiert am</span>
            <span>{fmtLineDate(card.lineFormedDate)}</span>
          </div>
        )}
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
  );
}
