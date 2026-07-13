-- ML-Engine: Experiment-Queue, Champion, Wochen-Rankings, Holdout-Zugriffe
-- Projekt-Muster: RLS an, KEINE Policies → nur Service-Role-Key.

create table if not exists ml_experiments (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'done', 'failed')),
  config jsonb not null,
  metrics jsonb,
  hall_score real,              -- mean_hitrate - std_hitrate über OOS-Folds
  git_sha text,
  seed int,
  runtime_s real,
  error text
);
create index if not exists ml_experiments_status_idx on ml_experiments (status);
create index if not exists ml_experiments_hall_idx on ml_experiments (hall_score desc nulls last);

create table if not exists ml_champion (
  id bigint generated always as identity primary key,
  promoted_at timestamptz not null default now(),
  experiment_id bigint references ml_experiments (id),
  model_blob bytea,             -- joblib; NULL bei Baseline
  config jsonb not null,
  holdout_metrics jsonb,
  note text
);

create table if not exists ml_weekly_rankings (
  week_start date not null,
  ccy text not null,
  model text not null,          -- 'champion' | 'baseline'
  horizon int not null,
  score real,
  confidence_quintile int,      -- 1..5, 5 = handelbar
  top_features jsonb,
  realized_return real,         -- nachgetragen wenn Horizont gereift
  hit boolean,
  created_at timestamptz not null default now(),
  primary key (week_start, ccy, model)
);

create table if not exists ml_holdout_access (
  id bigint generated always as identity primary key,
  accessed_at timestamptz not null default now(),
  experiment_id bigint,
  result jsonb,
  note text
);

alter table ml_experiments enable row level security;
alter table ml_champion enable row level security;
alter table ml_weekly_rankings enable row level security;
alter table ml_holdout_access enable row level security;
