-- Replay: Sessions (pausieren/abschliessen/auswerten) + as-of-Ranking je Bewertung
-- Anwenden: Supabase SQL-Editor oder MCP apply_migration (Name: replay_sessions_und_ranking)
alter table backtest_replay
  add column if not exists ranking_bias text,     -- 'long' | 'short' | 'neutral' relativ zum Pair
  add column if not exists ranking_detail jsonb,  -- {base:{ccy,score,quintile}, quote:{...}, week_start}
  add column if not exists session_id bigint;

create table if not exists replay_sessions (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name text not null,
  pair text not null,
  date_from date not null,
  date_to date not null,
  status text not null default 'active' check (status in ('active', 'paused', 'done')),
  finished_at timestamptz,
  notes text
);
create index if not exists backtest_replay_session_idx on backtest_replay (session_id);
alter table replay_sessions enable row level security;

-- 2026-07-14: pro Session gespeicherte GVA-Erkennungs-Toleranz (reproduzierbar).
-- Neue Sessions erben den globalen Kalibrier-Default (Frontend/localStorage);
-- Defaults hier = Live-Scanner-Konstanten. Migration: replay_sessions_gva_tuning
alter table replay_sessions
  add column if not exists tol_pct real not null default 0.15,
  add column if not exists size_factor real not null default 1.4;

-- 2026-07-14: Session-Wahl mit/ohne fundamentale Konfluenz (Bias as-of HIT-Datum).
-- false = rein technischer Durchgang. Migration: replay_sessions_with_fundamentals
alter table replay_sessions
  add column if not exists with_fundamentals boolean not null default true;
