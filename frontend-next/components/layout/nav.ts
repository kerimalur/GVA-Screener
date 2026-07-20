export interface NavItem {
  href: string;
  label: string;
  icon: string;
  requiresAdmin?: boolean;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
  /** eingeklappt per Default; Zustand wird in localStorage gemerkt */
  collapsible?: boolean;
}

export const NAV_GROUPS: NavGroup[] = [
  {
    // Täglicher Weg: was du wirklich tradest — GVA-Setups + fundamentale Konfluenz.
    title: "Trading",
    items: [
      { href: "/cockpit", label: "Cockpit", icon: "ph-crosshair" },
      { href: "/ml/ranking", label: "Währungs-Ranking", icon: "ph-ranking" },
    ],
  },
  {
    title: "Markt-Scanner",
    collapsible: true,
    items: [
      { href: "/scanner/radar", label: "Visuelles Radar", icon: "ph-radar", requiresAdmin: true },
      { href: "/scanner/signale", label: "Signale", icon: "ph-tray", requiresAdmin: true },
      { href: "/scanner/heatmap", label: "Heatmap 28", icon: "ph-grid-nine", requiresAdmin: true },
    ],
  },
  {
    title: "Journal",
    collapsible: true,
    items: [
      { href: "/journal/dashboard", label: "Dashboard", icon: "ph-squares-four" },
      { href: "/journal", label: "Trades", icon: "ph-notebook" },
      { href: "/journal/equity", label: "Equity", icon: "ph-chart-line-up" },
      { href: "/journal/outlook", label: "Outlook", icon: "ph-crosshair" },
      { href: "/journal/kalender", label: "Trade-Kalender", icon: "ph-calendar-heart" },
    ],
  },
  {
    title: "Backtest",
    collapsible: true,
    items: [
      { href: "/journal/backtest", label: "Backtest-Lab", icon: "ph-flask" },
      { href: "/ml/replay", label: "Replay (GVA-Hits)", icon: "ph-rewind" },
    ],
  },
  {
    // Faktor-Detail-Ansichten + Auto-News: erklären das "Warum", sind aber keine
    // tägliche Entscheidungsquelle (Labor: Gleichgewichtung ~50 %). Laufen weiter
    // fürs spätere Faktor-Labor (Projekt B), bewusst aus dem täglichen Weg genommen.
    title: "Labor · versteckt",
    collapsible: true,
    items: [
      { href: "/ml/factor-lab", label: "Factor-Lab", icon: "ph-flask" },
      { href: "/dashboard", label: "News-Dashboard", icon: "ph-gauge" },
      { href: "/weekly", label: "Weekly Outlook", icon: "ph-compass" },
      { href: "/makro/terminal", label: "Macro Terminal", icon: "ph-globe-hemisphere-west" },
      { href: "/makro/real-yield", label: "Real Yield", icon: "ph-scales" },
      { href: "/cot/intelligence", label: "COT Intelligence", icon: "ph-chart-bar" },
      { href: "/ml/season", label: "Season 2.0", icon: "ph-sun-horizon" },
      { href: "/ml/fundamental-track", label: "Fundamental-Track", icon: "ph-chart-line" },
      { href: "/ml/setup-finder", label: "Setup-Finder", icon: "ph-magnifying-glass" },
      { href: "/ml/engine-log", label: "Engine-Log (nächtlich)", icon: "ph-list-checks" },
      { href: "/ml/modell", label: "ML-Modell (Anleitung)", icon: "ph-brain" },
      { href: "/ml", label: "Daten-Check", icon: "ph-robot" },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/journal/strategie", label: "Strategien", icon: "ph-strategy" },
      { href: "/einstellungen", label: "Einstellungen", icon: "ph-gear" },
      { href: "/leitfaden", label: "Leitfaden", icon: "ph-book-open" },
    ],
  },
];

export const PAGE_TITLES: Record<string, string> = {
  "/cockpit": "Cockpit — Trades der Woche",
  "/dashboard": "Dashboard — Wirtschafts-News",
  "/weekly": "Weekly Outlook — Sonntags-Cockpit",
  "/cot/intelligence": "COT Intelligence — Institutionelle Positionierung",
  "/makro/terminal": "Macro Terminal — G8 Currency Bias",
  "/makro/terminal/vergleich": "Macro Terminal — Währungsvergleich",
  "/makro/real-yield": "Real Yield — Valuation-Bias (Zins − Inflation)",
  "/scanner/radar": "Visuelles Radar",
  "/scanner/signale": "Signals-Inbox",
  "/scanner/heatmap": "Heatmap 28",
  "/journal": "Trade-Journal",
  "/journal/dashboard": "Journal-Dashboard",
  "/journal/equity": "Equity-Kurve",
  "/journal/outlook": "Outlook — Trading-Thesen",
  "/journal/kalender": "Trade-Kalender",
  "/journal/strategie": "Strategie-Builder",
  "/journal/backtest": "Backtest-Lab",
  "/ml": "Machine Learning — Daten-Check",
  "/ml/training": "ML-Training — Modell & Predictions",
  "/ml/ranking": "Währungs-Ranking — ML-Engine",
  "/ml/fundamental-track": "Fundamental-Track — Q-Score vs. Markt",
  "/ml/setup-finder": "Setup-Finder — Ranking vs. Outlook-Konfluenz",
  "/ml/factor-lab": "Factor-Lab — welcher Faktor trifft?",
  "/ml/replay": "Backtest-Replay — GVA-Hits bewerten",
  "/ml/engine-log": "Engine-Log — Nächtliche Experiment-Suche",
  "/ml/modell": "ML-Modell — Anleitung",
  "/ml/season": "Saisonalität 2.0 — Feature-Explorer",
  "/leitfaden": "Analyse-Leitfaden",
  "/einstellungen": "Einstellungen",
};
