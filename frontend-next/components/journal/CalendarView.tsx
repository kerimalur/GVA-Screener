"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Panel from "@/components/layout/Panel";
import Badge from "@/components/ui/Badge";
import Segmented from "@/components/ui/Segmented";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toaster";
import type { Trade } from "@/lib/journal/types";
import { loadTrades } from "@/lib/journal/trades";
import { loadAccountConfigs } from "@/lib/journal/accounts";

const WEEKDAYS_ALL  = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const WEEKDAYS_WORK = ["Mo", "Di", "Mi", "Do", "Fr"];
const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

type AccountFilter = "all" | "ek" | "funded";
type ViewMode = "month" | "year";

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Wochentag (0=Mo … 6=So) */
function weekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export default function CalendarView() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [currency, setCurrency] = useState<string>("USD");
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [accountFilter, setAccountFilter] = useState<AccountFilter>("all");
  const [showWeekends, setShowWeekends] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Daten-Fetch beim Mount
    setLoading(true);
    Promise.all([loadTrades(), loadAccountConfigs()])
      .then(([t, c]) => {
        setTrades(t);
        // Währung aus aktivem Konto
        setCurrency(c?.funded?.currency || c?.ek?.currency || "USD");
      })
      .catch(() => toast.error("Fehler beim Laden"))
      .finally(() => setLoading(false));
  }, []);

  const filteredTrades = useMemo(
    () =>
      trades.filter(
        (t) => (accountFilter === "all" || t.type === accountFilter) && t.sessionType === "live",
      ),
    [trades, accountFilter],
  );

  const monthStats = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthTrades = filteredTrades.filter((t) => {
      const d = new Date(t.date);
      return d.getFullYear() === year && d.getMonth() === month;
    });
    const totalR = monthTrades.reduce((s, t) => s + t.rMultiple, 0);
    const totalEur = monthTrades.reduce((s, t) => s + (t.profitAmount ?? 0), 0);
    const wins = monthTrades.filter((t) => t.result === "win").length;
    return {
      total: monthTrades.length,
      wins,
      totalR,
      totalEur,
      winRate: monthTrades.length > 0 ? (wins / monthTrades.length) * 100 : 0,
      tradingDays: new Set(monthTrades.map((t) => t.date)).size,
    };
  }, [currentDate, filteredTrades]);

  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const today = toDateStr(new Date());
    const days: {
      date: Date;
      dateStr: string;
      isCurrentMonth: boolean;
      isToday: boolean;
      isWeekend: boolean;
      trades: Trade[];
      totalR: number;
      totalEur: number;
    }[] = [];

    // Mo-offset für ersten Tag des Monats
    let startOffset = weekdayIndex(firstDay);

    const push = (date: Date, isCurrentMonth: boolean) => {
      const dow = weekdayIndex(date);
      const isWeekend = dow >= 5;
      if (!showWeekends && isWeekend) return;
      const dateStr = toDateStr(date);
      const dayTrades = filteredTrades.filter((t) => t.date === dateStr);
      days.push({
        date,
        dateStr,
        isCurrentMonth,
        isToday: dateStr === today,
        isWeekend,
        trades: dayTrades,
        totalR: dayTrades.reduce((s, t) => s + t.rMultiple, 0),
        totalEur: dayTrades.reduce((s, t) => s + (t.profitAmount ?? 0), 0),
      });
    };

    // Vortage (voriger Monat)
    for (let i = startOffset - 1; i >= 0; i--) push(new Date(year, month, -i), false);
    // Tage des Monats
    for (let i = 1; i <= lastDay.getDate(); i++) push(new Date(year, month, i), true);
    // Füll-Tage (nächster Monat) — bis Zeilen voll sind
    const cols = showWeekends ? 7 : 5;
    const remaining = cols - (days.length % cols === 0 ? 0 : days.length % cols);
    if (remaining < cols) {
      for (let i = 1; i <= remaining; i++) push(new Date(year, month + 1, i), false);
    }
    return days;
  }, [currentDate, filteredTrades, showWeekends]);

  const yearData = useMemo(() => {
    const year = currentDate.getFullYear();
    return Array.from({ length: 12 }, (_, month) => {
      const monthTrades = filteredTrades.filter((t) => {
        const d = new Date(t.date);
        return d.getFullYear() === year && d.getMonth() === month;
      });
      return {
        month,
        trades: monthTrades.length,
        totalR: monthTrades.reduce((s, t) => s + t.rMultiple, 0),
        totalEur: monthTrades.reduce((s, t) => s + (t.profitAmount ?? 0), 0),
        wins: monthTrades.filter((t) => t.result === "win").length,
        losses: monthTrades.filter((t) => t.result === "loss").length,
      };
    });
  }, [currentDate, filteredTrades]);

  const selectedDayData = useMemo(() => {
    if (!selectedDate) return null;
    const dayTrades = filteredTrades.filter((t) => t.date === selectedDate);
    const totalR = dayTrades.reduce((s, t) => s + t.rMultiple, 0);
    const totalEur = dayTrades.reduce((s, t) => s + (t.profitAmount ?? 0), 0);
    const wins = dayTrades.filter((t) => t.result === "win").length;
    return {
      trades: dayTrades,
      totalR,
      totalEur,
      winRate: dayTrades.length > 0 ? (wins / dayTrades.length) * 100 : 0,
    };
  }, [selectedDate, filteredTrades]);

  const navigate = (dir: 1 | -1) => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      if (viewMode === "year") d.setFullYear(d.getFullYear() + dir);
      else d.setMonth(d.getMonth() + dir);
      return d;
    });
    setSelectedDate(null);
  };

  const cols = showWeekends ? 7 : 5;
  const weekdays = showWeekends ? WEEKDAYS_ALL : WEEKDAYS_WORK;

  const fmtEur = (v: number) =>
    `${v >= 0 ? "+" : ""}${v.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ${currency}`;

  if (loading) {
    return (
      <Panel>
        <SkeletonRows rows={7} />
      </Panel>
    );
  }

  return (
    <div className="space-y-4 anim-fade-in">
      {/* Kopfzeile */}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          options={[
            { value: "all" as const, label: "Alle" },
            { value: "funded" as const, label: "Funded" },
            { value: "ek" as const, label: "EK" },
          ]}
          value={accountFilter}
          onChange={setAccountFilter}
        />
        <Segmented
          options={[
            { value: "month" as const, label: "Monat" },
            { value: "year" as const, label: "Jahr" },
          ]}
          value={viewMode}
          onChange={setViewMode}
        />
        {/* Wochenenden-Toggle */}
        <label className="flex items-center gap-1.5 text-[12px] text-muted cursor-pointer ml-1">
          <input
            type="checkbox"
            checked={showWeekends}
            onChange={(e) => setShowWeekends(e.target.checked)}
            className="w-3.5 h-3.5 accent-[var(--color-accent)]"
          />
          Sa / So
        </label>

        {/* Monatszusammenfassung */}
        <div className="ml-auto flex items-center gap-4 text-[12px] font-mono">
          <span className="text-muted">
            {monthStats.total} Trades · {monthStats.tradingDays} Tage
          </span>
          <span className={monthStats.totalR >= 0 ? "text-up" : "text-down"}>
            {monthStats.totalR >= 0 ? "+" : ""}
            {monthStats.totalR.toFixed(1)} R
          </span>
          <span className={monthStats.totalEur >= 0 ? "text-up" : "text-down"}>
            {fmtEur(monthStats.totalEur)}
          </span>
          <span className="text-muted">{monthStats.winRate.toFixed(0)}% WR</span>
        </div>
      </div>

      <Panel>
        {/* Navigation */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => navigate(-1)}
            className="w-8 h-8 rounded-md border border-border2 text-muted hover:text-text transition-colors"
            aria-label="Zurück"
          >
            <i className="ph-bold ph-caret-left" />
          </button>
          <div className="text-center">
            <h2 className="text-sm font-semibold">
              {viewMode === "month"
                ? `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`
                : currentDate.getFullYear()}
            </h2>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="text-[10px] text-accent hover:underline"
            >
              Heute
            </button>
          </div>
          <button
            onClick={() => navigate(1)}
            className="w-8 h-8 rounded-md border border-border2 text-muted hover:text-text transition-colors"
            aria-label="Weiter"
          >
            <i className="ph-bold ph-caret-right" />
          </button>
        </div>

        {viewMode === "month" ? (
          <>
            {/* Wochentag-Header */}
            <div className={`grid gap-1.5 mb-1.5`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
              {weekdays.map((d) => (
                <div key={d} className="text-center text-[10px] font-semibold text-faint uppercase py-1">
                  {d}
                </div>
              ))}
            </div>
            {/* Tage */}
            <div className={`grid gap-1.5`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
              {calendarDays.map((day) => (
                <button
                  key={day.dateStr}
                  onClick={() => setSelectedDate(day.dateStr)}
                  className={`min-h-[72px] p-1.5 rounded-md text-left flex flex-col border transition-colors ${
                    selectedDate === day.dateStr
                      ? "border-accent bg-accent/10"
                      : day.isToday
                        ? "border-accent/60"
                        : "border-transparent"
                  } ${
                    day.trades.length > 0
                      ? day.totalR >= 0
                        ? "bg-up/10 hover:bg-up/15"
                        : "bg-down/10 hover:bg-down/15"
                      : "bg-bg hover:bg-surface2"
                  } ${day.isCurrentMonth ? "" : "opacity-30"}`}
                >
                  <span className="text-[11px] font-medium">{day.date.getDate()}</span>
                  {day.trades.length > 0 && (
                    <>
                      <span
                        className={`text-[11px] font-mono font-bold mt-auto ${
                          day.totalR >= 0 ? "text-up" : "text-down"
                        }`}
                      >
                        {day.totalR >= 0 ? "+" : ""}
                        {day.totalR.toFixed(1)}R
                      </span>
                      <span
                        className={`text-[10px] font-mono ${
                          day.totalEur >= 0 ? "text-up/70" : "text-down/70"
                        }`}
                      >
                        {day.totalEur >= 0 ? "+" : ""}
                        {day.totalEur.toLocaleString("de-DE", { maximumFractionDigits: 0 })}
                      </span>
                      <span className="text-[9px] text-muted">{day.trades.length}×</span>
                    </>
                  )}
                </button>
              ))}
            </div>
          </>
        ) : (
          /* Jahresansicht */
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            {yearData.map((m) => (
              <button
                key={m.month}
                onClick={() => {
                  setCurrentDate(new Date(currentDate.getFullYear(), m.month, 1));
                  setViewMode("month");
                }}
                className={`p-3 rounded-md text-left border transition-colors ${
                  m.trades > 0
                    ? m.totalR >= 0
                      ? "bg-up/5 border-up/20 hover:border-up/40"
                      : "bg-down/5 border-down/20 hover:border-down/40"
                    : "bg-bg border-border2 hover:border-faint"
                }`}
              >
                <div className="text-[11px] font-semibold text-muted">{MONTHS[m.month]}</div>
                {m.trades > 0 ? (
                  <>
                    <div
                      className={`text-base font-bold font-mono ${
                        m.totalR >= 0 ? "text-up" : "text-down"
                      }`}
                    >
                      {m.totalR >= 0 ? "+" : ""}
                      {m.totalR.toFixed(1)}R
                    </div>
                    <div className={`text-[11px] font-mono ${m.totalEur >= 0 ? "text-up/70" : "text-down/70"}`}>
                      {fmtEur(m.totalEur)}
                    </div>
                    <div className="text-[10px] text-muted font-mono">
                      {m.wins}W / {m.losses}L
                    </div>
                  </>
                ) : (
                  <div className="text-muted/40 text-sm mt-1">—</div>
                )}
              </button>
            ))}
          </div>
        )}
      </Panel>

      {/* Tages-Detail */}
      {selectedDate && selectedDayData && (
        <Panel
          title={new Date(selectedDate + "T12:00:00").toLocaleDateString("de-DE", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
          actions={
            <>
              <Link href="/journal" className="text-[11px] text-accent hover:underline">
                Zum Journal →
              </Link>
              <button
                onClick={() => setSelectedDate(null)}
                className="text-muted hover:text-text transition-colors"
                aria-label="Schließen"
              >
                <i className="ph-bold ph-x" />
              </button>
            </>
          }
          className="anim-slide-up"
        >
          <div className="flex gap-6 mb-3 text-[12px] font-mono">
            <span className="text-muted">{selectedDayData.trades.length} Trades</span>
            <span className={selectedDayData.totalR >= 0 ? "text-up" : "text-down"}>
              {selectedDayData.totalR >= 0 ? "+" : ""}
              {selectedDayData.totalR.toFixed(2)} R
            </span>
            <span className={selectedDayData.totalEur >= 0 ? "text-up" : "text-down"}>
              {fmtEur(selectedDayData.totalEur)}
            </span>
            <span className="text-muted">{selectedDayData.winRate.toFixed(0)}% WR</span>
          </div>
          {selectedDayData.trades.length === 0 ? (
            <p className="text-[12px] text-muted py-3">Keine Trades an diesem Tag.</p>
          ) : (
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {selectedDayData.trades.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 text-[12px] font-mono py-1.5 border-b border-border/50 last:border-0"
                >
                  <Badge tone={t.type === "funded" ? "accent" : "neutral"}>
                    {t.type === "funded" ? "Funded" : "EK"}
                  </Badge>
                  <span className="font-semibold">{t.pair}</span>
                  <span className={t.direction === "long" ? "text-up" : "text-down"}>
                    {t.direction.toUpperCase()}
                  </span>
                  <span
                    className={`font-semibold ${
                      t.rMultiple > 0 ? "text-up" : t.rMultiple < 0 ? "text-down" : "text-muted"
                    }`}
                  >
                    {t.rMultiple > 0 ? "+" : ""}
                    {t.rMultiple.toFixed(2)} R
                  </span>
                  {t.profitAmount != null && (
                    <span
                      className={`ml-auto text-[11px] ${
                        t.profitAmount > 0 ? "text-up/70" : t.profitAmount < 0 ? "text-down/70" : "text-muted"
                      }`}
                    >
                      {t.profitAmount > 0 ? "+" : ""}
                      {t.profitAmount.toLocaleString("de-DE", { maximumFractionDigits: 0 })} {currency}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
