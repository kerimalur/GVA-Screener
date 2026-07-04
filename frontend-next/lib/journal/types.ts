/**
 * Journal-Typen + Konstanten — portiert aus dem Trading Journal
 * (TRADING-JOURNAL/desktop-app/src/shared/types), Electron-Teile entfernt.
 */

export type AccountType = "ek" | "funded";
export type TradeDirection = "long" | "short";
export type TradeResult = "win" | "loss" | "breakeven";
export type SessionType = "live" | "backtest";

export interface Trade {
  id: string;
  type: AccountType;
  pair: string;
  direction: TradeDirection;
  date: string;
  result: TradeResult;
  rMultiple: number;
  riskPercent?: number;
  riskAmount?: number;
  profitAmount?: number;
  notes?: string;
  comment?: string;
  sessionType: SessionType;
  session?: string;
  accountBalanceBefore?: number;
  accountBalanceAfter?: number;
  runningBalance?: number;
  entryPrice?: number;
  exitPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  quantity?: number;
  lotSize?: number;
  status?: "open" | "closed";
  pnl?: number;
  chapterId?: string;
  strategyId?: string;
  setup_daily_bos?: boolean;
  setup_value_area?: boolean;
  setup_market_structure?: boolean;
  setup_weekly_gva?: boolean;
  setup_3day_gva?: boolean;
  confluences?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TradeFilters {
  result?: TradeResult | "all";
  pair?: string | "all";
  setup_daily_bos?: boolean;
  setup_value_area?: boolean;
  setup_market_structure?: boolean;
  setup_weekly_gva?: boolean;
  setup_3day_gva?: boolean;
}

export interface AccountChapter {
  id: string;
  startBalance: number;
  startDate: string;
  endDate?: string;
  reason: string;
}

export interface AccountConfig {
  id?: string;
  name?: string;
  broker?: string;
  accountNumber?: string;
  initialStartBalance: number;
  currentBalance: number;
  currency: string;
  type: AccountType;
  defaultRiskPerTrade: number;
  enableGoals?: boolean;
  profitTargetValue?: number;
  profitTargetType?: "percent" | "absolute";
  maxDrawdownValue?: number;
  maxDrawdownType?: "percent" | "absolute";
  dailyDrawdownValue?: number;
  dailyDrawdownType?: "percent" | "absolute";
  profitTarget?: number;
  maxDrawdown?: number;
  chapters?: AccountChapter[];
  activeChapterId?: string;
  isActive?: boolean;
  isDefault?: boolean;
}

export interface AccountConfigs {
  ek: AccountConfig | null;
  funded: AccountConfig | null;
  ekAccounts?: AccountConfig[];
  fundedAccounts?: AccountConfig[];
}

export type TransactionType = "deposit" | "withdrawal" | "payout";

export interface Transaction {
  id: string;
  type: AccountType;
  transactionType: TransactionType;
  amount: number;
  date: string;
  note?: string;
  createdAt?: string;
}

// ============================================================
// Konstanten
// ============================================================

export const PAIR_LIST = [
  // Major Forex
  "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "NZDUSD", "USDCAD", "USDCHF",
  // Cross Pairs
  "EURAUD", "EURCAD", "EURCHF", "EURGBP", "EURJPY", "EURNZD",
  "GBPAUD", "GBPCAD", "GBPCHF", "GBPJPY", "GBPNZD",
  "AUDCAD", "AUDCHF", "AUDJPY", "AUDNZD",
  "CADCHF", "CADJPY",
  "CHFJPY",
  "NZDCAD", "NZDCHF", "NZDJPY",
  // Metals
  "XAUUSD", "XAGUSD",
  // Crypto
  "BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "BNBUSD", "ADAUSD", "DOGEUSD", "AVAXUSD", "DOTUSD", "LINKUSD",
] as const;

export interface SetupDefinition {
  key: string;
  label: string;
  short: string;
  color: string;
  description: string;
}

export const SETUP_DEFINITIONS: Record<string, SetupDefinition> = {
  setup_daily_bos: {
    key: "setup_daily_bos",
    label: "Daily BOS",
    short: "BOS",
    color: "#22C55E",
    description: "Daily Break of Structure",
  },
  setup_value_area: {
    key: "setup_value_area",
    label: "Value Area",
    short: "VA",
    color: "#4A9EFF",
    description: "Value Area Entry",
  },
  setup_market_structure: {
    key: "setup_market_structure",
    label: "Market Structure",
    short: "MS",
    color: "#E67E22",
    description: "Market Structure Shift",
  },
  setup_weekly_gva: {
    key: "setup_weekly_gva",
    label: "Weekly GVA",
    short: "W-GVA",
    color: "#9B59B6",
    description: "Weekly GVA Entry",
  },
  setup_3day_gva: {
    key: "setup_3day_gva",
    label: "3-Day GVA",
    short: "3D-GVA",
    color: "#F1C40F",
    description: "3-Day GVA Entry",
  },
};

// Confluences — user-anpassbar (localStorage, wie im alten Journal;
// Verwaltung in den Settings)
export const DEFAULT_CONFLUENCES = [
  "Fundamental",
  "Technisch",
  "Event-basiert",
  "Saisonal",
  "Intermarket",
  "SMC",
  "Liquidität",
  "Imbalance",
] as const;

const CONFLUENCES_KEY = "tradingJournal_confluences";

export function getConfluences(): string[] {
  if (typeof window === "undefined") return [...DEFAULT_CONFLUENCES];
  try {
    const stored = localStorage.getItem(CONFLUENCES_KEY);
    return stored ? JSON.parse(stored) : [...DEFAULT_CONFLUENCES];
  } catch {
    return [...DEFAULT_CONFLUENCES];
  }
}

export function saveConfluences(list: string[]): void {
  localStorage.setItem(CONFLUENCES_KEY, JSON.stringify(list));
}

// Problem-Tags für Backtest-Trades (gleiches Muster)
export const DEFAULT_PROBLEMS = [
  "COT-Divergenz ignoriert",
  "Zu früh eingestiegen",
  "Zu spät eingestiegen",
  "Stop zu eng",
  "Kein A+ Setup",
  "Gegen den Trend",
  "FOMO",
  "Plan nicht eingehalten",
] as const;

const PROBLEMS_KEY = "tradingJournal_problems";

export function getProblems(): string[] {
  if (typeof window === "undefined") return [...DEFAULT_PROBLEMS];
  try {
    const stored = localStorage.getItem(PROBLEMS_KEY);
    return stored ? JSON.parse(stored) : [...DEFAULT_PROBLEMS];
  } catch {
    return [...DEFAULT_PROBLEMS];
  }
}

export function saveProblems(list: string[]): void {
  localStorage.setItem(PROBLEMS_KEY, JSON.stringify(list));
}

// Wiederverwendbare Notiz-Bausteine für Backtest-Trades (gleiches Muster)
const NOTE_SNIPPETS_KEY = "tradingJournal_noteSnippets";

export function getNoteSnippets(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(NOTE_SNIPPETS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function saveNoteSnippets(list: string[]): void {
  localStorage.setItem(NOTE_SNIPPETS_KEY, JSON.stringify(list));
}
