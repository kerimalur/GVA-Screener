export interface NavItem {
  href: string;
  label: string;
  icon: string; // Phosphor icon class suffix
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Terminal",
    items: [
      { href: "/", label: "Dashboard", icon: "ph-gauge" },
      { href: "/cot", label: "COT-Analyse", icon: "ph-chart-line-up" },
      { href: "/makro", label: "Makro & Zinsen", icon: "ph-bank" },
      { href: "/sentiment", label: "Retail Sentiment", icon: "ph-users-three" },
      { href: "/intermarket", label: "Intermarket", icon: "ph-arrows-left-right" },
      { href: "/saisonalitaet", label: "Saisonalität", icon: "ph-calendar-dots" },
      { href: "/kalender", label: "Kalender", icon: "ph-calendar-check" },
      { href: "/vergleich", label: "Vergleich", icon: "ph-chart-scatter" },
    ],
  },
  {
    title: "Markt-Scanner",
    items: [
      { href: "/scanner/radar", label: "Visuelles Radar", icon: "ph-radar" },
      { href: "/scanner/heatmap", label: "Heatmap 28", icon: "ph-grid-nine" },
    ],
  },
  {
    title: "Journal",
    items: [
      { href: "/journal", label: "Trades", icon: "ph-notebook" },
    ],
  },
];

export const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard — Pair-Übersicht",
  "/cot": "Commitment of Traders",
  "/makro": "Makro & Fundamentaldaten",
  "/sentiment": "Retail Sentiment",
  "/intermarket": "Intermarket-Analyse",
  "/saisonalitaet": "Saisonalität",
  "/kalender": "Wirtschaftskalender",
  "/vergleich": "Vergleichs-Tool",
  "/scanner/radar": "Visuelles Radar",
  "/scanner/heatmap": "Heatmap 28",
  "/journal": "Trade-Journal",
};
