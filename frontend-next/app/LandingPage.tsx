"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────
type Dir = "LONG" | "SHORT" | "NEUTRAL";

// ── Data ──────────────────────────────────────────────────────────────────
const TICKS: [string, string, boolean][] = [
  ["GBP/JPY", "+2.14%", true], ["EUR/USD", "+0.41%", true], ["USD/CHF", "−0.28%", false],
  ["AUD/JPY", "+1.03%", true], ["USD/CAD", "−0.62%", false], ["NZD/USD", "+0.19%", true],
  ["EUR/GBP", "−0.34%", false], ["GBP/USD", "+0.77%", true], ["USD/JPY", "+0.55%", true],
  ["EUR/CHF", "−0.12%", false], ["CAD/JPY", "+0.88%", true], ["AUD/USD", "−0.21%", false],
];

const MODULES: [string, string, string][] = [
  ["ph-crosshair", "Pair Screener", "28 Paare · 5 Faktoren"],
  ["ph-chart-line-up", "COT-Analyse", "Institutionelle Positionierung"],
  ["ph-bank", "Makro & Zinsen", "FRED · Zinsdiff · Trends"],
  ["ph-compass", "Währungs-Kompass", "G8 · 4-Faktoren-Bias"],
  ["ph-users-three", "Retail-Sentiment", "Myfxbook · Contrarian"],
  ["ph-calendar-dots", "Saisonalität", "20 Jahre · Trefferquote"],
  ["ph-gauge", "Risk-Regime", "VIX · Gold · Intermarket"],
  ["ph-arrows-left-right", "Korrelationen", "Doppel-Risiko vermeiden"],
  ["ph-calendar-check", "Weekly Outlook", "Sonntags-Cockpit · Kalender"],
  ["ph-flask", "COT-Backtest", "Historischer Edge-Test · Pro"],
  ["ph-notebook", "Trading Journal", "R-Multiple · Equity-Kurve · Pro"],
  ["ph-strategy", "Strategie & Backtest-Lab", "Thesen testen & üben · Pro"],
];

const PROBLEMS = [
  "FRED, CFTC, Myfxbook, FF — fünf Tabs offen",
  "COT-Report jede Woche manuell durchlesen",
  "Zinsdifferenzen im Kopf berechnen",
  "Saisonalität in Excel nachbauen",
  "Trades in separater Excel-Datei verwalten",
  "Kein Backtest, ob ein Signal je funktioniert hat",
];

const SOLUTIONS = [
  "Alle sechs Quellen in einer App, täglich geladen",
  "COT-Perzentil, Flow und Backtest sofort sichtbar",
  "Zinsdifferenz-Charts für alle 28 Paare",
  "Saisonalitäts-Heatmap mit Trefferquote",
  "Integriertes Journal mit R-Multiple-Auswertung",
  "Historischer Edge-Test per Klick",
];

const BASIC_FEATURES = [
  "28 FX-Paare — Screener & Stärke",
  "COT-Analyse & Perzentile",
  "Makro-Fundamentals (FRED, Zinsen)",
  "Währungs-Kompass (4-Faktoren-Bias)",
  "Retail-Sentiment (Myfxbook)",
  "Saisonalität & Intermarket-Korrelationen",
  "Risk-Regime & Weekly Outlook",
  "Täglich automatisch aktualisiert",
];

const PRO_FEATURES = [
  "Alle fundamentalen Module aus Basic",
  "Integriertes Trading Journal (R-Multiple)",
  "COT-Backtest & historischer Edge-Test",
  "Strategie-Builder & Backtest-Lab",
  "Outlook-Wizard & Trade-Kalender",
  "Equity-Kurve & Performance-Auswertung",
];

const FAQS: [string, string][] = [
  ["Brauche ich Trading-Vorwissen?", "Die App richtet sich an aktive FX-Trader mit Grundkenntnissen in Fundamentalanalyse. Begriffe wie COT-Report, Leitzins und R-Multiple sollten bekannt sein. In der App gibt es zu jedem Bereich eine kurze Erklärung."],
  ["Wie aktuell sind die Daten?", "Preise, Zinsen und Sentiment werden täglich aktualisiert. Der COT-Report erscheint wöchentlich freitags. Makrodaten (CPI, Arbeitslosigkeit, BIP) kommen monatlich von FRED."],
  ["Kann ich jederzeit kündigen?", "Ja. Das Abo ist monatlich kündbar — keine Mindestlaufzeit, keine Kündigungsfrist."],
  ["Welche Währungspaare werden abgedeckt?", "Alle 28 Major- und Minor-Paare der G8-Währungen: USD, EUR, GBP, JPY, CHF, CAD, AUD und NZD. Zusätzlich Bitcoin für die BTC-Karte im Weekly Outlook."],
  ["Funktioniert das auch für Day-Trading?", "FX Terminal ist auf Swing-Trading ausgelegt (Haltedauer 1–10 Tage). Fundamentaldaten wirken auf mittelfristigen Zeithorizonten — für Intraday sind die Signale weniger relevant."],
  ["Was unterscheidet Basic und Pro?", "Basic liefert den fundamentalen Marktüberblick (Screener, COT, Makro, Kompass). Pro schaltet zusätzlich Backtests, Sentiment, Saisonalität, das Trading-Journal und den Weekly Outlook frei."],
];

// ── CSS Animations ────────────────────────────────────────────────────────
const LP_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=Geist+Mono:wght@400;500;600;700&display=swap');

  @keyframes lp-pulse    { 0%,100%{opacity:1;transform:scale(1)}  50%{opacity:.4;transform:scale(.8)} }
  @keyframes lp-ticker   { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
  @keyframes lp-glow     { 0%,100%{opacity:.8} 50%{opacity:1.2} }
  @keyframes lp-btnpulse { 0%,100%{box-shadow:0 0 0 0 rgba(88,166,255,0)} 50%{box-shadow:0 0 0 8px rgba(88,166,255,.15)} }

  .lp-reveal { opacity:0; transform:translateY(24px); transition:opacity .6s ease,transform .6s ease; }
  .lp-reveal.lp-in { opacity:1; transform:translateY(0); }

  .lp-card { transition:border-color .2s,transform .2s,box-shadow .2s; }
  .lp-card:hover { border-color:rgba(88,166,255,.4)!important; transform:translateY(-2px); box-shadow:0 8px 24px -8px rgba(88,166,255,.2); }

  .lp-nav-link { transition:color .15s; text-decoration:none; }
  .lp-nav-link:hover { color:#E7EDF5!important; }

  .lp-pulse-btn { animation:lp-btnpulse 3s ease-in-out infinite; }

  details summary { list-style:none; }
  details summary::-webkit-details-marker { display:none; }
`;

// ── Helpers ───────────────────────────────────────────────────────────────
function Chip({ dir }: { dir: Dir }) {
  const map: Record<Dir, { bg: string; c: string }> = {
    LONG:    { bg: "rgba(63,185,80,.15)",  c: "#3FB950" },
    SHORT:   { bg: "rgba(248,81,73,.15)",  c: "#F85149" },
    NEUTRAL: { bg: "rgba(216,164,48,.14)", c: "#D8A430" },
  };
  const s = map[dir];
  return (
    <span style={{ fontFamily:"'Geist Mono',monospace", fontSize:8.5, fontWeight:800, letterSpacing:"0.14em", padding:"2px 6px", borderRadius:5, background:s.bg, color:s.c, whiteSpace:"nowrap" as const, display:"inline-block" }}>
      {dir}
    </span>
  );
}

function useCountUp(target: number, suffix = "") {
  const ref = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState("0" + suffix);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const dur = 1200, start = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / dur);
        setValue(Math.round(target * (1 - Math.pow(1 - p, 3))) + suffix);
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, [target, suffix]);
  return { ref, value };
}

function useReveal() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      el.classList.add("lp-in");
      io.disconnect();
    }, { threshold: 0.06, rootMargin: "0px 0px -40px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref as React.RefObject<HTMLElement>;
}

// ── Component ─────────────────────────────────────────────────────────────
export default function LandingPage() {
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const yearly = billing === "yearly";

  const s1 = useCountUp(28);
  const s2 = useCountUp(6);
  const s3 = useCountUp(5);
  const s4 = useCountUp(20, "J");

  const rStats      = useReveal();
  const rModules    = useReveal();
  const rProblem    = useReveal();
  const rPricing    = useReveal();
  const rFaq        = useReveal();
  const rConviction = useReveal();

  const mono = "'Geist Mono',monospace";

  const strength: [string, number][] = [
    ["GBP",2.14],["USD",1.42],["EUR",0.71],["AUD",0.22],
    ["NZD",-0.31],["CAD",-1.08],["CHF",-1.83],["JPY",-2.61],
  ];

  const scrMini: [Dir,string,string,string][] = [
    ["LONG","GBP/JPY","Zinsdiff · COT-Flow · Saison","5/5"],
    ["LONG","EUR/CAD","COT-Flow · Stärke · Zinstrend","4/5"],
    ["LONG","USD/CHF","Zinsdiff · Sentiment","3/5"],
    ["SHORT","AUD/JPY","COT · Risk-Off","3/5"],
  ];

  const compass: [string, Dir][] = [
    ["GBP","LONG"],["USD","LONG"],["EUR","LONG"],["AUD","NEUTRAL"],
    ["NZD","NEUTRAL"],["CAD","SHORT"],["CHF","SHORT"],["JPY","SHORT"],
  ];

  const scrFull: [Dir,string,string,string][] = [
    ["LONG","GBP/JPY","Zinsdifferenz + COT-Flow + Saisonalität","5/5"],
    ["LONG","EUR/CAD","COT-Flow + Stärke + Zinstrend","4/5"],
    ["SHORT","AUD/CHF","COT + Risk-Regime","3/5"],
    ["SHORT","NZD/JPY","Zinstrend + Sentiment","3/5"],
  ];

  const riskCells: [string,string,string,string][] = [
    ["VIX","14.2","LOW","#3FB950"],
    ["Gold","−0.3%","Neutral","#D8A430"],
    ["JPY/CHF","−0.8%","Risk-On","#3FB950"],
    ["S&P 500","+0.9%","Bullish","#3FB950"],
  ];

  const seas: [string,number,boolean][] = [
    ["J",0.4,true],["F",-0.2,false],["M",0.6,true],["A",0.3,true],
    ["M",-0.4,false],["J",-0.6,false],["J",0.8,true],["A",0.2,true],
    ["S",-0.5,false],["O",0.1,false],["N",0.5,true],["D",-0.3,false],
  ];

  return (
    <div style={{ minHeight:"100vh", background:"#0A0D12", color:"#F4F8FC", fontFamily:"Geist,-apple-system,sans-serif", overflowX:"hidden" }}>
      <style dangerouslySetInnerHTML={{ __html: LP_CSS }} />

      {/* ── NAVBAR ── */}
      <nav style={{ position:"sticky", top:0, zIndex:50, borderBottom:"1px solid #1A222D", background:"rgba(10,13,18,.85)", backdropFilter:"blur(14px)", WebkitBackdropFilter:"blur(14px)" }}>
        <div style={{ maxWidth:1180, margin:"0 auto", padding:"0 28px", height:62, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ display:"flex", alignItems:"center", gap:11 }}>
            <div style={{ width:30, height:30, borderRadius:8, background:"linear-gradient(150deg,rgba(88,166,255,.22),rgba(88,166,255,.06))", border:"1px solid rgba(88,166,255,.34)", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <i className="ph-bold ph-pulse" style={{ color:"#58A6FF", fontSize:17 }} />
            </div>
            <div>
              <div style={{ fontSize:15, fontWeight:700, letterSpacing:"-0.01em", color:"#E7EDF5", lineHeight:1.2 }}>FX Terminal</div>
              <div style={{ fontFamily:mono, fontSize:8.5, letterSpacing:"0.24em", color:"#566273", textTransform:"uppercase" as const }}>Swing Suite</div>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:30 }}>
            <div style={{ display:"flex", gap:28 }}>
              {[["#module","Module"],["#features","Features"],["#preise","Preise"],["#faq","FAQ"]].map(([href,label]) => (
                <a key={href} href={href} className="lp-nav-link" style={{ fontSize:13.5, color:"#96A2B3", fontWeight:500 }}>{label}</a>
              ))}
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <Link href="/login" style={{ padding:"8px 15px", borderRadius:9, background:"transparent", border:"1px solid #2A3542", color:"#C7D1DD", fontSize:13, fontWeight:600, textDecoration:"none" }}>Anmelden</Link>
              <Link href="/upgrade?autostart=1" style={{ padding:"8px 16px", borderRadius:9, background:"#58A6FF", color:"#08111E", fontSize:13, fontWeight:700, textDecoration:"none" }}>Zugang sichern</Link>
            </div>
          </div>
        </div>
      </nav>

      {/* ── TICKER ── */}
      <div style={{ borderBottom:"1px solid #161D27", background:"#0B0F15", overflow:"hidden", height:34, display:"flex", alignItems:"center" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"0 16px", borderRight:"1px solid #1A222D", height:"100%", flexShrink:0 }}>
          <span style={{ width:6, height:6, borderRadius:"50%", background:"#3FB950", animation:"lp-pulse 2s ease-in-out infinite", display:"block" }} />
          <span style={{ fontFamily:mono, fontSize:9.5, letterSpacing:"0.18em", color:"#7E8B9C", textTransform:"uppercase" as const }}>Live Feed</span>
        </div>
        <div style={{ overflow:"hidden", flex:1 }}>
          <div style={{ display:"flex", width:"max-content", animation:"lp-ticker 38s linear infinite", willChange:"transform" }}>
            {[0,1].map((k) => (
              <div key={k} style={{ display:"flex", flexShrink:0 }}>
                {TICKS.map(([pair,chg,up],i) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:7, padding:"0 16px", borderRight:"1px solid #131A22", fontFamily:mono, fontSize:11 }}>
                    <span style={{ color:"#8B98A8", fontWeight:500 }}>{pair}</span>
                    <span style={{ color:up?"#3FB950":"#F85149" }}>{chg}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── HERO ── */}
      <section style={{ position:"relative" }}>
        <div style={{ position:"absolute", inset:0, pointerEvents:"none", overflow:"hidden" }}>
          <div style={{ position:"absolute", top:-140, left:"50%", transform:"translateX(-50%)", width:900, height:520, background:"radial-gradient(ellipse at center,rgba(88,166,255,.13),transparent 68%)", filter:"blur(30px)", animation:"lp-glow 7s ease-in-out infinite" }} />
        </div>
        <div style={{ maxWidth:1180, margin:"0 auto", padding:"80px 28px 44px", position:"relative" }}>
          <div style={{ maxWidth:720, margin:"0 auto", textAlign:"center" }}>
            <div style={{ display:"inline-flex", alignItems:"center", gap:9, padding:"6px 13px", borderRadius:100, border:"1px solid #23303F", background:"rgba(20,26,35,.6)", marginBottom:26 }}>
              <span style={{ width:5, height:5, borderRadius:"50%", background:"#58A6FF", display:"inline-block" }} />
              <span style={{ fontFamily:mono, fontSize:10.5, letterSpacing:"0.2em", color:"#8FA0B3", textTransform:"uppercase" as const }}>Fundamentale FX-Analyse · G8 · 28 Paare</span>
            </div>
            <h1 style={{ fontSize:60, lineHeight:1.04, fontWeight:800, letterSpacing:"-0.03em", color:"#F4F8FC", margin:"0 0 22px" }}>
              Das ganze fundamentale<br />Bild in <span style={{ color:"#58A6FF" }}>einem Terminal</span>.
            </h1>
            <p style={{ fontSize:19, lineHeight:1.62, color:"#9BA8B8", margin:"0 auto 34px", maxWidth:600 }}>
              COT-Positionierung, Zinsdifferenzen, Makro-Daten, Retail-Sentiment und Saisonalität — automatisch aggregiert aus sechs Quellen, täglich aktualisiert. Für Swing-Trader, die wissen wollen, was das große Geld wirklich tut.
            </p>
            <div style={{ display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap", marginBottom:20 }}>
              <Link href="/upgrade?autostart=1" className="lp-pulse-btn" style={{ padding:"14px 26px", borderRadius:11, background:"#58A6FF", color:"#08111E", fontSize:14.5, fontWeight:700, textDecoration:"none", display:"inline-flex", alignItems:"center", gap:9 }}>
                Terminal freischalten <i className="ph-bold ph-arrow-right" style={{ fontSize:15 }} />
              </Link>
              <Link href="/login" style={{ padding:"14px 24px", borderRadius:11, background:"transparent", border:"1px solid #2A3542", color:"#C7D1DD", fontSize:14.5, fontWeight:600, textDecoration:"none" }}>Anmelden</Link>
            </div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:22, flexWrap:"wrap", fontFamily:mono, fontSize:11, color:"#566273" }}>
              {[["ph-check-circle","Monatlich kündbar"],["ph-check-circle","Keine Mindestlaufzeit"],["ph-lock-simple","Zahlung via Stripe"]].map(([icon,text]) => (
                <span key={text} style={{ display:"inline-flex", alignItems:"center", gap:6 }}>
                  <i className={`ph-bold ${icon}`} style={{ color:"#3FB950", fontSize:13 }} /> {text}
                </span>
              ))}
            </div>
          </div>

          {/* Product Mockup */}
          <div style={{ marginTop:56, position:"relative" }}>
            <div style={{ position:"absolute", inset:-1, borderRadius:15, background:"linear-gradient(180deg,rgba(88,166,255,.14),transparent 40%)", pointerEvents:"none" }} />
            <div style={{ borderRadius:14, border:"1px solid #232D39", background:"#0C1017", overflow:"hidden", boxShadow:"0 40px 90px -30px rgba(0,0,0,.8),0 0 0 1px rgba(255,255,255,.02)" }}>
              {/* Chrome */}
              <div style={{ display:"flex", alignItems:"center", gap:8, padding:"11px 15px", borderBottom:"1px solid #1A222D", background:"#0A0D12" }}>
                {["#F85149","#D8A430","#3FB950"].map((c) => <span key={c} style={{ width:11, height:11, borderRadius:"50%", background:c, opacity:.85, display:"block" }} />)}
                <div style={{ marginLeft:12, display:"flex", alignItems:"center", gap:7, fontFamily:mono, fontSize:11, color:"#566273" }}>
                  <i className="ph-bold ph-lock-simple" style={{ fontSize:11 }} /> app.fx-terminal.io/dashboard
                </div>
              </div>
              <div style={{ display:"flex", minHeight:428 }}>
                {/* Sidebar */}
                <div style={{ width:184, flexShrink:0, borderRight:"1px solid #161D27", background:"#0E131A", display:"flex", flexDirection:"column" }}>
                  <div style={{ padding:"13px 15px", borderBottom:"1px solid #161D27", display:"flex", alignItems:"center", gap:8 }}>
                    <i className="ph-bold ph-pulse" style={{ color:"#58A6FF", fontSize:17 }} />
                    <div>
                      <div style={{ fontSize:12, fontWeight:600, color:"#E7EDF5", lineHeight:1.2 }}>FX Terminal</div>
                      <div style={{ fontFamily:mono, fontSize:7, letterSpacing:"0.18em", color:"#566273", textTransform:"uppercase" as const }}>Swing-Trading Suite</div>
                    </div>
                  </div>
                  <div style={{ flex:1, padding:"10px 0", fontSize:11 }}>
                    <div style={{ padding:"5px 15px", fontFamily:mono, fontSize:8, letterSpacing:"0.2em", color:"#3F4A58", textTransform:"uppercase" as const }}>Terminal</div>
                    {([["ph-gauge","Dashboard",true],["ph-compass","Weekly Outlook",false],["ph-chart-line-up","COT-Analyse",false],["ph-bank","Makro & Zinsen",false],["ph-users-three","Retail Sentiment",false],["ph-arrows-left-right","Intermarket",false],["ph-calendar-dots","Saisonalität",false]] as [string,string,boolean][]).map(([icon,label,active]) => (
                      <div key={label} style={{ display:"flex", alignItems:"center", gap:9, padding:"6px 13px", color:active?"#58A6FF":"#7E8B9C", background:active?"#131A24":"transparent", borderRight:active?"2px solid #58A6FF":"none", fontWeight:active?500:400 }}>
                        <i className={`ph-bold ${icon}`} style={{ fontSize:14 }} /> {label}
                      </div>
                    ))}
                  </div>
                  <div style={{ borderTop:"1px solid #161D27", padding:"9px 13px", display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ width:22, height:22, borderRadius:"50%", background:"rgba(88,166,255,.2)", border:"1px solid rgba(88,166,255,.3)", display:"flex", alignItems:"center", justifyContent:"center", color:"#58A6FF", fontSize:9, fontWeight:700 }}>K</div>
                    <div>
                      <div style={{ fontSize:10, color:"#E7EDF5", lineHeight:1.3 }}>Kerim</div>
                      <div style={{ fontSize:8, color:"#3FB950" }}>● Aktiv</div>
                    </div>
                  </div>
                </div>
                {/* Main */}
                <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0 }}>
                  <div style={{ padding:"11px 16px", borderBottom:"1px solid #161D27", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600, color:"#E7EDF5" }}>Dashboard — Pair-Übersicht</div>
                      <div style={{ fontFamily:mono, fontSize:8.5, color:"#566273", marginTop:2 }}>Aktualisiert vor 4 Min · CFTC · FRED · OANDA</div>
                    </div>
                    <span style={{ fontFamily:mono, fontSize:9, padding:"3px 8px", borderRadius:6, background:"rgba(63,185,80,.12)", color:"#3FB950", border:"1px solid rgba(63,185,80,.28)" }}>RISK-ON 67</span>
                  </div>
                  <div style={{ padding:13, display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                    {/* Strength */}
                    <div style={{ background:"#0E131A", border:"1px solid #1A222D", borderRadius:9, padding:12 }}>
                      <div style={{ fontFamily:mono, fontSize:8.5, letterSpacing:"0.16em", color:"#566273", textTransform:"uppercase" as const, marginBottom:10 }}>Currency Strength · 1M</div>
                      <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                        {strength.map(([cur,val]) => {
                          const pos = val >= 0;
                          const w = (Math.abs(val) / 2.61) * 50;
                          return (
                            <div key={cur} style={{ display:"flex", alignItems:"center", gap:7 }}>
                              <span style={{ fontFamily:mono, fontSize:10, fontWeight:700, color:"#C7D1DD", width:26 }}>{cur}</span>
                              <div style={{ flex:1, height:11, background:"#141A22", borderRadius:3, position:"relative", overflow:"hidden" }}>
                                <div style={{ position:"absolute", top:0, left:"50%", width:1, height:"100%", background:"rgba(86,98,115,.5)" }} />
                                <div style={{ position:"absolute", top:0, height:"100%", borderRadius:2, width:`${w}%`, ...(pos?{left:"50%",background:"rgba(63,185,80,.6)"}:{right:"50%",background:"rgba(248,81,73,.6)"}) }} />
                              </div>
                              <span style={{ fontFamily:mono, fontSize:9.5, fontWeight:700, width:44, textAlign:"right" as const, color:pos?"#3FB950":"#F85149" }}>{val>0?"+":""}{val.toFixed(2)}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {/* Screener mini */}
                    <div style={{ background:"#0E131A", border:"1px solid #1A222D", borderRadius:9, padding:12 }}>
                      <div style={{ fontFamily:mono, fontSize:8.5, letterSpacing:"0.16em", color:"#566273", textTransform:"uppercase" as const, marginBottom:10 }}>Pair Screener · Konfluenz</div>
                      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                        {scrMini.map(([dir,pair,reasons,score]) => (
                          <div key={pair} style={{ display:"flex", alignItems:"flex-start", gap:8 }}>
                            <Chip dir={dir} />
                            <div style={{ minWidth:0 }}>
                              <div style={{ fontSize:11.5, fontWeight:700, color:"#E7EDF5", fontFamily:mono }}>{pair}</div>
                              <div style={{ fontSize:9, color:"#566273", marginTop:2 }}>{reasons}</div>
                            </div>
                            <span style={{ marginLeft:"auto", fontFamily:mono, fontSize:10, color:"#58A6FF", flexShrink:0 }}>{score}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* Compass */}
                    <div style={{ gridColumn:"1/-1", background:"#0E131A", border:"1px solid #1A222D", borderRadius:9, padding:12 }}>
                      <div style={{ fontFamily:mono, fontSize:8.5, letterSpacing:"0.16em", color:"#566273", textTransform:"uppercase" as const, marginBottom:10 }}>Währungs-Kompass · 4-Faktoren-Bias</div>
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(8,1fr)", gap:6 }}>
                        {compass.map(([cur,dir]) => (
                          <div key={cur} style={{ background:"#0A0D12", border:"1px solid #161D27", borderRadius:6, padding:"7px 4px", textAlign:"center" as const }}>
                            <div style={{ fontFamily:mono, fontSize:10, fontWeight:700, color:"#C7D1DD", marginBottom:4 }}>{cur}</div>
                            <Chip dir={dir} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── DATA SOURCES ── */}
      <div style={{ borderTop:"1px solid #161D27", borderBottom:"1px solid #161D27", background:"#0B0F15" }}>
        <div style={{ maxWidth:1180, margin:"0 auto", padding:"22px 28px", display:"flex", alignItems:"center", justifyContent:"center", gap:26, flexWrap:"wrap" }}>
          <span style={{ fontFamily:mono, fontSize:10, letterSpacing:"0.2em", color:"#4A5666", textTransform:"uppercase" as const }}>Datenquellen</span>
          {["OANDA","CFTC","FRED · US Fed","ForexFactory","Myfxbook"].map((src,i) => (
            <span key={src} style={{ display:"contents" }}>
              {i>0 && <span style={{ color:"#2A3542" }}>·</span>}
              <span style={{ fontSize:14, fontWeight:600, color:"#8B98A8" }}>{src}</span>
            </span>
          ))}
          <span style={{ color:"#2A3542" }}>·</span>
          <span style={{ fontSize:12.5, color:"#566273" }}>Täglich automatisch aktualisiert</span>
        </div>
      </div>

      {/* ── STATS ── */}
      <section ref={rStats} className="lp-reveal" style={{ maxWidth:1180, margin:"0 auto", padding:"56px 28px 8px" }}>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:1, background:"#161D27", border:"1px solid #161D27", borderRadius:14, overflow:"hidden" }}>
          {[{d:s1,l:"Währungspaare live analysiert"},{d:s2,l:"Datenquellen automatisch aggregiert"},{d:s3,l:"Faktoren pro Konfluenz-Signal"},{d:s4,l:"Historie für Saisonalität & Backtests"}].map(({d,l}) => (
            <div key={l} style={{ background:"#0C1017", padding:"26px 22px" }}>
              <div ref={d.ref} style={{ fontFamily:mono, fontSize:34, fontWeight:600, color:"#F4F8FC", letterSpacing:"-0.02em" }}>{d.value}</div>
              <div style={{ fontSize:12.5, color:"#8B98A8", marginTop:5 }}>{l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── MODULE GRID ── */}
      <section id="module" ref={rModules} className="lp-reveal" style={{ maxWidth:1180, margin:"0 auto", padding:"70px 28px 10px" }}>
        <div style={{ textAlign:"center", marginBottom:40 }}>
          <span style={{ fontFamily:mono, fontSize:11, letterSpacing:"0.22em", color:"#58A6FF", textTransform:"uppercase" as const }}>Was du bekommst</span>
          <h2 style={{ fontSize:38, fontWeight:800, letterSpacing:"-0.025em", color:"#F4F8FC", margin:"14px 0 12px" }}>Ein Login. Das gesamte Terminal.</h2>
          <p style={{ fontSize:16, color:"#9BA8B8", maxWidth:560, margin:"0 auto", lineHeight:1.6 }}>Vollständige fundamentale Analyse plus ein integriertes Trading-Journal — sechs Datenquellen, achtundzwanzig Paare, alles an einem Ort.</p>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
          {MODULES.map(([icon,name,desc]) => (
            <div key={name} className="lp-card" style={{ background:"#0E131A", border:"1px solid #1A222D", borderRadius:12, padding:18 }}>
              <div style={{ width:34, height:34, borderRadius:9, background:"rgba(88,166,255,.1)", border:"1px solid rgba(88,166,255,.2)", display:"flex", alignItems:"center", justifyContent:"center", marginBottom:13 }}>
                <i className={`ph-bold ${icon}`} style={{ color:"#58A6FF", fontSize:17 }} />
              </div>
              <div style={{ fontSize:14, fontWeight:600, color:"#F4F8FC", marginBottom:5 }}>{name}</div>
              <div style={{ fontSize:11.5, color:"#566273" }}>{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── PROBLEM / SOLUTION ── */}
      <section ref={rProblem} className="lp-reveal" style={{ maxWidth:1180, margin:"0 auto", padding:"80px 28px" }}>
        <div style={{ textAlign:"center", marginBottom:44 }}>
          <h2 style={{ fontSize:34, fontWeight:800, letterSpacing:"-0.025em", color:"#F4F8FC", margin:"0 0 12px" }}>Stundenlange Recherche auf Knopfdruck</h2>
          <p style={{ fontSize:16, color:"#9BA8B8", maxWidth:560, margin:"0 auto", lineHeight:1.6 }}>Fundamentale FX-Analyse heißt normalerweise: fünf Tabs offen, Daten manuell zusammensuchen, COT-Report selbst auswerten. FX Terminal übernimmt das.</p>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, maxWidth:820, margin:"0 auto" }}>
          <div style={{ background:"rgba(43,21,23,.35)", border:"1px solid rgba(248,81,73,.22)", borderRadius:14, padding:26 }}>
            <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:18 }}>
              <i className="ph-bold ph-x-circle" style={{ color:"#F85149", fontSize:18 }} />
              <span style={{ color:"#F85149", fontWeight:700, fontSize:14 }}>Ohne FX Terminal</span>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:11 }}>
              {PROBLEMS.map((p) => (
                <div key={p} style={{ display:"flex", gap:10, alignItems:"flex-start", fontSize:13.5, color:"#9BA8B8", lineHeight:1.45 }}>
                  <i className="ph-bold ph-x" style={{ color:"#F85149", fontSize:14, marginTop:2, flexShrink:0 }} /> <span>{p}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background:"rgba(16,38,26,.4)", border:"1px solid rgba(63,185,80,.24)", borderRadius:14, padding:26 }}>
            <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:18 }}>
              <i className="ph-bold ph-check-circle" style={{ color:"#3FB950", fontSize:18 }} />
              <span style={{ color:"#3FB950", fontWeight:700, fontSize:14 }}>Mit FX Terminal</span>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:11 }}>
              {SOLUTIONS.map((s) => (
                <div key={s} style={{ display:"flex", gap:10, alignItems:"flex-start", fontSize:13.5, color:"#9BA8B8", lineHeight:1.45 }}>
                  <i className="ph-bold ph-check" style={{ color:"#3FB950", fontSize:14, marginTop:2, flexShrink:0 }} /> <span>{s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURE DEEP DIVES ── */}
      <section id="features" style={{ borderTop:"1px solid #161D27", background:"#0B0F15" }}>
        <div style={{ maxWidth:1180, margin:"0 auto", padding:"80px 28px", display:"flex", flexDirection:"column", gap:76 }}>
          <div style={{ textAlign:"center" }}>
            <span style={{ fontFamily:mono, fontSize:11, letterSpacing:"0.22em", color:"#58A6FF", textTransform:"uppercase" as const }}>Features im Detail</span>
            <h2 style={{ fontSize:34, fontWeight:800, letterSpacing:"-0.025em", color:"#F4F8FC", margin:"14px 0 0" }}>Echte Panels. Echte Daten. Kein Marketing-Rendering.</h2>
          </div>

          {/* Pair Screener */}
          <div style={{ display:"grid", gridTemplateColumns:"0.9fr 1.1fr", gap:52, alignItems:"center" }}>
            <div>
              <span style={{ fontFamily:mono, fontSize:10.5, letterSpacing:"0.2em", color:"#58A6FF", textTransform:"uppercase" as const }}>Pair Screener</span>
              <h3 style={{ fontSize:27, fontWeight:700, letterSpacing:"-0.02em", color:"#F4F8FC", margin:"12px 0 14px" }}>Nur Paare mit echter Konfluenz</h3>
              <p style={{ fontSize:15.5, lineHeight:1.66, color:"#9BA8B8", margin:"0 0 18px" }}>28 Paare werden automatisch nach fünf unabhängigen Faktoren bewertet — Zinsdifferenz, COT-Flow, Saisonalität, Zinstrend und Retail-Sentiment. Angezeigt werden nur Paare mit mindestens zwei gleichgerichteten Signalen. Jede Zeile lässt sich für die vollständige Begründung aufklappen.</p>
              <div style={{ display:"flex", flexDirection:"column", gap:11 }}>
                {["Faktor-für-Faktor-Begründung je Paar","Konfluenz-Zähler: X von 5 Faktoren ausgerichtet"].map((t) => (
                  <div key={t} style={{ display:"flex", gap:11, alignItems:"flex-start", fontSize:14, color:"#9BA8B8" }}>
                    <i className="ph-bold ph-arrow-right" style={{ color:"#58A6FF", fontSize:14, marginTop:3 }} /> <span>{t}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background:"#0C1017", border:"1px solid #1A222D", borderRadius:12, padding:16 }}>
              <div style={{ fontFamily:mono, fontSize:9, letterSpacing:"0.16em", color:"#566273", textTransform:"uppercase" as const, marginBottom:12 }}>Pair Screener — Signale</div>
              <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
                {scrFull.map(([dir,pair,reason,score]) => (
                  <div key={pair} style={{ display:"flex", alignItems:"center", gap:11, background:"#0A0D12", border:"1px solid #161D27", borderRadius:8, padding:"11px 13px" }}>
                    <Chip dir={dir} />
                    <span style={{ fontFamily:mono, fontWeight:700, fontSize:13, color:"#E7EDF5", width:68, flexShrink:0 }}>{pair}</span>
                    <span style={{ flex:1, fontSize:11.5, color:"#7E8B9C" }}>{reason}</span>
                    <span style={{ fontFamily:mono, fontSize:10, color:"#566273", flexShrink:0 }}>{score}</span>
                    <i className="ph-bold ph-caret-down" style={{ color:"#3F4A58", fontSize:11 }} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* COT Backtest */}
          <div style={{ display:"grid", gridTemplateColumns:"1.1fr 0.9fr", gap:52, alignItems:"center" }}>
            <div style={{ background:"#0C1017", border:"1px solid #1A222D", borderRadius:12, padding:16 }}>
              <div style={{ fontFamily:mono, fontSize:9, letterSpacing:"0.16em", color:"#566273", textTransform:"uppercase" as const, marginBottom:12 }}>COT Backtest — EUR · Perzentil ≥ 85</div>
              <div style={{ fontFamily:mono, fontSize:11 }}>
                <div style={{ display:"flex", gap:12, color:"#566273", borderBottom:"1px solid #161D27", paddingBottom:8, marginBottom:4 }}>
                  <span style={{ width:72 }}>Horizont</span><span style={{ width:68 }}>Signal-Ø</span><span style={{ width:64 }}>Basis-Ø</span><span>Edge</span>
                </div>
                {[["4 Wochen","+0.82%","+0.47%","+0.35%"],["8 Wochen","+1.44%","+0.91%","+0.53%"],["12 Wochen","+1.89%","+1.31%","+0.58%"]].map(([h,s,b,e]) => (
                  <div key={h} style={{ display:"flex", gap:12, padding:"7px 0" }}>
                    <span style={{ color:"#9BA8B8", width:72 }}>{h}</span>
                    <span style={{ color:"#E7EDF5", width:68 }}>{s}</span>
                    <span style={{ color:"#566273", width:64 }}>{b}</span>
                    <span style={{ color:"#3FB950" }}>{e} ✓</span>
                  </div>
                ))}
                <div style={{ paddingTop:10, marginTop:4, borderTop:"1px solid #161D27", fontSize:10, color:"#566273" }}>
                  n = 23 Fälle · Urteil: <span style={{ color:"#3FB950" }}>belastbar</span>
                </div>
              </div>
            </div>
            <div>
              <span style={{ fontFamily:mono, fontSize:10.5, letterSpacing:"0.2em", color:"#58A6FF", textTransform:"uppercase" as const }}>COT-Analyse & Backtest</span>
              <h3 style={{ fontSize:27, fontWeight:700, letterSpacing:"-0.02em", color:"#F4F8FC", margin:"12px 0 14px" }}>Hat dieses Signal historisch funktioniert?</h3>
              <p style={{ fontSize:15.5, lineHeight:1.66, color:"#9BA8B8" }}>Der wöchentliche CFTC-Report aufbereitet: Netto-Position, 5-Jahres-Perzentil und 4-Wochen-Flow. Und bevor du einem Signal vertraust, vergleicht das Backtest-Panel die Forward-Returns nach einem Extrem-Signal mit der Basisrate — inklusive automatischer Warnung bei unter acht historischen Fällen.</p>
            </div>
          </div>

          {/* Risk + Seasonality */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:22 }}>
            <div style={{ background:"#0C1017", border:"1px solid #1A222D", borderRadius:12, padding:22 }}>
              <span style={{ fontFamily:mono, fontSize:10.5, letterSpacing:"0.2em", color:"#58A6FF", textTransform:"uppercase" as const }}>Risk-Regime</span>
              <h3 style={{ fontSize:20, fontWeight:700, letterSpacing:"-0.015em", color:"#F4F8FC", margin:"10px 0 8px" }}>Risk-On oder Risk-Off?</h3>
              <p style={{ fontSize:14, lineHeight:1.6, color:"#9BA8B8", margin:"0 0 18px" }}>VIX, Gold, JPY/CHF-Stärke und S&P-Trend werden zu einem Regime-Score verdichtet.</p>
              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
                <span style={{ fontFamily:mono, fontSize:10, color:"#F85149" }}>OFF</span>
                <div style={{ flex:1, height:8, borderRadius:100, background:"linear-gradient(90deg,#F85149,#D8A430,#3FB950)", position:"relative" }}>
                  <div style={{ position:"absolute", top:"50%", left:"67%", transform:"translate(-50%,-50%)", width:14, height:14, borderRadius:"50%", background:"#0C1017", border:"2px solid #E7EDF5" }} />
                </div>
                <span style={{ fontFamily:mono, fontSize:10, color:"#3FB950" }}>ON</span>
              </div>
              <div style={{ display:"flex", alignItems:"baseline", justifyContent:"center", gap:6, marginBottom:16 }}>
                <span style={{ fontFamily:mono, fontSize:30, fontWeight:600, color:"#58A6FF" }}>67</span>
                <span style={{ fontSize:12, color:"#566273" }}>/100 · Risk-On</span>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                {riskCells.map(([label,val,status,col]) => (
                  <div key={label} style={{ background:"#0A0D12", border:"1px solid #161D27", borderRadius:7, padding:"9px 10px" }}>
                    <div style={{ fontFamily:mono, fontSize:9.5, color:"#566273" }}>{label}</div>
                    <div style={{ fontFamily:mono, fontSize:13, fontWeight:600, color:"#E7EDF5", margin:"2px 0" }}>{val}</div>
                    <div style={{ fontFamily:mono, fontSize:9.5, color:col }}>{status}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background:"#0C1017", border:"1px solid #1A222D", borderRadius:12, padding:22 }}>
              <span style={{ fontFamily:mono, fontSize:10.5, letterSpacing:"0.2em", color:"#58A6FF", textTransform:"uppercase" as const }}>Saisonalität</span>
              <h3 style={{ fontSize:20, fontWeight:700, letterSpacing:"-0.015em", color:"#F4F8FC", margin:"10px 0 8px" }}>Statistischer Rückenwind je Monat</h3>
              <p style={{ fontSize:14, lineHeight:1.6, color:"#9BA8B8", margin:"0 0 20px" }}>Durchschnittsreturn und Trefferquote je Kalendermonat — über die gesamte verfügbare Historie.</p>
              <div style={{ fontFamily:mono, fontSize:8.5, letterSpacing:"0.14em", color:"#566273", textTransform:"uppercase" as const, marginBottom:10 }}>EUR/USD · 2010–2025</div>
              <div style={{ display:"flex", gap:5, alignItems:"flex-end", height:96 }}>
                {seas.map(([m,v,prom],i) => (
                  <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:5, height:"100%" }}>
                    <div style={{ flex:1, width:"100%", display:"flex", alignItems:"flex-end" }}>
                      <div style={{ width:"100%", borderRadius:"3px 3px 0 0", height:`${Math.abs(v)*55}%`, background:(v as number)>0?"#3FB950":"#F85149", opacity:(prom as boolean)?0.9:0.4 }} />
                    </div>
                    <span style={{ fontFamily:mono, fontSize:8.5, color:"#566273" }}>{m}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="preise" ref={rPricing} className="lp-reveal" style={{ maxWidth:1180, margin:"0 auto", padding:"84px 28px" }}>
        <div style={{ textAlign:"center", marginBottom:14 }}>
          <span style={{ fontFamily:mono, fontSize:11, letterSpacing:"0.22em", color:"#58A6FF", textTransform:"uppercase" as const }}>Preise</span>
          <h2 style={{ fontSize:38, fontWeight:800, letterSpacing:"-0.025em", color:"#F4F8FC", margin:"14px 0 12px" }}>Einfach. Transparent.</h2>
          <p style={{ fontSize:16, color:"#9BA8B8", margin:"0 0 26px" }}>Monatlich kündbar, keine Mindestlaufzeit. Jahresabo spart zwei Monate.</p>
        </div>
        <div style={{ display:"flex", justifyContent:"center", marginBottom:34 }}>
          <div style={{ display:"inline-flex", padding:4, borderRadius:11, border:"1px solid #212A36", background:"#0E131A", gap:3 }}>
            <button onClick={() => setBilling("monthly")} style={{ padding:"8px 18px", borderRadius:8, border:"none", fontFamily:"inherit", fontSize:13, fontWeight:600, cursor:"pointer", background:!yearly?"#58A6FF":"transparent", color:!yearly?"#08111E":"#9BA8B8" }}>Monatlich</button>
            <button onClick={() => setBilling("yearly")} style={{ padding:"8px 18px", borderRadius:8, border:"none", fontFamily:"inherit", fontSize:13, fontWeight:600, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:7, background:yearly?"#58A6FF":"transparent", color:yearly?"#08111E":"#9BA8B8" }}>
              Jährlich <span style={{ fontFamily:mono, fontSize:9, padding:"1px 6px", borderRadius:5, background:"rgba(63,185,80,.16)", color:"#3FB950" }}>−17%</span>
            </button>
          </div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:18, maxWidth:760, margin:"0 auto" }}>
          {/* Basic */}
          <div style={{ background:"#0E131A", border:"1px solid #212A36", borderRadius:16, overflow:"hidden", display:"flex", flexDirection:"column" }}>
            <div style={{ padding:"26px 26px 22px", borderBottom:"1px solid #1A222D" }}>
              <div style={{ fontSize:13, fontWeight:700, letterSpacing:"0.02em", color:"#C7D1DD", textTransform:"uppercase" as const, marginBottom:14 }}>Basic</div>
              <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
                <span style={{ fontSize:36, fontWeight:800, color:"#F4F8FC", letterSpacing:"-0.02em" }}>CHF {yearly?"249":"24.95"}</span>
                <span style={{ fontSize:14, color:"#8B98A8" }}>/ {yearly?"Jahr":"Monat"}</span>
              </div>
              <p style={{ fontSize:12.5, color:"#566273", margin:"8px 0 0" }}>Für den fundamentalen Marktüberblick.</p>
            </div>
            <div style={{ padding:"24px 26px", flex:1, display:"flex", flexDirection:"column", gap:11 }}>
              {BASIC_FEATURES.map((f) => (
                <div key={f} style={{ display:"flex", gap:10, alignItems:"flex-start", fontSize:13.5 }}>
                  <i className="ph-bold ph-check" style={{ color:"#3FB950", fontSize:14, marginTop:2, flexShrink:0 }} />
                  <span style={{ color:"#C7D1DD" }}>{f}</span>
                </div>
              ))}
            </div>
            <div style={{ padding:"0 26px 26px" }}>
              <Link href="/upgrade?autostart=1" style={{ display:"block", padding:13, borderRadius:11, background:"transparent", border:"1px solid #2E3844", color:"#E7EDF5", fontSize:14, fontWeight:600, textAlign:"center" as const, textDecoration:"none" }}>Basic wählen</Link>
            </div>
          </div>
          {/* Pro */}
          <div style={{ background:"linear-gradient(180deg,rgba(88,166,255,.07),#0E131A 42%)", border:"1px solid rgba(88,166,255,.4)", borderRadius:16, overflow:"hidden", display:"flex", flexDirection:"column", position:"relative", boxShadow:"0 24px 60px -30px rgba(88,166,255,.35)" }}>
            <div style={{ position:"absolute", top:16, right:16, fontFamily:mono, fontSize:9, letterSpacing:"0.14em", padding:"3px 9px", borderRadius:6, background:"#58A6FF", color:"#08111E", fontWeight:700, textTransform:"uppercase" as const }}>Beliebt</div>
            <div style={{ padding:"26px 26px 22px", borderBottom:"1px solid rgba(88,166,255,.16)" }}>
              <div style={{ fontSize:13, fontWeight:700, letterSpacing:"0.02em", color:"#58A6FF", textTransform:"uppercase" as const, marginBottom:14 }}>Pro</div>
              <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
                <span style={{ fontSize:36, fontWeight:800, color:"#F4F8FC", letterSpacing:"-0.02em" }}>CHF {yearly?"349":"34.95"}</span>
                <span style={{ fontSize:14, color:"#8B98A8" }}>/ {yearly?"Jahr":"Monat"}</span>
              </div>
              <p style={{ fontSize:12.5, color:"#7E8B9C", margin:"8px 0 0" }}>Das komplette Terminal für aktive Swing-Trader.</p>
            </div>
            <div style={{ padding:"24px 26px", flex:1, display:"flex", flexDirection:"column", gap:11 }}>
              {PRO_FEATURES.map((f,i) => (
                <div key={f} style={{ display:"flex", gap:10, alignItems:"flex-start", fontSize:13.5 }}>
                  <i className="ph-bold ph-check" style={{ color:i===0?"#58A6FF":"#3FB950", fontSize:14, marginTop:2, flexShrink:0 }} />
                  <span style={{ color:i===0?"#58A6FF":"#C7D1DD", fontWeight:i===0?600:400 }}>{f}</span>
                </div>
              ))}
            </div>
            <div style={{ padding:"0 26px 26px" }}>
              <Link href="/upgrade?autostart=1" style={{ display:"block", padding:13, borderRadius:11, background:"#58A6FF", color:"#08111E", fontSize:14, fontWeight:700, textAlign:"center" as const, textDecoration:"none" }}>Pro freischalten</Link>
              <p style={{ textAlign:"center" as const, fontFamily:mono, fontSize:10, color:"#566273", margin:"12px 0 0" }}>
                <i className="ph-bold ph-lock-simple" /> Sichere Zahlung via Stripe · SSL
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" ref={rFaq} className="lp-reveal" style={{ borderTop:"1px solid #161D27", background:"#0B0F15" }}>
        <div style={{ maxWidth:720, margin:"0 auto", padding:"80px 28px" }}>
          <div style={{ textAlign:"center", marginBottom:38 }}>
            <h2 style={{ fontSize:32, fontWeight:800, letterSpacing:"-0.025em", color:"#F4F8FC", margin:0 }}>Häufige Fragen</h2>
          </div>
          {FAQS.map(([q,a]) => (
            <details key={q} style={{ borderBottom:"1px solid #1A222D" }}>
              <summary style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"18px 2px", cursor:"pointer", fontSize:15, fontWeight:500, color:"#E7EDF5", gap:16 }}>
                <span>{q}</span>
                <i className="ph-bold ph-plus" style={{ color:"#58A6FF", fontSize:15, flexShrink:0 }} />
              </summary>
              <p style={{ padding:"0 2px 18px", fontSize:14, color:"#9BA8B8", lineHeight:1.66, margin:0 }}>{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── CONVICTION ── */}
      <section ref={rConviction} className="lp-reveal" style={{ borderTop:"1px solid #161D27", background:"#0B0F15" }}>
        <div style={{ maxWidth:1180, margin:"0 auto", padding:"80px 28px" }}>
          <div style={{ textAlign:"center", marginBottom:46 }}>
            <span style={{ fontFamily:mono, fontSize:11, letterSpacing:"0.22em", color:"#58A6FF", textTransform:"uppercase" as const }}>Warum es funktioniert</span>
            <h2 style={{ fontSize:34, fontWeight:800, letterSpacing:"-0.025em", color:"#F4F8FC", margin:"14px 0 12px" }}>Signale mit Beweislast — nicht mit Bauchgefühl</h2>
            <p style={{ fontSize:16, color:"#9BA8B8", maxWidth:580, margin:"0 auto", lineHeight:1.6 }}>Jedes Signal muss durch mehrere unabhängige Filter, bevor es dir angezeigt wird. Kein Rauschen, keine Einzelmeinung.</p>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16 }}>
            {([
              ["ph-scales","2 von 5 Minimum","Konfluenz statt Einzelsignal","Ein Paar erscheint erst, wenn mindestens zwei von fünf unabhängigen Faktoren — Zinsdifferenz, COT-Flow, Saison, Zinstrend, Sentiment — in dieselbe Richtung zeigen."],
              ["ph-flask","20 Jahre Historie","Jedes Signal ist rückgetestet","Der COT-Backtest vergleicht Forward-Returns nach einem Extrem-Signal mit der Basisrate — und warnt automatisch, wenn weniger als acht historische Fälle vorliegen."],
              ["ph-clock-countdown","Immer frisch","Daten direkt von der Quelle","Preise & Sentiment täglich, der CFTC-Report wöchentlich am Freitag, Makrodaten monatlich aus FRED — automatisch aggregiert, ohne manuelle Arbeit."],
            ] as [string,string,string,string][]).map(([icon,label,title,desc]) => (
              <div key={title} style={{ background:"#0E131A", border:"1px solid #1A222D", borderRadius:14, padding:26 }}>
                <div style={{ width:38, height:38, borderRadius:10, background:"rgba(88,166,255,.1)", border:"1px solid rgba(88,166,255,.22)", display:"flex", alignItems:"center", justifyContent:"center", marginBottom:16 }}>
                  <i className={`ph-bold ${icon}`} style={{ color:"#58A6FF", fontSize:19 }} />
                </div>
                <div style={{ fontFamily:mono, fontSize:12, letterSpacing:"0.14em", color:"#3FB950", textTransform:"uppercase" as const, marginBottom:8 }}>{label}</div>
                <div style={{ fontSize:16, fontWeight:700, color:"#F4F8FC", marginBottom:8 }}>{title}</div>
                <p style={{ fontSize:13.5, color:"#8B98A8", lineHeight:1.6, margin:0 }}>{desc}</p>
              </div>
            ))}
          </div>
          <div style={{ display:"flex", alignItems:"center", flexWrap:"wrap", marginTop:24, border:"1px solid #161D27", borderRadius:12, background:"#0C1017", overflow:"hidden" }}>
            {([["ph-lightning","#3FB950","Preise & Sentiment","täglich"],["ph-chart-line-up","#58A6FF","COT-Report","wöchentlich Fr"],["ph-bank","#D8A430","Makro (FRED)","monatlich"]] as [string,string,string,string][]).map(([icon,col,label,freq],i,arr) => (
              <div key={label} style={{ flex:1, minWidth:180, padding:"16px 22px", borderRight:i<arr.length-1?"1px solid #161D27":"none", display:"flex", alignItems:"center", gap:10 }}>
                <i className={`ph-bold ${icon}`} style={{ color:col, fontSize:16 }} />
                <span style={{ fontSize:13, color:"#C7D1DD" }}><strong style={{ color:"#F4F8FC" }}>{label}</strong> — {freq}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section style={{ position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", inset:0, pointerEvents:"none" }}>
          <div style={{ position:"absolute", bottom:-160, left:"50%", transform:"translateX(-50%)", width:820, height:400, background:"radial-gradient(ellipse at center,rgba(88,166,255,.12),transparent 68%)", filter:"blur(30px)" }} />
        </div>
        <div style={{ maxWidth:1180, margin:"0 auto", padding:"90px 28px", textAlign:"center", position:"relative" }}>
          <h2 style={{ fontSize:40, fontWeight:800, letterSpacing:"-0.03em", color:"#F4F8FC", margin:"0 0 16px" }}>Bereit, fundierter zu handeln?</h2>
          <p style={{ fontSize:17, color:"#9BA8B8", maxWidth:500, margin:"0 auto 30px", lineHeight:1.6 }}>Alle fundamentalen FX-Daten in einem Terminal. Täglich aktualisiert. Jederzeit kündbar.</p>
          <Link href="/upgrade?autostart=1" className="lp-pulse-btn" style={{ padding:"15px 30px", borderRadius:12, background:"#58A6FF", color:"#08111E", fontSize:15, fontWeight:700, textDecoration:"none", display:"inline-flex", alignItems:"center", gap:10 }}>
            Jetzt starten — ab CHF 34.95 <i className="ph-bold ph-arrow-right" />
          </Link>
        </div>
      </section>

      {/* ── FEEDBACK ── */}
      <section style={{ borderTop:"1px solid #161D27", background:"#0B0F15" }}>
        <div style={{ maxWidth:720, margin:"0 auto", padding:"72px 28px", textAlign:"center" }}>
          <div style={{ display:"inline-flex", alignItems:"center", gap:7, fontFamily:mono, fontSize:10, fontWeight:700, letterSpacing:"0.16em", textTransform:"uppercase" as const, color:"#3FB950", background:"rgba(63,185,80,.1)", border:"1px solid rgba(63,185,80,.25)", borderRadius:6, padding:"4px 12px", marginBottom:20 }}>
            <span style={{ width:6, height:6, borderRadius:"50%", background:"#3FB950", display:"inline-block" }} />
            Beta
          </div>
          <h2 style={{ fontSize:28, fontWeight:800, letterSpacing:"-0.02em", color:"#F4F8FC", margin:"0 0 14px" }}>
            Dein Feedback formt das Produkt
          </h2>
          <p style={{ fontSize:15.5, color:"#7E8B9C", maxWidth:480, margin:"0 auto 30px", lineHeight:1.65 }}>
            FX Terminal ist in der Beta. Was fehlt dir? Was funktioniert bereits gut? Schreib uns direkt — jede Meinung fliesst in die Entwicklung ein.
          </p>
          <a
            href="mailto:feedback@fx-terminal.ch?subject=FX Terminal Feedback"
            style={{ display:"inline-flex", alignItems:"center", gap:9, padding:"13px 26px", borderRadius:10, background:"transparent", border:"1px solid #2E3844", color:"#C7D1DD", fontSize:14, fontWeight:600, textDecoration:"none", transition:"border-color .2s" }}
          >
            <i className="ph-bold ph-paper-plane-tilt" style={{ fontSize:16 }} />
            Feedback senden
          </a>
          <p style={{ fontSize:11.5, color:"#3F4A58", marginTop:14 }}>Kein Spam. Keine Weitergabe. Nur echtes Feedback.</p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop:"1px solid #161D27", background:"#0A0D12" }}>
        <div style={{ maxWidth:1180, margin:"0 auto", padding:"34px 28px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:20, flexWrap:"wrap" }}>
          <div style={{ display:"flex", alignItems:"center", gap:9 }}>
            <i className="ph-bold ph-pulse" style={{ color:"#58A6FF", fontSize:16 }} />
            <span style={{ fontSize:13, color:"#8B98A8" }}>© 2026 FX Terminal</span>
          </div>
          <div style={{ display:"flex", gap:22, fontSize:13 }}>
            <Link href="/impressum" style={{ color:"#7E8B9C", textDecoration:"none" }}>Impressum</Link>
            <Link href="/datenschutz" style={{ color:"#7E8B9C", textDecoration:"none" }}>Datenschutz</Link>
            <Link href="/agb" style={{ color:"#7E8B9C", textDecoration:"none" }}>AGB</Link>
            <Link href="/login" style={{ color:"#7E8B9C", textDecoration:"none" }}>Anmelden</Link>
          </div>
          <p style={{ width:"100%", textAlign:"center" as const, fontSize:11, color:"#3F4A58", margin:"8px 0 0" }}>
            FX Terminal stellt keine Anlageberatung dar. Alle Inhalte dienen ausschließlich zu Informationszwecken.
          </p>
        </div>
      </footer>
    </div>
  );
}
