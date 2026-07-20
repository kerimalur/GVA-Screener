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
  strength_quintile int,        -- Stärke-Quintil 1..5 (5 = stärkstes Fünftel, Kandidat).
                                -- Position des Scores in seiner eigenen 156W-Verteilung,
                                -- kein Konfidenz-Mass, nicht validiert „handelbar".
                                -- (Umbenannt von confidence_quintile via Migration
                                --  rename_confidence_quintile_to_strength_quintile, 2026-07-20.)
  top_features jsonb,
  realized_return real,         -- nachgetragen wenn Horizont gereift
  hit boolean,
  created_at timestamptz not null default now(),
  primary key (week_start, ccy, model)
);

-- Factor-Track (Projekt B): ein Faktor je Woche × Währung × Horizont, forward
-- gereift. Generalisiert ml_weekly_rankings. Insert-only, kein Repaint.
create table if not exists factor_track (
  week_start date not null,
  factor text not null,          -- 'cot' | 'rates' | 'season' | 'ranking_baseline'
  ccy text not null,
  horizon int not null,          -- 1 | 4
  score real,                    -- Faktor-Score der Woche (Vorzeichen = Richtung)
  direction text,                -- 'long' | 'short' | 'neutral'
  realized_return real,          -- fwd_ret_{h}w (nachgetragen bei Reife)
  hit boolean,                   -- (realized_return > 0) == (score > 0)
  source text not null,          -- 'seed' | 'live'
  created_at timestamptz not null default now(),
  primary key (week_start, factor, ccy, horizon)
);
create index if not exists factor_track_factor_idx on factor_track (factor, horizon);

-- Aggregat für /ml/factor-lab: Trefferquote je (factor,horizon,source). Winzig
-- (≤ Faktoren×Horizonte×2 Zeilen) → umgeht die PostgREST-1000-Zeilen-Kappung,
-- sonst würden die wenigen source='live'-Zeilen nie im Roh-Response landen.
create or replace view factor_track_stats
with (security_invoker = true) as
select factor, horizon, source,
       count(*) filter (where hit) as hits,
       count(*) as n
from factor_track
where hit is not null
group by factor, horizon, source;

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
alter table factor_track enable row level security;

-- Nacht-Historie (Migration ml_engine_nights, angewandt 2026-07-16):
-- 1 Zeile pro Nacht, dauerhaft. Der Nightly-Runner upsertet nur die EIGENE
-- Nacht — alte Nächte werden nie überschrieben.
create table if not exists ml_engine_nights (
  night date primary key,
  done int not null default 0,
  failed int not null default 0,
  best_hall real,               -- bester hall_score der Nacht (OOS: mean_hitrate - std)
  best_config jsonb,            -- Config des besten Kandidaten
  runtime_min real,
  updated_at timestamptz not null default now()
);
alter table ml_engine_nights enable row level security;

-- Migration ml_engine_nights_stability (angewandt 2026-07-19, additiv):
-- Transparenz + stabile Linie (Spec 2026-07-19-ml-engine-stabilisierung).
-- mean/std gehoeren zum ROHEN Nacht-Besten (hall = mean - std);
-- stable_* ist die Hysterese-Linie (wechselt nur bei Marge ueber N Naechte).
alter table ml_engine_nights
  add column if not exists mean_hitrate real,
  add column if not exists std_hitrate real,
  add column if not exists stable_config jsonb,
  add column if not exists stable_score real;

-- Live-Sicht: aggregiert ml_experiments pro UTC-Nacht (deckt auch die laufende
-- Nacht ab, bevor der Runner seine Zusammenfassung schreibt).
-- 2026-07-19: mean_/std_hitrate des besten Experiments hinten angehaengt
-- (create or replace erlaubt nur Anfuegen). stable_* kann die View nicht
-- liefern (Hysterese ist zustandsbehaftet) — nur Tabelle.
create or replace view ml_engine_nights_live
with (security_invoker = true) as
select
  (created_at at time zone 'utc')::date        as night,
  count(*) filter (where status = 'done')      as done,
  count(*) filter (where status = 'failed')    as failed,
  count(*) filter (where status in ('queued', 'running')) as pending,
  max(hall_score) filter (where status = 'done') as best_hall,
  (array_agg(config order by hall_score desc nulls last)
     filter (where status = 'done' and hall_score is not null))[1] as best_config,
  round((coalesce(sum(runtime_s), 0) / 60.0)::numeric, 1) as runtime_min,
  ((array_agg(metrics order by hall_score desc nulls last)
     filter (where status = 'done' and hall_score is not null))[1]
     ->> 'mean_hitrate')::real as mean_hitrate,
  ((array_agg(metrics order by hall_score desc nulls last)
     filter (where status = 'done' and hall_score is not null))[1]
     ->> 'std_hitrate')::real as std_hitrate
from ml_experiments
group by 1;
