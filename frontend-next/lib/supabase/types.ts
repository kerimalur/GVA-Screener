// Zeilen-Typen der Supabase-Tabellen (manuell gepflegt, deckungsgleich mit schema.sql)

export interface InstrumentRow {
  instrument: string;
  display_name: string;
  base_ccy: string | null;
  quote_ccy: string | null;
  kind: "fx" | "commodity" | "index";
  cftc_code: string | null;
}

export interface PriceDailyRow {
  instrument: string;
  date: string; // 'YYYY-MM-DD'
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
}

export interface CotReportRow {
  contract_code: string;
  report_date: string;
  open_interest: number | null;
  noncomm_long: number | null;
  noncomm_short: number | null;
  comm_long: number | null;
  comm_short: number | null;
  nonrept_long: number | null;
  nonrept_short: number | null;
  chg_noncomm_long: number | null;
  chg_noncomm_short: number | null;
}

export interface FredSeriesRow {
  series_id: string;
  date: string;
  value: number | null;
}

export interface FredSeriesMetaRow {
  series_id: string;
  last_date: string | null;
  last_fetched: string | null;
  is_stale: boolean;
}

export interface SentimentSnapshotRow {
  pair: string;
  captured_at: string;
  long_pct: number | null;
  short_pct: number | null;
  long_positions: number | null;
  short_positions: number | null;
  long_volume: number | null;
  short_volume: number | null;
}

export interface CalendarEventRow {
  id: string;
  title: string;
  country: string | null;
  currency: string | null;
  event_time: string;
  impact: string | null;
  forecast: string | null;
  previous: string | null;
  actual: string | null;
  updated_at: string;
}

export interface CbMeetingRow {
  bank: string;
  meeting_date: string;
  expected_change_bps: number | null;
  actual_change_bps: number | null;
  notes: string | null;
}

export interface CbStanceRow {
  bank: string;
  stance_score: number;
  rationale: string | null;
  updated_at: string;
}

export interface CronRunRow {
  id: number;
  job: string;
  ran_at: string;
  status: "ok" | "error" | "skipped" | "deferred";
  detail: Record<string, unknown> | null;
}
