-- ============================================================
-- outlooks ↔ signals verkoppeln  (2026-07-20)
-- ============================================================
-- Einmalig im Supabase-SQL-Editor ausführen. Identisch zum Block "3b" in
-- schema.sql — dort steht es für den Neuaufbau, hier für die laufende DB.
--
-- Rein additiv:
--   * keine Zeile wird gelöscht oder umgeschrieben
--   * Bestandszeilen erhalten source='manual' (Spalten-Default) und
--     signal_id=null und funktionieren unverändert weiter
--   * es wird KEIN Outlook für historische Signale erzeugt — ein Backfill
--     über die Historie würde den Outlook mit alten, längst erledigten
--     Setups fluten. Nur neue Hits ab Deploy legen automatisch einen an.
--
-- signals.status behält seine vier technischen Werte
-- ('new','watchlist','journaled','dismissed'). Der Backend-Lebenszyklus
-- (TRIGGERED_STATUSES / CONSUMED_STATUSES) liest exakt diese Werte.

alter table outlooks add column if not exists signal_id uuid
  references signals(id) on delete set null;
alter table outlooks add column if not exists source text not null default 'manual';

-- Höchstens EIN Outlook je Signal. Partiell, damit die vielen manuellen
-- Outlooks mit signal_id = null nicht miteinander kollidieren.
create unique index if not exists idx_outlooks_signal_unique
  on outlooks(signal_id) where signal_id is not null;
create index if not exists idx_outlooks_source on outlooks(user_id, source);
