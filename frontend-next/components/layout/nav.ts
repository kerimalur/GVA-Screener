export interface NavItem {
  href: string;
  label: string;
  icon: string;
  requiresPro?: boolean;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Terminal",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "ph-gauge" },
      { href: "/weekly", label: "Weekly Outlook", icon: "ph-compass" },
      { href: "/cot", label: "COT-Analyse", icon: "ph-chart-line-up" },
      { href: "/makro", label: "Makro & Zinsen", icon: "ph-bank" },
      { href: "/sentiment", label: "Retail Sentiment", icon: "ph-users-three" },
      { href: "/intermarket", label: "Intermarket", icon: "ph-arrows-left-right" },
      { href: "/saisonalitaet", label: "Saisonalitaet", icon: "ph-calendar-dots" },
      { href: "/kalender", label: "Kalender", icon: "ph-calendar-check" },
      { href: "/vergleich", label: "Vergleich", icon: "ph-chart-scatter" },
    ],
  },
  {
    title: "Markt-Scanner",
    items: [
      { href: "/scanner/radar", label: "Visuelles Radar", icon: "ph-radar", requiresPro: true },
      { href: "/scanner/signale", label: "Signale", icon: "ph-tray", requiresPro: true },
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
    title: "System",
    items: [{ href: "/einstellungen", label: "Einstellungen", icon: "ph-gear" }],
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
  "/journal": "Trade-Journal",
  "/journal/dashboard": "Journal-Dashboard",
  "/journal/equity": "Equity-Kurve",
  "/journal/outlook": "Outlook — Trading-Thesen",
  "/journal/kalender": "Trade-Kalender",
  "/journal/strategie": "Strategie-Builder",
  "/journal/backtest": "Backtest-Lab",
  "/einstellungen": "Einstellungen",
};
