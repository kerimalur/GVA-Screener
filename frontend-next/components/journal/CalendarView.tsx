"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import Segmented from "@/components/ui/Segmented";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toaster";
import type { Trade } from "@/lib/journal/types";
import { SETUP_DEFINITIONS } from "@/lib/journal/types";
import { loadTrades } from "@/lib/journal/trades";
import { loadAccountConfigs } from "@/lib/journal/accounts";
import { loadOutlooks, OUTLOOK_STATUS_CONFIG, type OutlookRecord } from "@/lib/journal/outlooks";
import { budgetState, type BudgetState } from "@/lib/journal/budget";
import type { CalendarEventRow } from "@/lib/supabase/types";
import {
  timePatterns,
  MIN_PATTERN_TRADES,
  type BucketStat,
  type TimePatternResult,
} from "@/lib/journal/timePatterns";

const WEEKDAYS_ALL  = ["MO", "DI", "MI", "DO", "FR", "SA", "SO"];
const WEEKDAYS_WORK = ["MO", "DI", "MI", "DO", "FR"];
const MONTHS_LONG = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
const MONTHS_SHORT = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];

type AccountFilter = "all" | "ek" | "funded";
type ViewMode = "month" | "year";

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function weekdayIndex(date: Date): number { return (date.getDay() + 6) % 7; }

/** Aktive Setup-Kürzel eines Trades (aus den setup_*-Flags). "—" wenn keins. */
function setupShorts(t: Trade): string {
  const shorts = Object.values(SETUP_DEFINITIONS)
    .filter((d) => (t as unknown as Record<string, boolean>)[d.key])
    .map((d) => d.short);
  return shorts.length ? shorts.join(" · ") : "—";
}

/** Farbe der Winrate: grün ab 50 %, sonst gedämpft; null (keine Entscheidung) grau. */
function winRateColor(wr: number | null): string {
  if (wr == null) return "var(--color-faint)";
  return wr >= 50 ? "var(--color-up)" : "var(--color-muted)";
}

export default function CalendarView({ upcomingEvents = [] }: { upcomingEvents?: CalendarEventRow[] }) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [openSetups, setOpenSetups] = useState<OutlookRecord[]>([]);
  const [currency, setCurrency] = useState<string>("USD");
  const [loading, setLoading] = useState(true);
  // Standardansicht rechts = Wochenausblick; „Muster" schaltet auf die
  // Zeit-Muster-Analyse. Tages-Detail überlagert beide bei Tagesauswahl.
  const [panelMode, setPanelMode] = useState<"outlook" | "patterns">("outlook");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [accountFilter, setAccountFilter] = useState<AccountFilter>("all");
  const [showWeekends, setShowWeekends] = useState(false);
  // Rechte Spalte — Ziel fürs Auto-Scroll beim Tippen eines Tages (Mobile).
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadTrades(), loadAccountConfigs(), loadOutlooks()])
      .then(([t, c, o]) => {
        setTrades(t);
        setCurrency(c?.funded?.currency || c?.ek?.currency || "USD");
        // Offene Setups (nicht abgeschlossen) — dieselbe Regel wie im Cockpit.
        setOpenSetups(o.filter((x) => x.status === "observation" || x.status === "waiting" || x.status === "active"));
      })
      .catch(() => toast.error("Fehler beim Laden"))
      .finally(() => setLoading(false));
  }, []);

  // Budget ist kontenübergreifend → alle Trades (budgetState filtert Live selbst).
  const budget = useMemo(() => budgetState(trades), [trades]);

  const filteredTrades = useMemo(
    () => trades.filter((t) => (accountFilter === "all" || t.type === accountFilter) && t.sessionType === "live"),
    [trades, accountFilter],
  );

  const monthStats = useMemo(() => {
    const { year, month } = { year: currentDate.getFullYear(), month: currentDate.getMonth() };
    const mt = filteredTrades.filter((t) => { const d = new Date(t.date); return d.getFullYear()===year && d.getMonth()===month; });
    const wins = mt.filter((t) => t.result === "win").length;
    return { total: mt.length, wins, totalR: mt.reduce((s,t)=>s+t.rMultiple,0), totalEur: mt.reduce((s,t)=>s+(t.profitAmount??0),0), winRate: mt.length>0?(wins/mt.length)*100:0, tradingDays: new Set(mt.map((t)=>t.date)).size };
  }, [currentDate, filteredTrades]);

  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear(), month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month+1, 0);
    const today = toDateStr(new Date());
    const days: { date: Date; dateStr: string; isCurrentMonth: boolean; isToday: boolean; isWeekend: boolean; trades: Trade[]; totalR: number; totalEur: number; }[] = [];

    const push = (date: Date, isCurrent: boolean) => {
      const dow = weekdayIndex(date);
      if (!showWeekends && dow >= 5) return;
      const dateStr = toDateStr(date);
      const dt = filteredTrades.filter((t) => t.date === dateStr);
      days.push({ date, dateStr, isCurrentMonth: isCurrent, isToday: dateStr===today, isWeekend: dow>=5, trades: dt, totalR: dt.reduce((s,t)=>s+t.rMultiple,0), totalEur: dt.reduce((s,t)=>s+(t.profitAmount??0),0) });
    };

    let offset = weekdayIndex(firstDay);
    if (!showWeekends) offset = Math.min(offset, 5);
    for (let i=offset-1; i>=0; i--) push(new Date(year,month,-i), false);
    for (let i=1; i<=lastDay.getDate(); i++) push(new Date(year,month,i), true);
    const cols = showWeekends ? 7 : 5;
    const rem = cols - (days.length % cols === 0 ? 0 : days.length % cols);
    if (rem < cols) for (let i=1; i<=rem; i++) push(new Date(year,month+1,i), false);
    return days;
  }, [currentDate, filteredTrades, showWeekends]);

  const yearData = useMemo(() => {
    const year = currentDate.getFullYear();
    return Array.from({length:12}, (_,month) => {
      const mt = filteredTrades.filter((t) => { const d=new Date(t.date); return d.getFullYear()===year && d.getMonth()===month; });
      return { month, trades: mt.length, totalR: mt.reduce((s,t)=>s+t.rMultiple,0), totalEur: mt.reduce((s,t)=>s+(t.profitAmount??0),0), wins: mt.filter((t)=>t.result==="win").length, losses: mt.filter((t)=>t.result==="loss").length };
    });
  }, [currentDate, filteredTrades]);

  const selectedDayData = useMemo(() => {
    if (!selectedDate) return null;
    const dt = filteredTrades.filter((t) => t.date === selectedDate);
    const wins = dt.filter((t) => t.result==="win").length;
    return { trades: dt, totalR: dt.reduce((s,t)=>s+t.rMultiple,0), totalEur: dt.reduce((s,t)=>s+(t.profitAmount??0),0), winRate: dt.length>0?(wins/dt.length)*100:0 };
  }, [selectedDate, filteredTrades]);

  // Trades des im Kalender angezeigten Zeitraums (Monat bzw. Jahr) — Basis der
  // Zeit-Muster-Analyse rechts, wenn kein Tag ausgewählt ist.
  const periodTrades = useMemo(() => {
    const year = currentDate.getFullYear();
    if (viewMode === "year") return filteredTrades.filter((t) => new Date(t.date).getFullYear() === year);
    const month = currentDate.getMonth();
    return filteredTrades.filter((t) => { const d = new Date(t.date); return d.getFullYear()===year && d.getMonth()===month; });
  }, [filteredTrades, currentDate, viewMode]);
  const patterns = useMemo(() => timePatterns(periodTrades), [periodTrades]);
  const periodLabel = viewMode === "year"
    ? String(currentDate.getFullYear())
    : `${MONTHS_LONG[currentDate.getMonth()]} ${currentDate.getFullYear()}`;

  // Tag wählen / abwählen. Beim Öffnen auf schmalen Viewports zum Panel scrollen,
  // damit das Tages-Detail nach dem Tippen sofort sichtbar ist.
  const selectDay = (dateStr: string) => {
    const opening = selectedDate !== dateStr;
    setSelectedDate(opening ? dateStr : null);
    if (opening && typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  const navigate = (dir: 1 | -1) => {
    setCurrentDate((prev) => { const d=new Date(prev); if (viewMode==="year") d.setFullYear(d.getFullYear()+dir); else d.setMonth(d.getMonth()+dir); return d; });
    setSelectedDate(null);
  };

  const cols = showWeekends ? 7 : 5;
  const weekdays = showWeekends ? WEEKDAYS_ALL : WEEKDAYS_WORK;
  const fmtEur = (v: number) => `${v>=0?"+":""}${v.toLocaleString("de-DE",{maximumFractionDigits:0})} ${currency}`;

  if (loading) return <div style={{background:"var(--color-surface)",border:"1px solid var(--color-border)",borderRadius:"16px",padding:"18px 20px"}}><SkeletonRows rows={7} /></div>;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:"14px"}} className="anim-fade-in max-w-[1200px] mx-auto">

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:"14px"}}>
        <div style={{display:"flex",gap:"8px"}}>
          <Segmented options={[{value:"all" as const,label:"Alle"},{value:"funded" as const,label:"Funded"},{value:"ek" as const,label:"EK"}]} value={accountFilter} onChange={setAccountFilter} />
          <Segmented options={[{value:"month" as const,label:"Monat"},{value:"year" as const,label:"Jahr"}]} value={viewMode} onChange={setViewMode} />
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"16px",fontSize:"13px",fontWeight:600,color:"var(--color-muted)"}}>
          <span>{monthStats.total} Trades</span>
          <span>{monthStats.tradingDays} Tage</span>
          <span style={{color:monthStats.totalR>=0?"var(--color-up)":"var(--color-down)"}}>{monthStats.totalR>=0?"+":""}{monthStats.totalR.toFixed(1)}R</span>
          <span style={{color:monthStats.winRate>=50?"var(--color-up)":"var(--color-muted)"}}>{monthStats.winRate.toFixed(0)}% WR</span>
        </div>
      </div>

      {/* Kalender links, kontextabhängiges Panel rechts. Auf schmalen Viewports
          untereinander (Kalender oben, Panel darunter) — via Tailwind-Breakpoint,
          weil Inline-Styles keine Media-Queries können. */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-[18px] items-start">

        {/* Calendar Card */}
        <div style={{background:"var(--color-surface)",border:"1px solid var(--color-border)",borderRadius:"16px",padding:"18px 20px"}}>

          {/* Navigation */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:"20px",marginBottom:"16px",position:"relative"}}>
            <button onClick={()=>navigate(-1)} style={{width:"34px",height:"34px",borderRadius:"10px",border:"1px solid var(--color-border2)",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--color-muted)",background:"transparent",cursor:"pointer",position:"absolute",left:0,fontSize:"16px"}}>‹</button>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:"15px",fontWeight:800}}>
                {viewMode==="month" ? `${MONTHS_LONG[currentDate.getMonth()]} ${currentDate.getFullYear()}` : currentDate.getFullYear()}
              </div>
              <button onClick={()=>{setCurrentDate(new Date());setSelectedDate(null);}} style={{fontSize:"12px",fontWeight:600,color:"var(--color-accent)",background:"transparent",border:"none",cursor:"pointer",marginTop:"2px"}}>Heute</button>
            </div>
            <button onClick={()=>navigate(1)} style={{width:"34px",height:"34px",borderRadius:"10px",border:"1px solid var(--color-border2)",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--color-muted)",background:"transparent",cursor:"pointer",position:"absolute",right:0,fontSize:"16px"}}>›</button>
          </div>

          {viewMode==="month" ? (
            <>
              {/* Weekday headers */}
              <div style={{display:"grid",gridTemplateColumns:`repeat(${cols},1fr)`,gap:"4px",marginBottom:"4px"}}>
                {weekdays.map((d)=>(
                  <div key={d} style={{textAlign:"center",fontSize:"11px",fontWeight:700,letterSpacing:"0.8px",color:"var(--color-faint)"}}>{d}</div>
                ))}
              </div>
              {/* Day cells — Karten-Stil: Kopfstreifen zeigt Gewinn/Verlust, Zellen näher am Quadrat */}
              <div style={{display:"grid",gridTemplateColumns:`repeat(${cols},1fr)`,gap:"6px"}}>
                {calendarDays.map((day)=>{
                  const hasTrades = day.trades.length > 0;
                  const isWin = hasTrades && day.totalR >= 0;
                  const isSelected = selectedDate===day.dateStr;
                  const emphasize = isSelected || day.isToday;

                  return (
                    <button
                      key={day.dateStr}
                      onClick={()=>selectDay(day.dateStr)}
                      style={{
                        aspectRatio:"1",
                        borderRadius:"9px",
                        background:"var(--color-surface2)",
                        border: emphasize ? "2px solid var(--color-accent)" : "1px solid transparent",
                        boxShadow: isSelected ? "0 0 0 3px rgba(224,138,60,0.18)" : day.isToday ? "0 0 0 3px rgba(224,138,60,0.12)" : "none",
                        overflow:"hidden",
                        display:"flex",
                        flexDirection:"column",
                        cursor:"pointer",
                        opacity: day.isCurrentMonth ? 1 : 0.35,
                        transition:"background 120ms",
                        padding:0,
                      }}
                    >
                      {/* Kopfstreifen: grün/rot bei Trades, sonst unsichtbar */}
                      <span style={{height:"3px",flexShrink:0,background: hasTrades ? (isWin?"var(--color-up)":"var(--color-down)") : "transparent"}} />
                      <span style={{flex:1,padding:"5px 6px",display:"flex",flexDirection:"column",justifyContent:"space-between"}}>
                        <span style={{fontSize:"11px",fontWeight:emphasize?700:600,color:"var(--color-text)",textAlign:"left"}}>{day.date.getDate()}</span>
                        {hasTrades && (
                          <span style={{textAlign:"center"}}>
                            <span style={{display:"block",fontFamily:"'JetBrains Mono',monospace",fontSize:"13px",fontWeight:800,color:isWin?"var(--color-up)":"var(--color-down)"}}>
                              {day.totalR>=0?"+":""}{day.totalR.toFixed(1)}R
                            </span>
                            {/* Ein Punkt pro Trade des Tages (max. 4, Rest als +N) */}
                            <span style={{display:"flex",justifyContent:"center",gap:"3px",marginTop:"4px"}}>
                              {Array.from({length: Math.min(day.trades.length, 4)}).map((_, i) => (
                                <span key={i} style={{width:"4px",height:"4px",borderRadius:"50%",background:isWin?"var(--color-up)":"var(--color-down)"}} />
                              ))}
                              {day.trades.length > 4 && (
                                <span style={{fontSize:"8px",fontWeight:700,color:"var(--color-faint)",marginLeft:"2px"}}>+{day.trades.length-4}</span>
                              )}
                            </span>
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Weekend toggle */}
              <div style={{marginTop:"12px",paddingTop:"10px",borderTop:"1px solid var(--color-border)",display:"flex",alignItems:"center",gap:"8px"}}>
                <label style={{display:"flex",alignItems:"center",gap:"8px",fontSize:"12.5px",fontWeight:600,color:"var(--color-muted)",cursor:"pointer"}}>
                  <span style={{width:"16px",height:"16px",borderRadius:"5px",background:showWeekends?"var(--color-accent)":"var(--color-surface2)",border:`1px solid ${showWeekends?"var(--color-accent)":"var(--color-border2)"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}} onClick={()=>setShowWeekends(!showWeekends)}>
                    {showWeekends&&<span style={{color:"var(--color-active)",fontSize:"10px",fontWeight:700}}>✓</span>}
                  </span>
                  Sa / So anzeigen
                </label>
              </div>
            </>
          ) : (
            /* Year view */
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"10px"}}>
              {yearData.map((m)=>(
                <button key={m.month} onClick={()=>{setCurrentDate(new Date(currentDate.getFullYear(),m.month,1));setViewMode("month");}} style={{padding:"14px",borderRadius:"12px",background:m.trades>0?(m.totalR>=0?"rgba(61,220,151,0.08)":"rgba(239,100,97,0.08)"):"var(--color-surface2)",border:`1px solid ${m.trades>0?(m.totalR>=0?"rgba(61,220,151,0.2)":"rgba(239,100,97,0.2)"):"var(--color-border)"}`,cursor:"pointer",textAlign:"left"}}>
                  <div style={{fontSize:"11px",fontWeight:700,color:"var(--color-muted)",marginBottom:"6px"}}>{MONTHS_SHORT[m.month]}</div>
                  {m.trades>0?(
                    <>
                      <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:"16px",fontWeight:700,color:m.totalR>=0?"var(--color-up)":"var(--color-down)"}}>{m.totalR>=0?"+":""}{m.totalR.toFixed(1)}R</div>
                      <div style={{fontSize:"11px",color:"var(--color-faint)",fontFamily:"var(--font-mono)",marginTop:"2px"}}>{m.wins}W / {m.losses}L</div>
                    </>
                  ):(
                    <div style={{color:"var(--color-faint)",fontSize:"18px",marginTop:"4px"}}>—</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Kontextabhängiges Panel: Tages-Detail (Tag gewählt) oder
            Zeit-Muster-Analyse (kein Tag gewählt). Immer präsent — die rechte
            Hälfte bleibt nie leer. */}
        <div ref={panelRef}>
          {selectedDate && selectedDayData ? (
            <div style={{background:"var(--color-surface)",border:"1px solid var(--color-border)",borderRadius:"18px",padding:"24px"}} className="anim-slide-up">
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"16px"}}>
                <div style={{fontSize:"14px",fontWeight:700}}>
                  {new Date(selectedDate+"T12:00:00").toLocaleDateString("de-DE",{weekday:"long",day:"numeric",month:"long"})}
                </div>
                <button onClick={()=>setSelectedDate(null)} title="Zurück zur Zeit-Muster-Analyse" style={{color:"var(--color-faint)",background:"transparent",border:"none",cursor:"pointer",fontSize:"18px",lineHeight:1,padding:"4px 8px"}}>×</button>
              </div>

              <div style={{display:"flex",gap:"16px",marginBottom:"16px",fontSize:"12px",fontFamily:"'JetBrains Mono',monospace",flexWrap:"wrap"}}>
                <span style={{color:"var(--color-muted)"}}>{selectedDayData.trades.length} Trades</span>
                <span style={{color:selectedDayData.totalR>=0?"var(--color-up)":"var(--color-down)"}}>{selectedDayData.totalR>=0?"+":""}{selectedDayData.totalR.toFixed(2)} R</span>
                <span style={{color:selectedDayData.totalEur>=0?"var(--color-up)":"var(--color-down)"}}>{fmtEur(selectedDayData.totalEur)}</span>
                <span style={{color:"var(--color-muted)"}}>{selectedDayData.winRate.toFixed(0)}% WR</span>
              </div>

              {selectedDayData.trades.length===0 ? (
                <p style={{fontSize:"12px",color:"var(--color-faint)",padding:"8px 0"}}>Keine Trades an diesem Tag.</p>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:"6px",maxHeight:"400px",overflowY:"auto"}}>
                  {selectedDayData.trades.map((t)=>(
                    <Link
                      key={t.id}
                      href={`/journal?trade=${t.id}&type=${t.type}`}
                      className="hover:bg-active"
                      style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:"8px",fontSize:"12px",fontFamily:"'JetBrains Mono',monospace",padding:"9px 8px",borderRadius:"9px",borderBottom:"1px solid var(--color-border)",textDecoration:"none",color:"inherit"}}
                    >
                      <Badge tone={t.type==="funded"?"accent":"neutral"}>{t.type==="funded"?"Funded":"EK"}</Badge>
                      <span style={{fontWeight:600,color:"var(--color-text)"}}>{t.pair}</span>
                      <span style={{color:t.direction==="long"?"var(--color-up)":"var(--color-down)"}}>{t.direction.toUpperCase()}</span>
                      <span style={{fontWeight:700,marginLeft:"auto",color:t.rMultiple>0?"var(--color-up)":t.rMultiple<0?"var(--color-down)":"var(--color-faint)"}}>
                        {t.rMultiple>0?"+":""}{t.rMultiple.toFixed(2)} R
                      </span>
                      <span style={{flexBasis:"100%",display:"flex",gap:"12px",alignItems:"center",fontSize:"11px",color:"var(--color-faint)"}}>
                        <span title="Setup">{setupShorts(t)}</span>
                        <span title="Plan-Befolgung">Adhärenz {t.adherenceScore!=null?`${Math.round(t.adherenceScore)}%`:"—"}</span>
                        <span style={{marginLeft:"auto",color:"var(--color-accent)"}}>Öffnen →</span>
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="anim-fade-in" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <Segmented
                options={[{ value: "outlook" as const, label: "Ausblick" }, { value: "patterns" as const, label: "Muster" }]}
                value={panelMode}
                onChange={setPanelMode}
              />
              {panelMode === "outlook" ? (
                <WeekOutlookPanel events={upcomingEvents} openSetups={openSetups} budget={budget} />
              ) : (
                <TimePatternPanel patterns={patterns} periodLabel={periodLabel} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Zeit-Muster-Analyse — Standardansicht der rechten Hälfte (kein Tag gewählt) */
/* -------------------------------------------------------------------------- */

const MONO = "'JetBrains Mono',monospace";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", color: "var(--color-faint)", marginBottom: "8px" }}>
      {children}
    </div>
  );
}

function BucketRow({ b }: { b: BucketStat }) {
  const has = b.trades > 0;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "42px 1fr auto", gap: "10px", alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--color-border)" }}>
      <span style={{ fontSize: "12.5px", fontWeight: 700, color: has ? "var(--color-text)" : "var(--color-faint)" }}>{b.label}</span>
      <span style={{ fontSize: "11px", fontFamily: MONO, color: "var(--color-faint)" }}>
        {has ? (
          <>
            {b.trades} {b.trades === 1 ? "Trade" : "Trades"}
            {b.winRate != null && (
              <>{" · "}<span style={{ color: winRateColor(b.winRate) }}>{b.winRate.toFixed(0)}% WR</span></>
            )}
          </>
        ) : "—"}
      </span>
      <span style={{ fontSize: "12.5px", fontWeight: 700, fontFamily: MONO, color: has ? (b.totalR >= 0 ? "var(--color-up)" : "var(--color-down)") : "var(--color-faint)" }}>
        {has ? `${b.totalR >= 0 ? "+" : ""}${b.totalR.toFixed(1)}R` : "—"}
      </span>
    </div>
  );
}

function TimePatternPanel({ patterns, periodLabel }: { patterns: TimePatternResult; periodLabel: string }) {
  return (
    <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "18px", padding: "22px" }} className="anim-fade-in">
      <div style={{ marginBottom: "16px" }}>
        <div style={{ fontSize: "14px", fontWeight: 700 }}>Zeit-Muster</div>
        <div style={{ fontSize: "11.5px", color: "var(--color-faint)", marginTop: "2px" }}>{periodLabel} · {patterns.total} {patterns.total === 1 ? "Trade" : "Trades"}</div>
      </div>

      {!patterns.enough ? (
        <p style={{ fontSize: "12px", color: "var(--color-faint)", lineHeight: 1.6, padding: "6px 0" }}>
          Zu wenige Trades im Zeitraum für belastbare Muster (unter {MIN_PATTERN_TRADES}).
          Prozentzahlen wären hier Rauschen — wähle einen grösseren Zeitraum oder einen Tag für die Detailliste.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div>
            <SectionLabel>Nach Wochentag</SectionLabel>
            {patterns.weekday.map((b) => <BucketRow key={b.key} b={b} />)}
          </div>

          <div>
            <SectionLabel>Nach Session</SectionLabel>
            {patterns.session.map((b) => <BucketRow key={b.key} b={b} />)}
            {patterns.withoutSession > 0 && (
              <p style={{ fontSize: "10.5px", color: "var(--color-faint)", marginTop: "8px", lineHeight: 1.5 }}>
                {patterns.withoutSession} {patterns.withoutSession === 1 ? "Trade" : "Trades"} ohne Session-Angabe — nicht in der Session-Auswertung.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Wochenausblick — Standardansicht der rechten Hälfte (kein Tag gewählt)      */
/* -------------------------------------------------------------------------- */

/** Montag der Kalenderwoche eines ISO-Zeitstempels als "dd.mm." */
function outlookWeekKey(iso: string): string {
  const d = new Date(iso);
  const dow = (d.getDay() + 6) % 7;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow);
  return `${String(monday.getDate()).padStart(2, "0")}.${String(monday.getMonth() + 1).padStart(2, "0")}.`;
}

function groupEventsByWeek(events: CalendarEventRow[]): { week: string; items: CalendarEventRow[] }[] {
  const order: string[] = [];
  const map: Record<string, CalendarEventRow[]> = {};
  for (const e of events) {
    const k = outlookWeekKey(e.event_time);
    if (!map[k]) { map[k] = []; order.push(k); }
    map[k].push(e);
  }
  return order.map((week) => ({ week, items: map[week] }));
}

function WeekOutlookPanel({
  events,
  openSetups,
  budget,
}: {
  events: CalendarEventRow[];
  openSetups: OutlookRecord[];
  budget: BudgetState;
}) {
  const shownEvents = events.slice(0, 12);
  const groups = groupEventsByWeek(shownEvents);
  const shownSetups = openSetups.slice(0, 6);

  return (
    <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "18px", padding: "22px" }} className="anim-fade-in">
      <div style={{ marginBottom: "16px" }}>
        <div style={{ fontSize: "14px", fontWeight: 700 }}>Wochenausblick</div>
        <div style={{ fontSize: "11.5px", color: "var(--color-faint)", marginTop: "2px" }}>Nächste Wochen — Termine, Setups, Budget</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {/* Trade-Budget */}
        <div>
          <SectionLabel>Trade-Budget</SectionLabel>
          <div style={{ fontSize: "12.5px", fontFamily: MONO }}>
            <span style={{ fontWeight: 700, color: budget.offen > 0 ? "var(--color-up)" : "var(--color-faint)" }}>
              {budget.offen} von {budget.total}
            </span>
            <span style={{ color: "var(--color-faint)" }}> frei · {budget.used} genutzt</span>
            {budget.overrun > 0 && <span style={{ color: "var(--color-down)" }}> · {budget.overrun} über Budget</span>}
          </div>
        </div>

        {/* Offene Setups aus dem Cockpit */}
        <div>
          <SectionLabel>Offene Setups ({openSetups.length})</SectionLabel>
          {openSetups.length === 0 ? (
            <p style={{ fontSize: "11.5px", color: "var(--color-faint)" }}>Keine offenen Setups.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {shownSetups.map((o) => {
                const cfg = OUTLOOK_STATUS_CONFIG[o.status];
                return (
                  <Link
                    key={o.id ?? o.symbol}
                    href={`/cockpit?pair=${o.symbol.replace("/", "")}`}
                    className="hover:bg-active"
                    style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", fontFamily: MONO, padding: "6px 8px", borderRadius: "8px", textDecoration: "none", color: "inherit" }}
                  >
                    <span style={{ fontWeight: 700, color: "var(--color-text)" }}>{o.symbol}</span>
                    <span style={{ color: o.direction === "long" ? "var(--color-up)" : "var(--color-down)" }}>{o.direction === "long" ? "▲" : "▼"}</span>
                    <span style={{ marginLeft: "auto", fontSize: "10.5px", color: `var(--color-${cfg.tone})` }}>{cfg.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* High-Impact-News der kommenden Wochen */}
        <div>
          <SectionLabel>High-Impact — nächste Wochen</SectionLabel>
          {events.length === 0 ? (
            <p style={{ fontSize: "11.5px", color: "var(--color-faint)" }}>Keine High-Impact-Termine in den nächsten 4 Wochen.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {groups.map((g) => (
                <div key={g.week}>
                  <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--color-faint)", marginBottom: "4px" }}>Woche ab {g.week}</div>
                  {g.items.map((e) => {
                    const d = new Date(e.event_time);
                    const dm = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.`;
                    return (
                      <div key={e.id} style={{ display: "flex", alignItems: "baseline", gap: "8px", fontSize: "11.5px", padding: "2px 0" }}>
                        <span style={{ fontFamily: MONO, color: "var(--color-faint)", flexShrink: 0 }}>{dm}</span>
                        {e.currency && <span style={{ fontFamily: MONO, fontWeight: 700, color: "var(--color-accent)", flexShrink: 0 }}>{e.currency}</span>}
                        <span style={{ color: "var(--color-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.title}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
              {events.length > shownEvents.length && (
                <div style={{ fontSize: "10.5px", color: "var(--color-faint)" }}>+{events.length - shownEvents.length} weitere</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
