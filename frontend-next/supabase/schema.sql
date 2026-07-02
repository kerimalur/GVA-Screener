-- ============================================================
-- FX Terminal — Supabase Schema
-- Ausführen im Supabase SQL Editor (einmalig), danach seed.sql.
-- Zugriff ausschließlich server-seitig über Service-Role-Key;
-- RLS ist aktiviert ohne Policies => anon/authenticated sehen nichts.
-- ============================================================

-- Instrument-Metadaten
create table if not exists instruments (
  instrument   text primary key,          -- 'EUR_USD', 'XAU_USD', …
  display_name text not null,
  base_ccy     text,
  quote_ccy    text,
  kind         text not null check (kind in ('fx','commodity','index')),
  cftc_code    text                       -- Join-Schlüssel -> cot_reports
);

-- OANDA Tageskerzen
create table if not exists price_daily (
  instrument text not null references instruments(instrument),
  date       date not null,
  open numeric, high numeric, low numeric,
  close numeric not null,
  volume     integer,
  primary key (instrument, date)
);
create index if not exists price_daily_date_idx on price_daily(date);

-- CFTC Legacy COT (Futures only)
create table if not exists cot_reports (
  contract_code  text not null,
  report_date    date not null,
  open_interest  integer,
  noncomm_long integer, noncomm_short integer,
  comm_long integer,    comm_short integer,
  nonrept_long integer, nonrept_short integer,
  chg_noncomm_long integer, chg_noncomm_short integer,
  primary key (contract_code, report_date)
);
create index if not exists cot_reports_date_idx on cot_reports(report_date);

-- FRED-Zeitreihen (Zinsen, Yields, CPI, VIX, CLI, …)
create table if not exists fred_series (
  series_id text not null,
  date      date not null,
  value     numeric,
  primary key (series_id, date)
);

create table if not exists fred_series_meta (
  series_id    text primary key,
  last_date    date,
  last_fetched timestamptz,
  is_stale     boolean default false
);

-- Myfxbook Retail-Sentiment-Snapshots (akkumuliert historisch)
create table if not exists sentiment_snapshots (
  pair        text not null,              -- 'EURUSD' (Myfxbook-Notation)
  captured_at timestamptz not null,
  long_pct numeric, short_pct numeric,
  long_positions integer, short_positions integer,
  long_volume numeric, short_volume numeric,
  primary key (pair, captured_at)
);

-- ForexFactory Wirtschaftskalender
create table if not exists calendar_events (
  id         text primary key,            -- hash(title|country|date)
  title      text not null,
  country    text,
  currency   text,
  event_time timestamptz not null,
  impact     text,                        -- 'High'|'Medium'|'Low'|'Holiday'
  forecast   text, previous text, actual text,
  updated_at timestamptz default now()
);
create index if not exists calendar_events_time_idx on calendar_events(event_time);

-- Zentralbank-Sitzungen (Seed + manuell im Table Editor pflegbar)
create table if not exists cb_meetings (
  bank                text not null,      -- 'FED','EZB','BOE','BOJ','SNB','RBA','RBNZ','BOC'
  meeting_date        date not null,
  expected_change_bps integer,
  actual_change_bps   integer,
  notes               text,
  primary key (bank, meeting_date)
);

-- Hawkish/Dovish-Spektrum (Seed, manuell editierbar; ergänzt berechneten Raten-Trend)
create table if not exists cb_stance (
  bank         text primary key,
  stance_score numeric not null check (stance_score between -10 and 10),
  rationale    text,
  updated_at   timestamptz default now()
);

-- Cron-Observability
create table if not exists cron_runs (
  id     bigint generated always as identity primary key,
  job    text not null,
  ran_at timestamptz default now(),
  status text not null,                   -- 'ok'|'error'|'skipped'|'deferred'
  detail jsonb
);
create index if not exists cron_runs_ran_at_idx on cron_runs(ran_at desc);

-- RLS: aktiviert, keine Policies => Zugriff nur mit Service-Role-Key
alter table instruments         enable row level security;
alter table price_daily         enable row level security;
alter table cot_reports         enable row level security;
alter table fred_series         enable row level security;
alter table fred_series_meta    enable row level security;
alter table sentiment_snapshots enable row level security;
alter table calendar_events     enable row level security;
alter table cb_meetings         enable row level security;
alter table cb_stance           enable row level security;
alter table cron_runs           enable row level security;
