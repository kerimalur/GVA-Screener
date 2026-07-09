"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import Segmented from "@/components/ui/Segmented";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toaster";
import type { Trade } from "@/lib/journal/types";
import { loadTrades } from "@/lib/journal/trades";
import { loadAccountConfigs } from "@/lib/journal/accounts";

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
    setLoading(true);
    Promise.all([loadTrades(), loadAccountConfigs()])
      .then(([t, c]) => { setTrades(t); setCurrency(c?.funded?.currency || c?.ek?.currency || "USD"); })
      .catch(() => toast.error("Fehler beim Laden"))
      .finally(() => setLoading(false));
  }, []);

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

  const navigate = (dir: 1 | -1) => {
    setCurrentDate((prev) => { const d=new Date(prev); if (viewMode==="year") d.setFullYear(d.getFullYear()+dir); else d.setMonth(d.getMonth()+dir); return d; });
    setSelectedDate(null);
  };

  const cols = showWeekends ? 7 : 5;
  const weekdays = showWeekends ? WEEKDAYS_ALL : WEEKDAYS_WORK;
  const fmtEur = (v: number) => `${v>=0?"+":""}${v.toLocaleString("de-DE",{maximumFractionDigits:0})} ${currency}`;

  if (loading) return <div style={{background:"var(--color-surface)",border:"1px solid var(--color-border)",borderRadius:"18px",padding:"28px"}}><SkeletonRows rows={7} /></div>;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:"22px"}} className="anim-fade-in">

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

      {/* Calendar + Detail side by side */}
      <div style={{display:"grid",gridTemplateColumns:selectedDate?"1fr 288px":"1fr",gap:"18px",alignItems:"start"}}>

        {/* Calendar Card */}
        <div style={{background:"var(--color-surface)",border:"1px solid var(--color-border)",borderRadius:"18px",padding:"28px"}}>

          {/* Navigation */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:"20px",marginBottom:"24px",position:"relative"}}>
            <button onClick={()=>navigate(-1)} style={{width:"34px",height:"34px",borderRadius:"10px",border:"1px solid var(--color-border2)",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--color-muted)",background:"transparent",cursor:"pointer",position:"absolute",left:0,fontSize:"16px"}}>‹</button>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:"18px",fontWeight:800}}>
                {viewMode==="month" ? `${MONTHS_LONG[currentDate.getMonth()]} ${currentDate.getFullYear()}` : currentDate.getFullYear()}
              </div>
              <button onClick={()=>{setCurrentDate(new Date());setSelectedDate(null);}} style={{fontSize:"12px",fontWeight:600,color:"var(--color-accent)",background:"transparent",border:"none",cursor:"pointer",marginTop:"2px"}}>Heute</button>
            </div>
            <button onClick={()=>navigate(1)} style={{width:"34px",height:"34px",borderRadius:"10px",border:"1px solid var(--color-border2)",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--color-muted)",background:"transparent",cursor:"pointer",position:"absolute",right:0,fontSize:"16px"}}>›</button>
          </div>

          {viewMode==="month" ? (
            <>
              {/* Weekday headers */}
              <div style={{display:"grid",gridTemplateColumns:`repeat(${cols},1fr)`,gap:"10px",marginBottom:"10px"}}>
                {weekdays.map((d)=>(
                  <div key={d} style={{textAlign:"center",fontSize:"11px",fontWeight:700,letterSpacing:"0.8px",color:"var(--color-faint)"}}>{d}</div>
                ))}
              </div>
              {/* Day cells */}
              <div style={{display:"grid",gridTemplateColumns:`repeat(${cols},1fr)`,gap:"10px"}}>
                {calendarDays.map((day)=>{
                  const hasTrades = day.trades.length > 0;
                  const isWin = hasTrades && day.totalR >= 0;
                  const isLoss = hasTrades && day.totalR < 0;
                  const isSelected = selectedDate===day.dateStr;

                  let bg = "var(--color-surface2)";
                  let border = "none";
                  let boxShadow = "none";
                  if (isWin) { bg = "rgba(61,220,151,0.1)"; border = "1px solid rgba(61,220,151,0.25)"; }
                  if (isLoss) { bg = "rgba(239,100,97,0.1)"; border = "1px solid rgba(239,100,97,0.25)"; }
                  if (day.isToday && !isSelected) { border = "2px solid var(--color-accent)"; boxShadow = "0 0 0 3px rgba(108,140,255,0.12)"; }
                  if (isSelected) { border = "2px solid var(--color-accent)"; boxShadow = "0 0 0 3px rgba(108,140,255,0.18)"; }

                  return (
                    <button
                      key={day.dateStr}
                      onClick={()=>setSelectedDate(isSelected ? null : day.dateStr)}
                      style={{
                        aspectRatio:"1.15",
                        borderRadius:"12px",
                        background: bg,
                        border,
                        boxShadow,
                        padding:"10px",
                        display:"flex",
                        flexDirection:"column",
                        justifyContent:"space-between",
                        cursor:"pointer",
                        opacity: day.isCurrentMonth ? 1 : 0.35,
                        transition:"background 120ms",
                      }}
                    >
                      <span style={{fontSize:"12px",fontWeight:isSelected||day.isToday?700:600,color:"var(--color-text)",textAlign:"left"}}>{day.date.getDate()}</span>
                      {hasTrades && (
                        <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:"12px",fontWeight:700,color:isWin?"var(--color-up)":"var(--color-down)",textAlign:"left"}}>
                          {day.totalR>=0?"+":""}{day.totalR.toFixed(1)}R
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Weekend toggle */}
              <div style={{marginTop:"20px",paddingTop:"16px",borderTop:"1px solid var(--color-border)",display:"flex",alignItems:"center",gap:"8px"}}>
                <label style={{display:"flex",alignItems:"center",gap:"8px",fontSize:"12.5px",fontWeight:600,color:"var(--color-muted)",cursor:"pointer"}}>
                  <span style={{width:"16px",height:"16px",borderRadius:"5px",background:showWeekends?"var(--color-accent)":"var(--color-surface2)",border:`1px solid ${showWeekends?"var(--color-accent)":"var(--color-border2)"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}} onClick={()=>setShowWeekends(!showWeekends)}>
                    {showWeekends&&<span style={{color:"#0a0b0e",fontSize:"10px",fontWeight:700}}>✓</span>}
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

        {/* Detail Panel */}
        {selectedDate && selectedDayData && (
          <div style={{background:"var(--color-surface)",border:"1px solid var(--color-border)",borderRadius:"18px",padding:"24px"}} className="anim-slide-up">
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"16px"}}>
              <div style={{fontSize:"14px",fontWeight:700}}>
                {new Date(selectedDate+"T12:00:00").toLocaleDateString("de-DE",{weekday:"long",day:"numeric",month:"long"})}
              </div>
              <button onClick={()=>setSelectedDate(null)} style={{color:"var(--color-faint)",background:"transparent",border:"none",cursor:"pointer",fontSize:"16px"}}>×</button>
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
              <div style={{display:"flex",flexDirection:"column",gap:"8px",maxHeight:"400px",overflowY:"auto"}}>
                {selectedDayData.trades.map((t)=>(
                  <div key={t.id} style={{display:"flex",alignItems:"center",gap:"10px",fontSize:"12px",fontFamily:"'JetBrains Mono',monospace",paddingBottom:"8px",borderBottom:"1px solid var(--color-border)"}}>
                    <Badge tone={t.type==="funded"?"accent":"neutral"}>{t.type==="funded"?"Funded":"EK"}</Badge>
                    <span style={{fontWeight:600}}>{t.pair}</span>
                    <span style={{color:t.direction==="long"?"var(--color-up)":"var(--color-down)"}}>{t.direction.toUpperCase()}</span>
                    <span style={{fontWeight:600,color:t.rMultiple>0?"var(--color-up)":t.rMultiple<0?"var(--color-down)":"var(--color-faint)",marginLeft:"auto"}}>
                      {t.rMultiple>0?"+":""}{t.rMultiple.toFixed(2)} R
                    </span>
                  </div>
                ))}
              </div>
            )}
            <Link href="/journal" style={{display:"block",marginTop:"14px",fontSize:"12px",color:"var(--color-accent)",textDecoration:"none"}}>Zum Journal →</Link>
          </div>
        )}
      </div>
    </div>
  );
}
