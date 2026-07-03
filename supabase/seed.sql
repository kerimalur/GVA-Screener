-- ============================================================
-- FX Terminal — Seeds (nach schema.sql ausführen)
-- ============================================================

-- 33 Instrumente (28 FX + Gold, WTI, Brent, Kupfer, S&P 500)
insert into instruments (instrument, display_name, base_ccy, quote_ccy, kind, cftc_code) values
  ('EUR_USD','EUR/USD','EUR','USD','fx','099741'),
  ('GBP_USD','GBP/USD','GBP','USD','fx','096742'),
  ('USD_JPY','USD/JPY','USD','JPY','fx','097741'),
  ('AUD_USD','AUD/USD','AUD','USD','fx','232741'),
  ('USD_CAD','USD/CAD','USD','CAD','fx','090741'),
  ('USD_CHF','USD/CHF','USD','CHF','fx','092741'),
  ('NZD_USD','NZD/USD','NZD','USD','fx','112741'),
  ('EUR_JPY','EUR/JPY','EUR','JPY','fx',null),
  ('GBP_JPY','GBP/JPY','GBP','JPY','fx',null),
  ('EUR_GBP','EUR/GBP','EUR','GBP','fx',null),
  ('AUD_JPY','AUD/JPY','AUD','JPY','fx',null),
  ('CAD_JPY','CAD/JPY','CAD','JPY','fx',null),
  ('CHF_JPY','CHF/JPY','CHF','JPY','fx',null),
  ('EUR_AUD','EUR/AUD','EUR','AUD','fx',null),
  ('EUR_CAD','EUR/CAD','EUR','CAD','fx',null),
  ('EUR_CHF','EUR/CHF','EUR','CHF','fx',null),
  ('EUR_NZD','EUR/NZD','EUR','NZD','fx',null),
  ('GBP_AUD','GBP/AUD','GBP','AUD','fx',null),
  ('GBP_CAD','GBP/CAD','GBP','CAD','fx',null),
  ('GBP_CHF','GBP/CHF','GBP','CHF','fx',null),
  ('GBP_NZD','GBP/NZD','GBP','NZD','fx',null),
  ('AUD_CAD','AUD/CAD','AUD','CAD','fx',null),
  ('AUD_CHF','AUD/CHF','AUD','CHF','fx',null),
  ('AUD_NZD','AUD/NZD','AUD','NZD','fx',null),
  ('CAD_CHF','CAD/CHF','CAD','CHF','fx',null),
  ('NZD_CAD','NZD/CAD','NZD','CAD','fx',null),
  ('NZD_CHF','NZD/CHF','NZD','CHF','fx',null),
  ('NZD_JPY','NZD/JPY','NZD','JPY','fx',null),
  ('XAU_USD','Gold','XAU','USD','commodity','088691'),
  ('WTICO_USD','WTI Öl','WTI','USD','commodity','067651'),
  ('BCO_USD','Brent Öl','BCO','USD','commodity',null),
  ('XCU_USD','Kupfer','XCU','USD','commodity','085692'),
  ('SPX500_USD','S&P 500','SPX','USD','index','13874A')
on conflict (instrument) do update set
  display_name = excluded.display_name,
  base_ccy = excluded.base_ccy,
  quote_ccy = excluded.quote_ccy,
  kind = excluded.kind,
  cftc_code = excluded.cftc_code;

-- Hawkish/Dovish-Startwerte (Score 0 = neutral; im Table Editor pflegen)
insert into cb_stance (bank, stance_score, rationale) values
  ('FED', 0, 'Initial — bitte anhand letzter FOMC-Statements pflegen'),
  ('EZB', 0, 'Initial — bitte anhand letzter EZB-Statements pflegen'),
  ('BOE', 0, 'Initial'),
  ('BOJ', 0, 'Initial'),
  ('SNB', 0, 'Initial'),
  ('RBA', 0, 'Initial'),
  ('RBNZ', 0, 'Initial'),
  ('BOC', 0, 'Initial')
on conflict (bank) do nothing;

-- Zentralbank-Sitzungen H2-2026.
-- FOMC-Termine: offizieller Kalender. Übrige: Schätzung nach üblichem Rhythmus —
-- bitte im Table Editor gegen offizielle Kalender prüfen (notes beachten).
insert into cb_meetings (bank, meeting_date, expected_change_bps, notes) values
  ('FED',  '2026-07-29', 0, 'FOMC — offizieller Kalender'),
  ('FED',  '2026-09-16', 0, 'FOMC — offizieller Kalender'),
  ('FED',  '2026-10-28', 0, 'FOMC — offizieller Kalender'),
  ('FED',  '2026-12-09', 0, 'FOMC — offizieller Kalender'),
  ('EZB',  '2026-07-23', 0, 'Termin unbestätigt — bitte prüfen'),
  ('EZB',  '2026-09-10', 0, 'Termin unbestätigt — bitte prüfen'),
  ('EZB',  '2026-10-29', 0, 'Termin unbestätigt — bitte prüfen'),
  ('EZB',  '2026-12-17', 0, 'Termin unbestätigt — bitte prüfen'),
  ('BOE',  '2026-08-06', 0, 'Termin unbestätigt — bitte prüfen'),
  ('BOE',  '2026-09-17', 0, 'Termin unbestätigt — bitte prüfen'),
  ('BOE',  '2026-11-05', 0, 'Termin unbestätigt — bitte prüfen'),
  ('BOE',  '2026-12-17', 0, 'Termin unbestätigt — bitte prüfen'),
  ('BOJ',  '2026-07-31', 0, 'Termin unbestätigt — bitte prüfen'),
  ('BOJ',  '2026-09-18', 0, 'Termin unbestätigt — bitte prüfen'),
  ('BOJ',  '2026-10-30', 0, 'Termin unbestätigt — bitte prüfen'),
  ('BOJ',  '2026-12-18', 0, 'Termin unbestätigt — bitte prüfen'),
  ('SNB',  '2026-09-24', 0, 'Termin unbestätigt — bitte prüfen'),
  ('SNB',  '2026-12-17', 0, 'Termin unbestätigt — bitte prüfen'),
  ('RBA',  '2026-08-11', 0, 'Termin unbestätigt — bitte prüfen'),
  ('RBA',  '2026-09-29', 0, 'Termin unbestätigt — bitte prüfen'),
  ('RBA',  '2026-11-03', 0, 'Termin unbestätigt — bitte prüfen'),
  ('RBA',  '2026-12-08', 0, 'Termin unbestätigt — bitte prüfen'),
  ('RBNZ', '2026-08-19', 0, 'Termin unbestätigt — bitte prüfen'),
  ('RBNZ', '2026-10-07', 0, 'Termin unbestätigt — bitte prüfen'),
  ('RBNZ', '2026-11-25', 0, 'Termin unbestätigt — bitte prüfen'),
  ('BOC',  '2026-07-29', 0, 'Termin unbestätigt — bitte prüfen'),
  ('BOC',  '2026-09-09', 0, 'Termin unbestätigt — bitte prüfen'),
  ('BOC',  '2026-10-28', 0, 'Termin unbestätigt — bitte prüfen'),
  ('BOC',  '2026-12-09', 0, 'Termin unbestätigt — bitte prüfen')
on conflict (bank, meeting_date) do nothing;
