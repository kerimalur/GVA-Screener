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
    title: "Analyse",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "ph-gauge" },
      { href: "/weekly", label: "Weekly Outlook", icon: "ph-compass" },
      { href: "/makro/terminal", label: "Macro Terminal", icon: "ph-globe-hemisphere-west" },
      { href: "/cot/intelligence", label: "COT Intelligence", icon: "ph-chart-bar" },
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
      { href: "/journal/strategie", label: "Strategien", icon: "ph-strategy" },
      { href: "/journal/backtest", label: "Backtest", icon: "ph-flask" },
    ],
  },
  {
    title: "Machine Learning",
    collapsible: true,
    items: [
      { href: "/ml/training", label: "Training", icon: "ph-play-circle" },
      { href: "/ml/ranking", label: "Währungs-Ranking", icon: "ph-ranking" },
      { href: "/ml/replay", label: "Replay", icon: "ph-rewind" },
      { href: "/ml/season", label: "Season 2.0", icon: "ph-sun-horizon" },
      { href: "/ml/modell", label: "ML-Modell (Anleitung)", icon: "ph-brain" },
      { href: "/ml", label: "Daten-Check", icon: "ph-robot" },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/einstellungen", label: "Einstellungen", icon: "ph-gear" },
      { href: "/leitfaden", label: "Leitfaden", icon: "ph-book-open" },
    ],
  },
];

export const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard — Wirtschafts-News",
  "/weekly": "Weekly Outlook — Sonntags-Cockpit",
  "/cot/intelligence": "COT Intelligence — Institutionelle Positionierung",
  "/makro/terminal": "Macro Terminal — G8 Currency Bias",
  "/makro/terminal/vergleich": "Macro Terminal — Währungsvergleich",
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
  "/ml/replay": "Backtest-Replay — GVA-Hits bewerten",
  "/ml/modell": "ML-Modell — Anleitung",
  "/ml/season": "Saisonalität 2.0 — Feature-Explorer",
  "/leitfaden": "Analyse-Leitfaden",
  "/einstellungen": "Einstellungen",
};
