-- Journal um die MT5-Schluessel erweitern.
-- Einmalig im Supabase-SQL-Editor des Trading-Projekts (bpggwelpuvbkeudrqoiv).
--
-- mt5_setup_key ist der Schutz gegen Doppelte: "EURUSD-long-20260821T0930".
-- Nicht die Ticketnummer — ein Setup hat ZWEI Positionen und damit zwei
-- Tickets. Haenge der Schluessel an einem davon, wuerde ein Neustart der
-- Bruecke denselben Trade ein zweites Mal anlegen.

alter table trades add column if not exists mt5_setup_key text;
alter table trades add column if not exists mt5_tickets   bigint[];

-- Teil-Index: nur Zeilen MIT Schluessel muessen eindeutig sein. Alle von Hand
-- erfassten Trades haben dort NULL und bleiben davon unberuehrt — und in
-- Postgres kollidieren mehrere NULL ohnehin nicht.
create unique index if not exists trades_mt5_setup_key_idx
  on trades (mt5_setup_key) where mt5_setup_key is not null;

-- Damit die Bruecke offene Setups schnell wiederfindet.
create index if not exists trades_status_idx on trades (status);
