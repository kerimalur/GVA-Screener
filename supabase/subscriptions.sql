-- ============================================================
-- Subscriptions — Stripe-Integration
-- Im Supabase SQL-Editor ausführen (nach schema.sql).
-- ============================================================

create table if not exists subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id    text unique,
  stripe_subscription_id text unique,
  status                text not null default 'inactive',
  -- status values: active | inactive | past_due | canceled | trialing
  plan                  text not null default 'monthly',
  current_period_end    timestamptz,
  cancel_at_period_end  boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique(user_id)
);

create trigger trg_subscriptions_updated_at
  before update on subscriptions
  for each row execute function update_updated_at_column();

alter table subscriptions enable row level security;

-- User darf seine eigene Subscription-Zeile lesen (für Middleware-Check)
create policy "Users read own subscription"
  on subscriptions for select
  using (auth.uid() = user_id);

-- Service-Role schreibt via Webhook — keine weitere Policy nötig.
-- (Service-Role umgeht RLS automatisch.)
