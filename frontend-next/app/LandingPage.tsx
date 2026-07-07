"use client";

import { useState } from "react";
import Link from "next/link";

/* ─────────────────────────────────────────────────────────────────────────────
   Mini-Mockup-Komponenten — repräsentative Fake-UI, kein echter Datenbezug
───────────────────────────────────────────────────────────────────────────── */

function Chip({ type }: { type: "long" | "short" | "neutral" | "info" }) {
  const styles = {
    long: "bg-[#10261a] text-[#3fb950] border-[#1a3d27]",
    short: "bg-[#2b1517] text-[#f85149] border-[#4a1f22]",
    neutral: "bg-[#2a2110] text-[#d29922] border-[#3d3018]",
    info: "bg-[#16273f] text-[#58a6ff] border-[#1e3a5f]",
  };
  const labels = { long: "LONG", short: "SHORT", neutral: "NEUTRAL", info: "INFO" };
  return (
    <span
      className={`inline-block font-mono text-[10px] font-bold tracking-wider px-2 py-0.5 rounded border ${styles[type]}`}
    >
      {labels[type]}
    </span>
  );
}

function DashboardMockup() {
  const currencies = [
    { name: "GBP", pct: "+2.1%", bar: 92, up: true },
    { name: "USD", pct: "+1.4%", bar: 75, up: true },
    { name: "EUR", pct: "+0.7%", bar: 58, up: true },
    { name: "AUD", pct: "+0.2%", bar: 44, up: true },
    { name: "NZD", pct: "−0.3%", bar: 36, up: false },
    { name: "CAD", pct: "−1.1%", bar: 24, up: false },
    { name: "CHF", pct: "−1.8%", bar: 14, up: false },
    { name: "JPY", pct: "−2.6%", bar: 6, up: false },
  ];

  const screener = [
    { pair: "GBP/JPY", dir: "long" as const, score: "5/5", tags: ["Zinsdiff", "COT-Flow", "Saison"] },
    { pair: "EUR/CAD", dir: "long" as const, score: "4/5", tags: ["COT-Flow", "Stärke", "Zinstrend"] },
    { pair: "USD/CHF", dir: "long" as const, score: "3/5", tags: ["Zinsdiff", "Sentiment"] },
    { pair: "AUD/JPY", dir: "short" as const, score: "3/5", tags: ["COT", "Risk-Off"] },
  ];

  return (
    <div className="rounded-xl border border-[#232c38] bg-[#10151c] overflow-hidden shadow-2xl">
      {/* Titlebar */}
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-[#232c38] bg-[#0b0f14]">
        <span className="w-2.5 h-2.5 rounded-full bg-[#f85149] opacity-70" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#d29922] opacity-70" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#3fb950] opacity-70" />
        <span className="ml-3 font-mono text-[11px] text-[#5f6b7a]">FX Terminal — Dashboard</span>
      </div>

      <div className="p-3 grid grid-cols-2 gap-3">
        {/* Strength */}
        <div className="bg-[#0b0f14] rounded-lg border border-[#232c38] p-3">
          <div className="font-mono text-[10px] text-[#5f6b7a] uppercase tracking-widest mb-2.5">
            Currency Strength · 1M
          </div>
          <div className="space-y-1.5">
            {currencies.map((c) => (
              <div key={c.name} className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-[#8b96a5] w-8">{c.name}</span>
                <div className="flex-1 h-1.5 bg-[#161d26] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${c.up ? "bg-[#3fb950]" : "bg-[#f85149]"}`}
                    style={{ width: `${c.bar}%`, opacity: 0.8 }}
                  />
                </div>
                <span className={`font-mono text-[11px] w-12 text-right ${c.up ? "text-[#3fb950]" : "text-[#f85149]"}`}>
                  {c.pct}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Screener */}
        <div className="bg-[#0b0f14] rounded-lg border border-[#232c38] p-3">
          <div className="font-mono text-[10px] text-[#5f6b7a] uppercase tracking-widest mb-2.5">
            Pair Screener · Konfluenz
          </div>
          <div className="space-y-2">
            {screener.map((s) => (
              <div key={s.pair} className="flex items-start gap-2">
                <Chip type={s.dir} />
                <div>
                  <div className="text-[12px] font-semibold text-[#c9d3df]">{s.pair}</div>
                  <div className="text-[10px] text-[#5f6b7a] mt-0.5">{s.tags.join(" · ")}</div>
                </div>
                <span className="ml-auto font-mono text-[11px] text-[#58a6ff] shrink-0">{s.score}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="px-3 pb-3">
        <div className="bg-[#0b0f14] rounded-lg border border-[#232c38] p-3">
          <div className="font-mono text-[10px] text-[#5f6b7a] uppercase tracking-widest mb-2.5">
            Währungs-Kompass · 4 Faktoren
          </div>
          <div className="flex gap-2 flex-wrap">
            {[
              { c: "GBP", d: "long" as const }, { c: "USD", d: "long" as const },
              { c: "EUR", d: "long" as const }, { c: "AUD", d: "neutral" as const },
              { c: "NZD", d: "neutral" as const }, { c: "CAD", d: "short" as const },
              { c: "CHF", d: "short" as const }, { c: "JPY", d: "short" as const },
            ].map((x) => (
              <div key={x.c} className="flex items-center gap-1.5 bg-[#161d26] rounded px-2 py-1 border border-[#232c38]">
                <span className="font-mono text-[11px] text-[#c9d3df] font-semibold">{x.c}</span>
                <Chip type={x.d} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   FAQ
───────────────────────────────────────────────────────────────────────────── */
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[#232c38]">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-4 text-left text-sm font-medium text-[#c9d3df] hover:text-white transition-colors"
      >
        {q}
        <span className={`ml-4 text-[#58a6ff] text-lg leading-none transition-transform shrink-0 ${open ? "rotate-45" : ""}`}>+</span>
      </button>
      {open && <p className="pb-4 text-sm text-[#8b96a5] leading-relaxed">{a}</p>}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Main Landing Page
───────────────────────────────────────────────────────────────────────────── */
export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#0b0f14] text-[#c9d3df]" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* ── NAVBAR ── */}
      <nav className="sticky top-0 z-50 border-b border-[#232c38] bg-[#0b0f14]/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-[#58a6ff]/20 border border-[#58a6ff]/30 flex items-center justify-center">
              <span className="text-[#58a6ff] text-xs font-bold">FX</span>
            </div>
            <span className="font-semibold tracking-wide text-[#c9d3df]">FX Terminal</span>
          </div>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-6 text-sm text-[#8b96a5]">
            <a href="#features" className="hover:text-[#c9d3df] transition-colors">Features</a>
            <a href="#preis" className="hover:text-[#c9d3df] transition-colors">Preis</a>
            <a href="#faq" className="hover:text-[#c9d3df] transition-colors">FAQ</a>
            <Link
              href="/login"
              className="px-4 py-1.5 rounded-md border border-[#313c4b] text-[#c9d3df] text-sm hover:border-[#58a6ff] hover:text-[#58a6ff] transition-colors"
            >
              Anmelden
            </Link>
          </div>

          {/* Mobile burger */}
          <button
            className="md:hidden text-[#8b96a5] hover:text-white"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <span className="text-xl">{menuOpen ? "✕" : "☰"}</span>
          </button>
        </div>

        {menuOpen && (
          <div className="md:hidden border-t border-[#232c38] bg-[#10151c] px-5 py-4 space-y-3 text-sm">
            <a href="#features" className="block text-[#8b96a5]" onClick={() => setMenuOpen(false)}>Features</a>
            <a href="#preis" className="block text-[#8b96a5]" onClick={() => setMenuOpen(false)}>Preis</a>
            <a href="#faq" className="block text-[#8b96a5]" onClick={() => setMenuOpen(false)}>FAQ</a>
            <Link href="/login" className="block text-[#58a6ff]">Anmelden →</Link>
          </div>
        )}
      </nav>

      {/* ── HERO ── */}
      <section className="relative overflow-hidden">
        {/* Glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[#58a6ff]/5 rounded-full blur-3xl" />
        </div>

        <div className="max-w-6xl mx-auto px-5 pt-20 pb-16 relative">
          <div className="max-w-xl mb-4">
            <span className="inline-block font-mono text-[11px] uppercase tracking-[0.2em] text-[#58a6ff] mb-5">
              Fundamentale FX-Analyse · G8 · 28 Paare
            </span>
            <h1 className="text-4xl sm:text-5xl font-bold leading-[1.08] tracking-tight text-white mb-5">
              Alle fundamentalen FX-Daten.<br />
              <span className="text-[#58a6ff]">Ein Terminal.</span>
            </h1>
            <p className="text-[17px] text-[#8b96a5] leading-relaxed mb-8">
              COT-Positionierung, Zinsdifferenzen, Makro-Daten, Retail-Sentiment und Saisonalität —
              automatisch aggregiert, täglich aktualisiert. Für Swing-Trader, die wissen wollen,
              was das große Geld wirklich macht.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/upgrade?autostart=1"
                className="px-6 py-3 rounded-lg bg-[#58a6ff] text-[#0b0f14] font-semibold text-sm hover:bg-[#79b8ff] transition-colors"
              >
                Jetzt abonnieren — CHF 34.95/Monat
              </Link>
              <Link
                href="/login"
                className="px-6 py-3 rounded-lg border border-[#313c4b] text-[#c9d3df] text-sm font-medium hover:border-[#58a6ff] hover:text-[#58a6ff] transition-colors"
              >
                Anmelden
              </Link>
            </div>
          </div>

          {/* Hero Mockup */}
          <div className="mt-12 lg:mt-0 lg:absolute lg:right-0 lg:top-8 lg:w-[54%] xl:w-[52%]">
            <DashboardMockup />
          </div>
          <div className="lg:h-[420px]" />
        </div>
      </section>

      {/* ── DATENQUELLEN ── */}
      <div className="border-y border-[#232c38] bg-[#10151c]/50">
        <div className="max-w-6xl mx-auto px-5 py-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          <span className="text-[11px] font-mono uppercase tracking-widest text-[#5f6b7a]">Datenquellen</span>
          {["OANDA", "CFTC", "FRED · US Fed", "ForexFactory", "Myfxbook"].map((s) => (
            <span key={s} className="text-[13px] font-semibold text-[#8b96a5] border border-[#232c38] rounded px-3 py-1 bg-[#10151c]">
              {s}
            </span>
          ))}
          <span className="text-[12px] text-[#5f6b7a]">Täglich automatisch aktualisiert</span>
        </div>
      </div>

      {/* ── PROBLEM → LÖSUNG ── */}
      <section className="max-w-6xl mx-auto px-5 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight text-white mb-3">Stundenlange Recherche auf Knopfdruck</h2>
          <p className="text-[#8b96a5] max-w-xl mx-auto">
            Fundamentale FX-Analyse bedeutet normalerweise: 5 Tabs offen, Daten manuell zusammensuchen,
            COT-Report selbst auswerten. FX Terminal übernimmt das.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4 max-w-3xl mx-auto">
          <div className="bg-[#2b1517]/40 border border-[#f85149]/20 rounded-xl p-6">
            <div className="text-[#f85149] font-semibold text-sm mb-4">✗ Ohne FX Terminal</div>
            <ul className="space-y-2.5 text-sm text-[#8b96a5]">
              {[
                "FRED, CFTC, Myfxbook, FF — 5 Tabs offen",
                "COT-Report manuell durchlesen (wöchentlich)",
                "Zinsdifferenzen im Kopf berechnen",
                "Saisonalität in Excel nachbauen",
                "Trades in einer separaten Excel-Datei verwalten",
                "Kein Backtest, ob ein Signal historisch funktioniert hat",
              ].map((x) => <li key={x} className="flex gap-2"><span className="text-[#f85149] shrink-0">✗</span>{x}</li>)}
            </ul>
          </div>
          <div className="bg-[#10261a]/60 border border-[#3fb950]/20 rounded-xl p-6">
            <div className="text-[#3fb950] font-semibold text-sm mb-4">✓ Mit FX Terminal</div>
            <ul className="space-y-2.5 text-sm text-[#8b96a5]">
              {[
                "Alle 6 Quellen in einer App, täglich geladen",
                "COT-Perzentil, Flow und Backtest sofort sichtbar",
                "Zinsdifferenz-Charts für alle 28 Paare",
                "Saisonalitäts-Heatmap mit Trefferquote",
                "Integriertes Journal mit R-Multiple-Auswertung",
                "Historischer Edge-Test per Klick",
              ].map((x) => <li key={x} className="flex gap-2"><span className="text-[#3fb950] shrink-0">✓</span>{x}</li>)}
            </ul>
          </div>
        </div>
      </section>

      {/* ── FEATURES GRID ── */}
      <section id="features" className="max-w-6xl mx-auto px-5 pb-20">
        <div className="text-center mb-12">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#58a6ff]">Features</span>
          <h2 className="text-3xl font-bold tracking-tight text-white mt-2 mb-3">Alles, was du für fundierte Trades brauchst</h2>
          <p className="text-[#8b96a5] max-w-xl mx-auto text-sm">
            16 Analyse-Module, 6 Datenquellen, 28 Paare — ein Login.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* 1 — Pair Screener */}
          <div className="bg-[#10151c] border border-[#232c38] rounded-xl p-5 hover:border-[#313c4b] transition-colors">
            <div className="text-2xl mb-3">🎯</div>
            <div className="font-semibold text-white mb-2">Pair Screener</div>
            <p className="text-sm text-[#8b96a5] mb-4 leading-relaxed">
              28 Paare automatisch nach 5 unabhängigen Faktoren bewertet. Nur Paare mit echter Konfluenz (≥2 gleichgerichtete Signale) werden angezeigt.
            </p>
            <div className="space-y-1.5 text-[11px] font-mono bg-[#0b0f14] rounded-lg p-3 border border-[#1a2535]">
              {[
                { pair: "GBP/JPY", dir: "long" as const, n: "5/5" },
                { pair: "EUR/CAD", dir: "long" as const, n: "4/5" },
                { pair: "AUD/CHF", dir: "short" as const, n: "3/5" },
              ].map(r => (
                <div key={r.pair} className="flex items-center gap-2">
                  <Chip type={r.dir} />
                  <span className="text-[#c9d3df]">{r.pair}</span>
                  <span className="ml-auto text-[#58a6ff]">{r.n}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 2 — COT */}
          <div className="bg-[#10151c] border border-[#232c38] rounded-xl p-5 hover:border-[#313c4b] transition-colors">
            <div className="text-2xl mb-3">📊</div>
            <div className="font-semibold text-white mb-2">COT-Analyse</div>
            <p className="text-sm text-[#8b96a5] mb-4 leading-relaxed">
              CFTC-Report aufbereitet: Netto-Position, 5-Jahres-Perzentil, 4-Wochen-Flow und historischer Backtest. Nicht nur das Niveau — auch die Veränderung.
            </p>
            <div className="space-y-2 text-[11px] font-mono bg-[#0b0f14] rounded-lg p-3 border border-[#1a2535]">
              {[
                { c: "EUR", p: 87, lbl: "EXTREM-LONG" },
                { c: "GBP", p: 71, lbl: "Aufbau" },
                { c: "JPY", p: 12, lbl: "EXTREM-SHORT" },
              ].map(r => (
                <div key={r.c} className="flex items-center gap-2">
                  <span className="text-[#8b96a5] w-7">{r.c}</span>
                  <div className="flex-1 h-1.5 bg-[#161d26] rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${r.p > 75 ? "bg-[#d29922]" : r.p < 25 ? "bg-[#f85149]" : "bg-[#58a6ff]"}`}
                      style={{ width: `${r.p}%`, opacity: 0.8 }} />
                  </div>
                  <span className="text-[#5f6b7a] w-20 text-right">{r.lbl}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 3 — Makro */}
          <div className="bg-[#10151c] border border-[#232c38] rounded-xl p-5 hover:border-[#313c4b] transition-colors">
            <div className="text-2xl mb-3">🏦</div>
            <div className="font-semibold text-white mb-2">Makro & Zinsen</div>
            <p className="text-sm text-[#8b96a5] mb-4 leading-relaxed">
              Leitzinsen, 10Y-Renditen, CPI, Arbeitslosigkeit und BIP-Wachstum für alle G8-Räume — direkt aus der FRED-Datenbank mit Spread-Charts.
            </p>
            <div className="text-[11px] font-mono bg-[#0b0f14] rounded-lg p-3 border border-[#1a2535] space-y-1.5">
              {[
                { land: "USD", zins: "4.50%", cpi: "3.2%", trend: "+" },
                { land: "EUR", zins: "3.15%", cpi: "2.4%", trend: "−" },
                { land: "GBP", zins: "4.25%", cpi: "2.8%", trend: "~" },
              ].map(r => (
                <div key={r.land} className="flex gap-3">
                  <span className="text-[#8b96a5] w-8">{r.land}</span>
                  <span className="text-[#58a6ff]">{r.zins}</span>
                  <span className="text-[#5f6b7a]">CPI {r.cpi}</span>
                  <span className={`ml-auto ${r.trend === "+" ? "text-[#3fb950]" : r.trend === "−" ? "text-[#f85149]" : "text-[#d29922]"}`}>{r.trend}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 4 — Kompass */}
          <div className="bg-[#10151c] border border-[#232c38] rounded-xl p-5 hover:border-[#313c4b] transition-colors">
            <div className="text-2xl mb-3">🧭</div>
            <div className="font-semibold text-white mb-2">Währungs-Kompass</div>
            <p className="text-sm text-[#8b96a5] mb-4 leading-relaxed">
              Jede der 8 G8-Währungen erhält einen Long/Short/Neutral-Bias aus 4 Faktoren: COT-Flow, Leitzins-Trend, CB-Stance und Preisstärke.
            </p>
            <div className="grid grid-cols-4 gap-1.5 text-[10px] font-mono">
              {[
                { c: "GBP", d: "long" as const }, { c: "USD", d: "long" as const },
                { c: "EUR", d: "long" as const }, { c: "AUD", d: "neutral" as const },
                { c: "NZD", d: "neutral" as const }, { c: "CAD", d: "short" as const },
                { c: "CHF", d: "short" as const }, { c: "JPY", d: "short" as const },
              ].map(x => (
                <div key={x.c} className="bg-[#0b0f14] border border-[#1a2535] rounded p-1.5 text-center">
                  <div className="text-[#8b96a5] mb-1">{x.c}</div>
                  <Chip type={x.d} />
                </div>
              ))}
            </div>
          </div>

          {/* 5 — Journal */}
          <div className="bg-[#10151c] border border-[#232c38] rounded-xl p-5 hover:border-[#313c4b] transition-colors">
            <div className="text-2xl mb-3">📒</div>
            <div className="font-semibold text-white mb-2">Trading Journal</div>
            <p className="text-sm text-[#8b96a5] mb-4 leading-relaxed">
              Trades mit R-Multiple, Strategie und Confluences erfassen. Automatische Auswertung: Win-Rate, Profit-Faktor, Expectancy, Drawdown, Equity-Kurve.
            </p>
            <div className="text-[11px] font-mono bg-[#0b0f14] rounded-lg p-3 border border-[#1a2535] space-y-1.5">
              {[
                ["Win-Rate", "58%", "text-[#3fb950]"],
                ["Profit-Faktor", "1.94", "text-[#3fb950]"],
                ["Expectancy", "+0.71R", "text-[#3fb950]"],
                ["Max. Drawdown", "−4.3R", "text-[#f85149]"],
              ].map(([l, v, cls]) => (
                <div key={l} className="flex justify-between">
                  <span className="text-[#5f6b7a]">{l}</span>
                  <span className={cls as string}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 6 — Weekly */}
          <div className="bg-[#10151c] border border-[#232c38] rounded-xl p-5 hover:border-[#313c4b] transition-colors">
            <div className="text-2xl mb-3">📅</div>
            <div className="font-semibold text-white mb-2">Weekly Outlook</div>
            <p className="text-sm text-[#8b96a5] mb-4 leading-relaxed">
              Sonntagabend-Cockpit: Paar-Karten mit institutioneller Positionierung, Saison, Sentiment und bevorstehenden Terminen — sortiert nach Konfluenz-Stärke.
            </p>
            <div className="space-y-1.5 text-[11px] font-mono bg-[#0b0f14] rounded-lg p-3 border border-[#1a2535]">
              {[
                { pair: "GBP/JPY", score: 72, streak: "4W Long" },
                { pair: "EUR/CAD", score: 61, streak: "2W Long" },
                { pair: "USD/CHF", score: 54, streak: "3W Long" },
              ].map(r => (
                <div key={r.pair} className="flex items-center gap-2">
                  <span className="text-[#c9d3df] w-[60px]">{r.pair}</span>
                  <div className="flex-1 h-1 bg-[#161d26] rounded-full overflow-hidden">
                    <div className="h-full bg-[#58a6ff] rounded-full" style={{ width: `${r.score}%`, opacity: 0.7 }} />
                  </div>
                  <span className="text-[#5f6b7a] w-16 text-right">{r.streak}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── WEITERE FEATURES ── */}
      <section className="border-t border-[#232c38] bg-[#10151c]/40">
        <div className="max-w-6xl mx-auto px-5 py-20 space-y-20">

          {/* Saisonalität */}
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <span className="font-mono text-[11px] uppercase tracking-widest text-[#58a6ff]">Saisonalität</span>
              <h3 className="text-2xl font-bold text-white mt-2 mb-3 tracking-tight">Statistischer Rückenwind je Monat</h3>
              <p className="text-[#8b96a5] text-sm leading-relaxed">
                Manche Monate sind historisch verlässlich positiv — andere nicht. Die Heatmap zeigt den Durchschnittsreturn und die Trefferquote je Kalendermonat für alle 28 Paare.
                Automatische Warnung wenn die Stichprobe zu klein ist (unter 8 Jahre).
              </p>
              <ul className="mt-4 space-y-2 text-sm text-[#8b96a5]">
                <li className="flex gap-2"><span className="text-[#3fb950]">→</span> Ø ≥ +0.3 % &amp; Trefferquote ≥ 60 % = statistischer Rückenwind</li>
                <li className="flex gap-2"><span className="text-[#f85149]">→</span> Ø ≤ −0.3 % = historischer Gegenwind</li>
                <li className="flex gap-2"><span className="text-[#d29922]">→</span> Hohes Ø, Hit ~50 % = unzuverlässig, Ausreißerjahre</li>
              </ul>
            </div>
            <div className="bg-[#10151c] border border-[#232c38] rounded-xl p-4">
              <div className="font-mono text-[10px] text-[#5f6b7a] uppercase tracking-widest mb-3">Saisonalität — EUR/USD (2010–2025)</div>
              <div className="flex gap-1 items-end h-20">
                {[
                  { m: "J", v: 0.4, hi: true }, { m: "F", v: -0.2, hi: false },
                  { m: "M", v: 0.6, hi: true }, { m: "A", v: 0.3, hi: true },
                  { m: "M", v: -0.4, hi: false }, { m: "J", v: -0.6, hi: false },
                  { m: "J", v: 0.8, hi: true }, { m: "A", v: 0.2, hi: true },
                  { m: "S", v: -0.5, hi: false }, { m: "O", v: 0.1, hi: false },
                  { m: "N", v: 0.5, hi: true }, { m: "D", v: -0.3, hi: false },
                ].map((b, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="flex-1 w-full flex items-end">
                      <div
                        className={`w-full rounded-t-sm ${b.v > 0 ? "bg-[#3fb950]" : "bg-[#f85149]"}`}
                        style={{ height: `${Math.abs(b.v) * 50}%`, opacity: b.hi ? 0.9 : 0.4 }}
                      />
                    </div>
                    <span className="font-mono text-[9px] text-[#5f6b7a]">{b.m}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* COT Backtest */}
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div className="order-2 md:order-1 bg-[#10151c] border border-[#232c38] rounded-xl p-4">
              <div className="font-mono text-[10px] text-[#5f6b7a] uppercase tracking-widest mb-3">COT Backtest — EUR · Perzentil ≥ 85</div>
              <div className="space-y-2 text-[11px] font-mono">
                <div className="flex gap-3 text-[#5f6b7a] border-b border-[#1a2535] pb-1.5">
                  <span className="w-16">Horizont</span>
                  <span className="w-20">Signal-Ø</span>
                  <span className="w-20">Basis-Ø</span>
                  <span>Edge</span>
                </div>
                {[
                  ["4 Wochen", "+0.82%", "+0.47%", "+0.35%"],
                  ["8 Wochen", "+1.44%", "+0.91%", "+0.53%"],
                  ["12 Wochen", "+1.89%", "+1.31%", "+0.58%"],
                ].map(([h, s, b, e]) => (
                  <div key={h} className="flex gap-3 items-center">
                    <span className="text-[#8b96a5] w-16">{h}</span>
                    <span className="text-[#c9d3df] w-20">{s}</span>
                    <span className="text-[#5f6b7a] w-20">{b}</span>
                    <span className="text-[#3fb950]">{e} ✓</span>
                  </div>
                ))}
                <div className="pt-1.5 text-[10px] text-[#5f6b7a] border-t border-[#1a2535]">
                  n = 23 Fälle · Urteil: <span className="text-[#3fb950]">belastbar</span>
                </div>
              </div>
            </div>
            <div className="order-1 md:order-2">
              <span className="font-mono text-[11px] uppercase tracking-widest text-[#58a6ff]">COT Backtest</span>
              <h3 className="text-2xl font-bold text-white mt-2 mb-3 tracking-tight">Hat dieses Signal historisch funktioniert?</h3>
              <p className="text-[#8b96a5] text-sm leading-relaxed">
                Bevor du einem COT-Signal vertraust: teste es an der Vergangenheit. Das Backtest-Panel vergleicht
                die Forward-Returns nach einem extremen Signal mit der Basisrate — und zeigt, ob überhaupt ein Edge existiert.
                Automatische Warnung bei unter 8 historischen Fällen.
              </p>
            </div>
          </div>

          {/* Risk + Intermarket */}
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <span className="font-mono text-[11px] uppercase tracking-widest text-[#58a6ff]">Risk-Regime &amp; Intermarket</span>
              <h3 className="text-2xl font-bold text-white mt-2 mb-3 tracking-tight">Den Markt als Ganzes verstehen</h3>
              <p className="text-[#8b96a5] text-sm leading-relaxed mb-4">
                Risk-On/Off-Score aus VIX, Gold, JPY/CHF und S&amp;P gibt den übergeordneten Markt-Kontext.
                Korrelationsmatrix zeigt, welche Paare sich gleich bewegen — wichtig, um unbewusstes Doppel-Risiko zu vermeiden.
              </p>
              <ul className="space-y-2 text-sm text-[#8b96a5]">
                <li className="flex gap-2"><span className="text-[#58a6ff]">→</span> Score ≥ 60: AUD, NZD, CAD bevorzugt</li>
                <li className="flex gap-2"><span className="text-[#58a6ff]">→</span> Score ≤ 40: JPY, CHF gesucht</li>
                <li className="flex gap-2"><span className="text-[#58a6ff]">→</span> Korrelation &gt;0.7: kein Doppel-Trade</li>
              </ul>
            </div>
            <div className="bg-[#10151c] border border-[#232c38] rounded-xl p-4 space-y-3">
              <div className="font-mono text-[10px] text-[#5f6b7a] uppercase tracking-widest">Risk-On / Risk-Off</div>
              <div className="flex items-center gap-3">
                <span className="text-[#f85149] text-xs font-mono">RISK-OFF</span>
                <div className="flex-1 h-2 bg-[#161d26] rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[#f85149] via-[#d29922] to-[#3fb950] rounded-full opacity-80" style={{ width: "100%" }} />
                </div>
                <span className="text-[#3fb950] text-xs font-mono">RISK-ON</span>
              </div>
              <div className="flex justify-center">
                <span className="font-mono text-2xl font-bold text-[#58a6ff]">67</span>
                <span className="text-[#5f6b7a] text-sm self-end ml-1">/100 · Risk-On</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                {[["VIX", "14.2", "LOW", "text-[#3fb950]"], ["Gold", "−0.3%", "Neutral", "text-[#d29922]"], ["JPY/CHF", "−0.8%", "Risk-On", "text-[#3fb950]"], ["S&P 500", "+0.9%", "Bullish", "text-[#3fb950]"]].map(([l, v, lbl, cls]) => (
                  <div key={l} className="bg-[#0b0f14] border border-[#1a2535] rounded p-2">
                    <div className="text-[#5f6b7a]">{l}</div>
                    <div className="text-[#c9d3df] font-semibold">{v}</div>
                    <div className={cls as string}>{lbl}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PREIS ── */}
      <section id="preis" className="max-w-6xl mx-auto px-5 py-20">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-8">
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#58a6ff]">Preis</span>
            <h2 className="text-3xl font-bold text-white mt-2 tracking-tight">Einfach. Transparent.</h2>
          </div>

          <div className="bg-[#10151c] border border-[#313c4b] rounded-2xl overflow-hidden shadow-xl">
            <div className="p-8 border-b border-[#232c38]">
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-4xl font-bold text-white">CHF 34.95</span>
                <span className="text-[#8b96a5]">/ Monat</span>
              </div>
              <p className="text-[13px] text-[#5f6b7a]">Monatlich kündbar · keine Mindestlaufzeit</p>
            </div>

            <div className="p-8 border-b border-[#232c38]">
              <ul className="space-y-3">
                {[
                  "28 FX-Paare — COT, Screener, Stärke",
                  "Makro-Fundamentals (FRED, CFTC, OANDA)",
                  "Zentralbank-Stance & Zinsdifferenzen",
                  "Retail-Sentiment (Myfxbook)",
                  "Saisonalität & Intermarket-Korrelationen",
                  "COT-Backtest & historischer Edge-Test",
                  "Integriertes Trading Journal",
                  "Weekly Outlook & Wirtschaftskalender",
                  "Täglich automatisch aktualisiert",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-3 text-sm">
                    <span className="text-[#3fb950] mt-0.5 shrink-0">✓</span>
                    <span className="text-[#c9d3df]">{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-8">
              <Link
                href="/upgrade?autostart=1"
                className="block w-full py-3.5 rounded-xl bg-[#58a6ff] text-[#0b0f14] font-bold text-center text-sm hover:bg-[#79b8ff] transition-colors"
              >
                Jetzt abonnieren
              </Link>
              <p className="text-center text-[11px] text-[#5f6b7a] mt-3">
                Sichere Zahlung via Stripe · SSL-verschlüsselt
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="border-t border-[#232c38] bg-[#10151c]/40">
        <div className="max-w-2xl mx-auto px-5 py-20">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold text-white tracking-tight">Häufige Fragen</h2>
          </div>
          <div className="space-y-0">
            {[
              ["Brauche ich Trading-Vorwissen?", "Die App richtet sich an aktive FX-Trader mit Grundkenntnissen in Fundamentalanalyse. Begriffe wie COT-Report, Leitzins und R-Multiple sollten bekannt sein. In der App gibt es jedoch zu jedem Bereich eine kurze Erklärung."],
              ["Wie aktuell sind die Daten?", "Preise, Zinsen und Sentiment werden täglich aktualisiert. Der COT-Report erscheint wöchentlich freitags. Makrodaten (CPI, Arbeitslosigkeit, BIP) kommen monatlich von FRED."],
              ["Kann ich jederzeit kündigen?", "Ja. Das Abo läuft wöchentlich und kann jederzeit gekündigt werden. Es gibt keine Mindestlaufzeit und keine Kündigungsfrist."],
              ["Welche Währungspaare werden abgedeckt?", "Alle 28 Major- und Minor-Paare der G8-Währungen: USD, EUR, GBP, JPY, CHF, CAD, AUD und NZD. Zusätzlich Bitcoin für die BTC-Karte im Weekly Outlook."],
              ["Funktioniert das auch für Day-Trading?", "FX Terminal ist auf Swing-Trading ausgelegt (Haltedauer 1–10 Tage). Fundamentaldaten wirken auf mittelfristigen Zeithorizonten — für Intraday-Trading sind die Signale weniger relevant."],
              ["Gibt es eine Testphase?", "Derzeit keine kostenlose Testphase. Du kannst jedoch nach einer Woche kündigen, wenn das Terminal nicht deinen Erwartungen entspricht."],
            ].map(([q, a]) => <FaqItem key={q} q={q} a={a} />)}
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ── */}
      <section className="border-t border-[#232c38]">
        <div className="max-w-6xl mx-auto px-5 py-16 text-center">
          <h2 className="text-3xl font-bold text-white tracking-tight mb-3">Bereit, fundierter zu handeln?</h2>
          <p className="text-[#8b96a5] mb-8 max-w-md mx-auto">
            Alle fundamentalen FX-Daten in einem Terminal. Täglich aktualisiert. Wöchentlich kündbar.
          </p>
          <Link
            href="/upgrade?autostart=1"
            className="inline-block px-8 py-3.5 rounded-xl bg-[#58a6ff] text-[#0b0f14] font-bold text-sm hover:bg-[#79b8ff] transition-colors"
          >
            Jetzt starten — CHF 34.95/Monat
          </Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-[#232c38] bg-[#0b0f14]">
        <div className="max-w-6xl mx-auto px-5 py-8 flex flex-wrap items-center justify-between gap-4 text-[13px] text-[#5f6b7a]">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-[#58a6ff]/20 border border-[#58a6ff]/30 flex items-center justify-center">
              <span className="text-[#58a6ff] text-[9px] font-bold">FX</span>
            </div>
            <span>© 2026 FX Terminal</span>
          </div>
          <div className="flex flex-wrap gap-5">
            <Link href="/datenschutz" className="hover:text-[#c9d3df] transition-colors">Datenschutz</Link>
            <Link href="/agb" className="hover:text-[#c9d3df] transition-colors">AGB</Link>
            <Link href="/login" className="hover:text-[#c9d3df] transition-colors">Anmelden</Link>
          </div>
          <p className="w-full text-center text-[11px] text-[#3d4a5a] mt-1">
            FX Terminal stellt keine Anlageberatung dar. Alle Inhalte dienen ausschließlich zu Informationszwecken.
          </p>
        </div>
      </footer>

    </div>
  );
}
