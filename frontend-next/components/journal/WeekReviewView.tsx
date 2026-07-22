"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toaster";
import type { Trade } from "@/lib/journal/types";
import { SETUP_DEFINITIONS } from "@/lib/journal/types";
import { loadTrades } from "@/lib/journal/trades";
import { availableWeeks, weekReview } from "@/lib/journal/weekReview";

const MONO = "'JetBrains Mono',monospace";

function setupShorts(t: Trade): string {
  const shorts = Object.values(SETUP_DEFINITIONS)
    .filter((d) => (t as unknown as Record<string, boolean>)[d.key])
    .map((d) => d.short);
  return shorts.length ? shorts.join(" · ") : "—";
}

function dm(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}.`;
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={{ background: "var(--color-surface2)", border: "1px solid var(--color-border)", borderRadius: "12px", padding: "14px 16px" }}>
      <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", color: "var(--color-faint)", marginBottom: "6px" }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: "20px", fontWeight: 700, color: tone || "var(--color-text)" }}>{value}</div>
    </div>
  );
}

export default function WeekReviewView() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekIdx, setWeekIdx] = useState(0);

  useEffect(() => {
    setLoading(true);
    loadTrades()
      .then(setTrades)
      .catch(() => toast.error("Fehler beim Laden"))
      .finally(() => setLoading(false));
  }, []);

  const weeks = useMemo(() => availableWeeks(trades), [trades]);
  const activeWeek = weeks[Math.min(weekIdx, Math.max(0, weeks.length - 1))] ?? null;
  const review = useMemo(() => (activeWeek ? weekReview(trades, activeWeek) : null), [trades, activeWeek]);

  if (loading) {
    return <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "16px", padding: "20px" }}><SkeletonRows rows={6} /></div>;
  }

  if (!review) {
    return (
      <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "16px", padding: "20px" }}>
        <EmptyState icon="ph-calendar-check" title="Noch keine Wochen" description="Sobald du Live-Trades journalst, erscheint hier der Wochenrückblick." />
      </div>
    );
  }

  const year = review.weekEnd.slice(0, 4);
  const rTone = review.totalR >= 0 ? "var(--color-up)" : "var(--color-down)";
  const wrTone = review.winRate == null ? "var(--color-faint)" : review.winRate >= 50 ? "var(--color-up)" : "var(--color-muted)";

  return (
    <div className="anim-fade-in max-w-[900px] mx-auto" style={{ display: "flex", flexDirection: "column", gap: "18px" }}>

      {/* Wochen-Wahl */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <div style={{ fontSize: "16px", fontWeight: 800 }}>Wochenrückblick</div>
          <div style={{ fontSize: "12.5px", color: "var(--color-faint)", fontFamily: MONO, marginTop: "2px" }}>
            {dm(review.weekStart)} – {dm(review.weekEnd)} {year}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            onClick={() => setWeekIdx((i) => Math.min(weeks.length - 1, i + 1))}
            disabled={weekIdx >= weeks.length - 1}
            title="Ältere Woche"
            style={{ width: "36px", height: "36px", borderRadius: "10px", border: "1px solid var(--color-border2)", background: "transparent", color: "var(--color-muted)", cursor: "pointer", fontSize: "16px", opacity: weekIdx >= weeks.length - 1 ? 0.4 : 1 }}
          >‹</button>
          <select
            value={activeWeek ?? ""}
            onChange={(e) => setWeekIdx(weeks.indexOf(e.target.value))}
            style={{ height: "36px", borderRadius: "10px", border: "1px solid var(--color-border2)", background: "var(--color-surface)", color: "var(--color-text)", fontFamily: MONO, fontSize: "12.5px", padding: "0 10px", cursor: "pointer" }}
          >
            {weeks.map((w) => {
              const rv = weekReview(trades, w);
              return <option key={w} value={w}>{dm(rv.weekStart)}–{dm(rv.weekEnd)} · {rv.totalR >= 0 ? "+" : ""}{rv.totalR.toFixed(1)}R</option>;
            })}
          </select>
          <button
            onClick={() => setWeekIdx((i) => Math.max(0, i - 1))}
            disabled={weekIdx <= 0}
            title="Neuere Woche"
            style={{ width: "36px", height: "36px", borderRadius: "10px", border: "1px solid var(--color-border2)", background: "transparent", color: "var(--color-muted)", cursor: "pointer", fontSize: "16px", opacity: weekIdx <= 0 ? 0.4 : 1 }}
          >›</button>
        </div>
      </div>

      {/* Kennzahlen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-[12px]">
        <Tile label="Ergebnis" value={`${review.totalR >= 0 ? "+" : ""}${review.totalR.toFixed(2)} R`} tone={rTone} />
        <Tile label="Winrate" value={review.winRate == null ? "—" : `${review.winRate.toFixed(0)}%`} tone={wrTone} />
        <Tile label="Adherence" value={review.adherenceAvg == null ? "—" : `${review.adherenceAvg.toFixed(0)}%`} />
        <Tile label="Budget genutzt" value={`${review.budgetUsed}`} />
      </div>

      <div style={{ fontSize: "11.5px", color: "var(--color-faint)" }}>
        {review.wins}W / {review.losses}L / {review.breakevens}BE
        {review.adherenceCount < review.trades.length && review.trades.length > 0 && (
          <> · {review.trades.length - review.adherenceCount} ohne Adherence-Bewertung</>
        )}
      </div>

      {/* Trades der Woche */}
      <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "16px", padding: "18px" }}>
        <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.8px", color: "var(--color-faint)", textTransform: "uppercase", marginBottom: "12px" }}>
          Trades der Woche ({review.trades.length})
        </div>
        {review.trades.length === 0 ? (
          <p style={{ fontSize: "12px", color: "var(--color-faint)" }}>Keine Trades in dieser Woche.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {review.trades.map((t) => (
              <Link
                key={t.id}
                href={`/journal?trade=${t.id}&type=${t.type}`}
                className="hover:bg-active"
                style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", fontSize: "12px", fontFamily: MONO, padding: "9px 8px", borderRadius: "9px", borderBottom: "1px solid var(--color-border)", textDecoration: "none", color: "inherit" }}
              >
                <span style={{ color: "var(--color-faint)" }}>{dm(t.date)}</span>
                <Badge tone={t.type === "funded" ? "accent" : "neutral"}>{t.type === "funded" ? "Funded" : "EK"}</Badge>
                <span style={{ fontWeight: 600, color: "var(--color-text)" }}>{t.pair}</span>
                <span style={{ color: t.direction === "long" ? "var(--color-up)" : "var(--color-down)" }}>{t.direction.toUpperCase()}</span>
                <span style={{ fontWeight: 700, marginLeft: "auto", color: t.rMultiple > 0 ? "var(--color-up)" : t.rMultiple < 0 ? "var(--color-down)" : "var(--color-faint)" }}>
                  {t.rMultiple > 0 ? "+" : ""}{t.rMultiple.toFixed(2)} R
                </span>
                <span style={{ flexBasis: "100%", display: "flex", gap: "12px", alignItems: "center", fontSize: "11px", color: "var(--color-faint)" }}>
                  <span title="Setup">{setupShorts(t)}</span>
                  <span title="Plan-Befolgung">Adhärenz {t.adherenceScore != null ? `${Math.round(t.adherenceScore)}%` : "—"}</span>
                  <span style={{ marginLeft: "auto", color: "var(--color-accent)" }}>Öffnen →</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
