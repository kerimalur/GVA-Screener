-- ============================================================
-- GVA-Screener Kombi-App — Master-Schema (Journal + Terminal + Signals)
-- ============================================================
-- EINE idempotente Datei. Im SQL-Editor des (bestehenden)
-- Journal-Supabase-Projekts ausführen; läuft auch auf leerem
-- Projekt fehlerfrei durch. Danach: supabase/seed.sql.
--
-- Zwei Datenwelten in einem Projekt:
--   • Journal-Tabellen + signals: Browser-Client (Anon-Key),
--     RLS-Policy auth.uid() = user_id
--   • Terminal-Tabellen (instruments, price_daily, …): nur
--     Service-Role, RLS aktiv OHNE Policies (anon sieht nichts)
--
-- KONFLIKTE zwischen den Journal-Migrationsdateien (dokumentiert,
-- nicht still aufgelöst — Details in MIGRATION.md):
--   1. user_preferences: 008_complete_fresh_setup.sql definiert
--      (user_id UNIQUE, preferences JSONB); RUN_THIS_backtest_problems.sql
--      und der App-Code (preferencesService) nutzen (user_id, key, value,
--      PK(user_id,key)). Hier gilt die Key/Value-Variante. Existiert die
--      Alt-Variante, wird gewarnt statt geändert (siehe DO-Block unten).
--   2. backtest_sessions: 008 hat pair TEXT NOT NULL etc.; der App-Code
--      schreibt kein pair (Config liegt in stats.config). Hier gilt die
--      Code-Variante; ein vorhandenes NOT NULL auf pair wird gelockert,
--      sonst schlägt jedes Speichern fehl.
--   3. trades.result / outlooks.status: 008 mit CHECK-Constraints,
--      RUN_THIS_IN_SUPABASE.sql ohne. Hier ohne (Bestandsdaten sicher).
-- ============================================================


-- ============================================================
-- 0. Hilfsfunktion: auto-updated_at
-- ============================================================

create or replace function update_updated_at_column()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;


-- ============================================================
-- 1. JOURNAL — Basistabellen (1:1 aus dem Trading Journal)
-- ============================================================

create table if not exists user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text, avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, type text not null check (type in ('ek','funded')),
  broker text not null default '', account_number text not null default '',
  currency text not null default 'USD',
  initial_balance numeric(15,2) not null default 0,
  current_balance numeric(15,2) not null default 0,
  enable_goals boolean default false,
  profit_target_value numeric(10,4), profit_target_type text, profit_target numeric(15,2),
  max_drawdown_value numeric(10,4), max_drawdown_type text, max_drawdown numeric(15,2),
  daily_drawdown_value numeric(10,4), daily_drawdown_type text,
  default_risk_per_trade numeric(6,3) not null default 1.0,
  chapters jsonb not null default '[]', active_chapter_id text,
  is_active boolean not null default true, is_default boolean not null default false,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_accounts_user      on accounts(user_id);
create index if not exists idx_accounts_user_type on accounts(user_id, type);

create table if not exists strategies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, description text not null default '',
  direction text not null default 'both',
  rules jsonb not null default '[]', pairs text[] not null default '{}',
  timeframes text[] not null default '{}', sessions text[] not null default '{}',
  is_active boolean not null default true, stats jsonb not null default '{}',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Nachrüstungen aus RUN_THIS_strategy_link.sql
alter table strategies add column if not exists images jsonb not null default '[]'::jsonb;
alter table strategies add column if not exists notes text not null default '';
alter table strategies add column if not exists rules jsonb not null default '[]'::jsonb;
alter table strategies add column if not exists direction text not null default 'both';
create index if not exists idx_strategies_user on strategies(user_id);

create table if not exists outlooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null, direction text not null check (direction in ('long','short')),
  thesis text not null default '', confidence integer not null default 3,
  status text not null default 'observation',
  cot_bias jsonb,
  target_entry numeric(18,6), target_sl numeric(18,6), target_tp numeric(18,6),
  interesting_zone numeric(18,6), image_data text,
  confluences text[] not null default '{}', tags text[] not null default '{}',
  started_at timestamptz, journaled_to text[] not null default '{}', expires_at text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Erweiterungen aus 009_schema_update.sql / RUN_THIS_IN_SUPABASE.sql
alter table outlooks add column if not exists is_starred boolean not null default false;
alter table outlooks add column if not exists setup_id text;
alter table outlooks add column if not exists strategy_checklist jsonb not null default '[]';
alter table outlooks add column if not exists fundamental_outlook text not null default '';
create index if not exists idx_outlooks_user    on outlooks(user_id);
create index if not exists idx_outlooks_status  on outlooks(user_id, status);
create index if not exists idx_outlooks_symbol  on outlooks(user_id, symbol);
create index if not exists idx_outlooks_starred on outlooks(user_id) where is_starred = true;

create table if not exists trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references accounts(id) on delete set null,
  outlook_id uuid references outlooks(id) on delete set null,
  strategy_id uuid references strategies(id) on delete set null,
  type text not null check (type in ('ek','funded')),
  symbol text not null, side text not null check (side in ('long','short')),
  date text not null, result text,
  status text not null default 'closed', session_type text not null default 'live',
  session text not null default '',
  r_multiple numeric(10,4) not null default 0,
  risk_percent numeric(8,4), risk_amount numeric(15,2),
  profit_amount numeric(15,2), pnl numeric(15,2),
  entry_price numeric(18,6), exit_price numeric(18,6),
  stop_loss numeric(18,6), take_profit numeric(18,6),
  quantity numeric(15,6), lot_size numeric(10,4),
  account_balance_before numeric(15,2), account_balance_after numeric(15,2),
  running_balance numeric(15,2),
  setup_daily_bos boolean not null default false,
  setup_value_area boolean not null default false,
  setup_market_structure boolean not null default false,
  setup_weekly_gva boolean not null default false,
  setup_3day_gva boolean not null default false,
  confluences jsonb not null default '[]',
  notes text not null default '', comment text not null default '', chapter_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table trades add column if not exists strategy_id uuid references strategies(id) on delete set null;
create index if not exists idx_trades_user     on trades(user_id);
create index if not exists idx_trades_account  on trades(account_id);
create index if not exists idx_trades_type     on trades(user_id, type);
create index if not exists idx_trades_date     on trades(user_id, date desc);
create index if not exists idx_trades_result   on trades(user_id, result);
create index if not exists idx_trades_outlook  on trades(outlook_id);
create index if not exists idx_trades_symbol   on trades(user_id, symbol);
create index if not exists idx_trades_session  on trades(user_id, session_type);
create index if not exists idx_trades_strategy on trades(strategy_id);

-- Zirkulärer FK outlooks → trades (erst nach trades möglich)
alter table outlooks add column if not exists executed_trade_id uuid references trades(id) on delete set null;
create index if not exists idx_outlooks_trade on outlooks(executed_trade_id);

create table if not exists trade_screenshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_id uuid not null references trades(id) on delete cascade,
  label text not null default 'entry',
  screenshot_data text not null,
  mime_type text not null default 'image/png',
  file_size_kb integer,
  created_at timestamptz not null default now()
);
create index if not exists idx_screenshots_trade on trade_screenshots(trade_id);
create index if not exists idx_screenshots_user  on trade_screenshots(user_id);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references accounts(id) on delete cascade,
  type text not null check (type in ('ek','funded')),
  transaction_type text not null check (transaction_type in ('deposit','withdrawal','payout')),
  amount numeric(15,2) not null, date text not null, note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_transactions_user    on transactions(user_id);
create index if not exists idx_transactions_account on transactions(account_id);
create index if not exists idx_transactions_date    on transactions(user_id, date desc);

-- Konflikt 2 (siehe Kopf): Code-Variante ohne pair/timeframe-Pflichtfelder
create table if not exists backtest_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  status text not null default 'active',
  elapsed_ms bigint not null default 0,
  trades jsonb not null default '[]'::jsonb,
  stats jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table backtest_sessions add column if not exists strategy_id uuid references strategies(id) on delete set null;
-- Falls die 008-Variante existiert: NOT NULL auf pair lockern, sonst
-- schlägt jedes Speichern aus der App fehl (App schreibt kein pair).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'backtest_sessions'
      and column_name = 'pair' and is_nullable = 'NO'
  ) then
    alter table backtest_sessions alter column pair drop not null;
    raise notice 'backtest_sessions.pair: NOT NULL entfernt (008-Altschema erkannt)';
  end if;
end $$;
create index if not exists idx_backtest_sessions_user on backtest_sessions(user_id);
create index if not exists idx_backtest_strategy      on backtest_sessions(strategy_id);

create table if not exists fundamentals_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  section text not null, currency text, title text not null default '',
  content text not null default '', tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_fundamentals_user on fundamentals_notes(user_id);

create table if not exists pair_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pair text not null, notes text not null default '', bias text,
  key_levels jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  unique(user_id, pair)
);

create table if not exists risk_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

-- Konflikt 1 (siehe Kopf): Key/Value-Variante — die nutzt der App-Code.
create table if not exists user_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
-- Alt-Variante (008: user_id UNIQUE + preferences JSONB) erkannt? Nur warnen.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_preferences' and column_name = 'key'
  ) then
    raise warning 'user_preferences hat das Alt-Schema aus 008 (preferences JSONB statt key/value). '
      'App-Code erwartet key/value. Manuell migrieren: Tabelle umbenennen und schema.sql erneut ausführen. '
      'Details in MIGRATION.md.';
  end if;
end $$;

create table if not exists user_watchlists (
  user_id uuid primary key references auth.users(id) on delete cascade,
  watchlists jsonb not null default '[]'::jsonb,
  color_labels jsonb not null default '{}'::jsonb,
  dashboard_color text,
  updated_at timestamptz not null default now()
);

create table if not exists user_widget_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);


-- ============================================================
-- 2. JOURNAL — Smart-COT-Tabellen
-- ============================================================

create table if not exists cot_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date text not null, currency text not null,
  commercials_long numeric not null default 0, commercials_short numeric not null default 0,
  commercials_net numeric not null default 0,
  non_commercials_long numeric not null default 0, non_commercials_short numeric not null default 0,
  non_commercials_net numeric not null default 0, open_interest numeric not null default 0,
  percentile_rank numeric(5,2), signal text, weekly_change numeric not null default 0,
  created_at timestamptz not null default now(),
  unique(user_id, date, currency)
);
create index if not exists idx_cot_snap_lookup on cot_snapshots(user_id, currency, date desc);

create table if not exists cot_currency_analysis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  currency text not null,
  current_signal text, current_percentile numeric(5,2), current_net numeric, latest_date text,
  momentum_1w numeric not null default 0, momentum_4w numeric not null default 0,
  momentum_8w numeric not null default 0,
  momentum_signal text not null default 'neutral',
  is_extreme boolean not null default false, extreme_type text,
  weeks_at_extreme integer not null default 0,
  trend_direction text not null default 'flat', trend_weeks integer not null default 0,
  coc_detected boolean not null default false, coc_type text, coc_date text,
  spec_commercial_divergence boolean not null default false, spec_commercial_detail text,
  smart_score integer not null default 0,
  oi_trend text not null default 'flat', oi_divergence boolean not null default false,
  spec_net numeric not null default 0, spec_percentile numeric(5,2) not null default 50,
  spec_crowding_extreme boolean not null default false, spec_crowding_type text,
  seasonal_bias text not null default 'neutral', seasonal_strength integer not null default 0,
  rate_differential numeric not null default 0, rate_trend text not null default 'neutral',
  rate_cot_confluence boolean not null default false,
  regime text not null default 'ranging', regime_confidence integer not null default 0,
  historical_win_rate numeric(5,2), historical_avg_weeks integer,
  historical_sample_size integer not null default 0,
  similar_setups jsonb not null default '[]', ml_direction text,
  ml_confidence numeric(5,2) not null default 0,
  final_conviction integer not null default 0,
  updated_at timestamptz not null default now(),
  unique(user_id, currency)
);
create index if not exists idx_cot_analysis_user on cot_currency_analysis(user_id);

create table if not exists cot_pair_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pair text not null,
  direction text not null check (direction in ('long','short')),
  strength integer not null default 0, smart_score integer not null default 0,
  base_currency text not null, base_smart_score integer not null default 0,
  quote_currency text not null, quote_smart_score integer not null default 0,
  divergence_score integer not null default 0, momentum_aligned boolean not null default false,
  reasons jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  unique(user_id, pair)
);
create index if not exists idx_cot_pairs_user on cot_pair_signals(user_id);

create table if not exists cot_weekly_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  iso_week text not null,
  snapshot_date text not null,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(user_id, iso_week)
);
create index if not exists idx_cot_weekly_week on cot_weekly_snapshots(user_id, iso_week desc);


-- ============================================================
-- 3. NEU: signals (Scanner-HITs → Journal-Inbox)
-- ============================================================

create table if not exists signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  source text default 'gva',
  pair text not null,
  line_type text check (line_type in ('short','long')),
  line_level numeric not null,
  hit_at timestamptz not null default now(),
  fundamental_snapshot jsonb,
  status text check (status in ('new','journaled','watchlist','dismissed')) default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_signals_inbox on signals(user_id, status, hit_at desc);


-- ============================================================
-- 3b. outlooks ↔ signals verkoppeln (Setup-Lebenszyklus)
-- ============================================================
-- Der Outlook ist die Detailebene ÜBER dem Signal: ein GVA-Hit legt beim
-- Insert automatisch einen Outlook an, manuelle Thesen bleiben daneben
-- bestehen. Steht bewusst hier unten und nicht im outlooks-Block — die
-- Fremdschlüssel-Referenz braucht die signals-Tabelle.
--
-- Rein additiv: Bestandszeilen bekommen source='manual' und signal_id=null
-- und funktionieren unverändert weiter. Es wird KEIN Backfill für historische
-- Signale gemacht (siehe Backend/supabase_signals.py).
alter table outlooks add column if not exists signal_id uuid
  references signals(id) on delete set null;
alter table outlooks add column if not exists source text not null default 'manual';

-- Höchstens EIN Outlook je Signal. Partiell, damit die vielen manuellen
-- Outlooks mit signal_id = null nicht miteinander kollidieren.
create unique index if not exists idx_outlooks_signal_unique
  on outlooks(signal_id) where signal_id is not null;
create index if not exists idx_outlooks_source on outlooks(user_id, source);


-- ============================================================
-- 4. JOURNAL + signals: RLS, Policies, updated_at-Trigger
-- ============================================================

do $$
declare t text;
begin
  foreach t in array array[
    'user_profiles','accounts','strategies','outlooks','trades','trade_screenshots',
    'transactions','backtest_sessions','fundamentals_notes','pair_notes','risk_settings',
    'user_preferences','user_watchlists','user_widget_settings',
    'cot_snapshots','cot_currency_analysis','cot_pair_signals','cot_weekly_snapshots',
    'signals'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "own_%s" on %I', t, t);
    execute format(
      'create policy "own_%s" on %I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t, t
    );
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'user_profiles','accounts','strategies','outlooks','trades','backtest_sessions',
    'fundamentals_notes','pair_notes','risk_settings','user_preferences','user_watchlists',
    'user_widget_settings','cot_currency_analysis','cot_pair_signals','signals'
  ]
  loop
    execute format('drop trigger if exists trg_%s_updated on %I', t, t);
    execute format(
      'create trigger trg_%s_updated before update on %I for each row execute function update_updated_at_column()',
      t, t
    );
  end loop;
end $$;


-- ============================================================
-- 5. JOURNAL — View + Hilfsfunktionen (aus 008)
-- ============================================================

create or replace view account_configs as
select
  id, user_id, type, name, broker,
  initial_balance as initial_start_balance,
  current_balance, currency, default_risk_per_trade, enable_goals,
  profit_target_value, profit_target_type, profit_target,
  max_drawdown_value, max_drawdown_type, max_drawdown,
  daily_drawdown_value, daily_drawdown_type,
  chapters, active_chapter_id, is_active, is_default,
  created_at, updated_at
from accounts
where is_default = true;

create or replace function get_account_total_r(
  p_account_id uuid, p_from_date text default null, p_to_date text default null
)
returns numeric as $$
  select coalesce(sum(r_multiple), 0)
  from trades
  where account_id = p_account_id and status = 'closed'
    and (p_from_date is null or date >= p_from_date)
    and (p_to_date   is null or date <= p_to_date)
$$ language sql stable;

create or replace function get_account_win_rate(
  p_account_id uuid, p_from_date text default null, p_to_date text default null
)
returns numeric as $$
  select case count(*) when 0 then 0
    else round(count(*) filter (where result = 'win') * 100.0 / count(*), 2) end
  from trades
  where account_id = p_account_id and status = 'closed' and result is not null
    and (p_from_date is null or date >= p_from_date)
    and (p_to_date   is null or date <= p_to_date)
$$ language sql stable;

create or replace function get_account_profit_factor(
  p_account_id uuid, p_from_date text default null, p_to_date text default null
)
returns numeric as $$
  select case
    when coalesce(abs(sum(r_multiple) filter (where r_multiple < 0)), 0) = 0 then null
    else round(
      coalesce(sum(r_multiple) filter (where r_multiple > 0), 0) /
      abs(sum(r_multiple) filter (where r_multiple < 0)), 2)
    end
  from trades
  where account_id = p_account_id and status = 'closed' and result is not null
    and (p_from_date is null or date >= p_from_date)
    and (p_to_date   is null or date <= p_to_date)
$$ language sql stable;


-- ============================================================
-- 6. TERMINAL — Tabellen (nur Service-Role; RLS ohne Policies)
--    1:1 aus frontend-next/supabase/schema.sql (P1 Terminal-Rebuild)
-- ============================================================

create table if not exists instruments (
  instrument   text primary key,          -- 'EUR_USD', 'XAU_USD', …
  display_name text not null,
  base_ccy     text,
  quote_ccy    text,
  kind         text not null check (kind in ('fx','commodity','index','crypto')),
  cftc_code    text                       -- Join-Schlüssel -> cot_reports
);
-- Nachrüstung: 'crypto' (BTC_USD) im kind-Check erlauben
alter table instruments drop constraint if exists instruments_kind_check;
alter table instruments add constraint instruments_kind_check
  check (kind in ('fx','commodity','index','crypto'));

create table if not exists price_daily (
  instrument text not null references instruments(instrument),
  date       date not null,
  open numeric, high numeric, low numeric,
  close numeric not null,
  volume     integer,
  primary key (instrument, date)
);
create index if not exists price_daily_date_idx on price_daily(date);

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

-- TFF-Report ("Traders in Financial Futures", futures-only): isoliert
-- Leveraged Funds (Hedgefonds) von Asset Managern — präziser für FX/BTC.
-- Nur Financial Futures (8 FX + DXY + BTC + SPX); Gold/Öl/Kupfer bleiben Legacy.
create table if not exists cot_tff_reports (
  contract_code   text not null,
  report_date     date not null,
  open_interest   integer,
  dealer_long integer,    dealer_short integer,
  asset_mgr_long integer, asset_mgr_short integer,
  lev_money_long integer, lev_money_short integer,
  other_long integer,     other_short integer,
  nonrept_long integer,   nonrept_short integer,
  primary key (contract_code, report_date)
);
create index if not exists cot_tff_reports_date_idx on cot_tff_reports(report_date);

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

create table if not exists sentiment_snapshots (
  pair        text not null,              -- 'EURUSD' (Myfxbook-Notation)
  captured_at timestamptz not null,
  long_pct numeric, short_pct numeric,
  long_positions integer, short_positions integer,
  long_volume numeric, short_volume numeric,
  primary key (pair, captured_at)
);

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

create table if not exists cb_meetings (
  bank                text not null,      -- 'FED','EZB','BOE','BOJ','SNB','RBA','RBNZ','BOC'
  meeting_date        date not null,
  expected_change_bps integer,
  actual_change_bps   integer,
  notes               text,
  primary key (bank, meeting_date)
);

create table if not exists cb_stance (
  bank         text primary key,
  stance_score numeric not null check (stance_score between -10 and 10),
  rationale    text,
  updated_at   timestamptz default now()
);

create table if not exists cron_runs (
  id     bigint generated always as identity primary key,
  job    text not null,
  ran_at timestamptz default now(),
  status text not null,                   -- 'ok'|'error'|'skipped'|'deferred'
  detail jsonb
);
create index if not exists cron_runs_ran_at_idx on cron_runs(ran_at desc);

-- Views (security_invoker => respektieren RLS der Basistabellen)
create or replace view monthly_closes
  with (security_invoker = true) as
select
  instrument,
  date_trunc('month', date)::date as month,
  (array_agg(close order by date desc))[1] as close
from price_daily
group by 1, 2;

create or replace view seasonality_stats
  with (security_invoker = true) as
with mr as (
  select
    instrument,
    month,
    close / nullif(lag(close) over (partition by instrument order by month), 0) - 1 as ret
  from monthly_closes
)
select
  instrument,
  extract(month from month)::int as cal_month,
  avg(ret) * 100 as avg_return,
  avg((ret > 0)::int) * 100 as hit_rate,
  count(ret) as n_years
from mr
where ret is not null
group by 1, 2;

-- RLS aktiv, KEINE Policies => Zugriff nur mit Service-Role-Key
alter table instruments         enable row level security;
alter table price_daily         enable row level security;
alter table cot_reports         enable row level security;
alter table cot_tff_reports     enable row level security;
alter table fred_series         enable row level security;
alter table fred_series_meta    enable row level security;
alter table sentiment_snapshots enable row level security;
alter table calendar_events     enable row level security;
alter table cb_meetings         enable row level security;
alter table cb_stance           enable row level security;
alter table cron_runs           enable row level security;


-- ============================================================
-- 7. Grants (RLS bleibt die eigentliche Zugriffskontrolle)
-- ============================================================

grant usage on schema public to anon, authenticated;
grant all on all tables    in schema public to authenticated;
grant all on all sequences in schema public to authenticated;
grant all on all routines  in schema public to authenticated;
