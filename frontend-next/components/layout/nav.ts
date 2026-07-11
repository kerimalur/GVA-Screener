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
      { href: "/vergleich", label: "Vergleich", icon: "ph-chart-scatter" },
    ],
  },
  {
    title: "Details",
    collapsible: true,
    items: [
      { href: "/cot", label: "COT-Analyse", icon: "ph-chart-line-up" },
      { href: "/makro", label: "Makro & Zinsen", icon: "ph-bank" },
      { href: "/sentiment", label: "Retail Sentiment", icon: "ph-users-three" },
      { href: "/intermarket", label: "Intermarket", icon: "ph-arrows-left-right" },
      { href: "/saisonalitaet", label: "Saisonalitaet", icon: "ph-calendar-dots" },
      { href: "/kalender", label: "Kalender", icon: "ph-calendar-check" },
    ],
  },
  {
    title: "Markt-Scanner",
    items: [
      { href: "/scanner/radar", label: "Visuelles Radar", icon: "ph-radar", requiresAdmin: true },
      { href: "/scanner/signale", label: "Signale", icon: "ph-tray", requiresAdmin: true },
      { href: "/scanner/heatmap", label: "Heatmap 28", icon: "ph-grid-nine", requiresAdmin: true },
    ],
  },
  {
    title: "Journal",
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
    items: [
      { href: "/ml/modell", label: "ML-Modell (Anleitung)", icon: "ph-brain" },
      { href: "/ml/labor", label: "Labor", icon: "ph-flask" },
      { href: "/ml", label: "Daten-Check", icon: "ph-robot" },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/leitfaden", label: "Analyse-Leitfaden", icon: "ph-book-open" },
      { href: "/einstellungen", label: "Einstellungen", icon: "ph-gear" },
    ],
  },
];

export const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard — Pair-Uebersicht",
  "/weekly": "Weekly Outlook — Sonntags-Cockpit",
  "/cot": "Commitment of Traders",
  "/makro": "Makro & Fundamentaldaten",
  "/sentiment": "Retail Sentiment",
  "/intermarket": "Intermarket-Analyse",
  "/saisonalitaet": "Saisonalitaet",
  "/kalender": "Wirtschaftskalender",
  "/vergleich": "Vergleichs-Tool",
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
  "/ml/labor": "ML-Labor — Faktor-Explorer",
  "/ml/modell": "ML-Modell — Anleitung",
  "/leitfaden": "Analyse-Leitfaden",
  "/einstellungen": "Einstellungen",
};
