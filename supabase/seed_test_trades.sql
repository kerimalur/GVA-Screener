-- ============================================================
-- 20 Test-Trades fuer Dashboard-Vorschau
-- Ausfuehren in: Supabase SQL Editor (kerimtrades.ssg Account)
-- Zuerst alte loeschen falls schon drin:
-- DELETE FROM trades WHERE notes LIKE '%BOS%' OR notes LIKE '%Value Area%' OR notes LIKE '%GVA%';
-- ============================================================

DO $$
DECLARE
  uid uuid;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE email = 'kerim.alur@gmail.com' LIMIT 1;
  IF uid IS NULL THEN
    RAISE EXCEPTION 'User nicht gefunden. E-Mail anpassen.';
  END IF;

  INSERT INTO trades (
    user_id, type, symbol, side, date, result,
    r_multiple, risk_percent, risk_amount, profit_amount, pnl,
    entry_price, exit_price, stop_loss, take_profit,
    lot_size, account_balance_before, account_balance_after, running_balance,
    setup_daily_bos, setup_value_area, session_type, session, notes
  ) VALUES
  (uid,'ek','EUR/USD','long', '2026-04-03','win',      2.00, 1.0, 100,  200,  200, 1.07850,1.08050,1.07750,1.08250,0.10,10000,10200,10200,true, false,'live','london',  'Starker BOS am H4'),
  (uid,'ek','GBP/USD','short','2026-04-07','win',      1.50, 1.0, 100,  150,  150, 1.26400,1.26250,1.26500,1.26100,0.10,10200,10350,10350,false,true, 'live','london',  'Value Area rejection'),
  (uid,'ek','USD/JPY','long', '2026-04-10','loss',    -1.00, 1.0, 100, -100, -100,151.200,151.100,151.100,151.700,0.10,10350,10250,10250,false,false,'live','new_york', 'SL getriggert vor NY open'),
  (uid,'ek','EUR/USD','short','2026-04-14','win',      2.50, 1.0, 100,  250,  250, 1.08120,1.07870,1.08220,1.07620,0.10,10250,10500,10500,true, true, 'live','london',  'GVA + BOS Combo'),
  (uid,'ek','AUD/USD','long', '2026-04-17','breakeven',0.00, 1.0, 100,    0,    0, 0.63750,0.63750,0.63650,0.64050,0.10,10500,10500,10500,false,false,'live','asia',    'Move to BE dann SL'),
  (uid,'ek','GBP/JPY','short','2026-04-22','loss',    -1.00, 1.0, 100, -100, -100,191.500,191.600,191.600,190.900,0.10,10500,10400,10400,false,true, 'live','london',  'Gegentrend zu frueh'),
  (uid,'ek','USD/CHF','long', '2026-04-25','win',      1.00, 1.0, 100,  100,  100, 0.90150,0.90250,0.90050,0.90350,0.10,10400,10500,10500,true, false,'live','new_york','1:1 sauber mitgenommen'),
  (uid,'ek','GBP/USD','long', '2026-05-06','win',      3.00, 1.0, 100,  300,  300, 1.25800,1.26100,1.25700,1.26400,0.10,10500,10800,10800,true, true, 'live','london',  'Perfekter BOS + Value'),
  (uid,'ek','EUR/USD','long', '2026-05-09','loss',    -1.00, 1.0, 100, -100, -100, 1.07600,1.07500,1.07500,1.08000,0.10,10800,10700,10700,false,false,'live','london',  'Fehlausbruch'),
  (uid,'ek','NZD/USD','short','2026-05-13','win',      2.00, 1.0, 100,  200,  200, 0.59800,0.59600,0.59900,0.59400,0.10,10700,10900,10900,true, false,'live','asia',    'Asia Session Momentum'),
  (uid,'ek','USD/JPY','short','2026-05-16','win',      1.50, 1.0, 100,  150,  150,155.400,155.250,155.500,155.100,0.10,10900,11050,11050,false,true, 'live','london',   'H4 Struktur short'),
  (uid,'ek','EUR/USD','long', '2026-05-21','win',      2.00, 1.0, 100,  200,  200, 1.08300,1.08500,1.08200,1.08700,0.10,11050,11250,11250,true, true, 'live','new_york', 'NFP Reaktion'),
  (uid,'ek','GBP/USD','short','2026-05-27','loss',    -1.00, 1.0, 100, -100, -100, 1.27200,1.27300,1.27300,1.26800,0.10,11250,11150,11150,false,false,'live','london',  'Gegentrend verloren'),
  (uid,'ek','AUD/USD','long', '2026-05-30','win',      2.50, 1.0, 100,  250,  250, 0.64200,0.64450,0.64100,0.64700,0.10,11150,11400,11400,true, false,'live','asia',    'RBA hawkish'),
  (uid,'ek','USD/CHF','short','2026-06-04','breakeven',0.00, 1.0, 100,    0,    0, 0.89900,0.89900,0.90000,0.89600,0.10,11400,11400,11400,false,true, 'live','london',  'BE gesetzt bei 0.5R'),
  (uid,'ek','GBP/JPY','long', '2026-06-09','win',      1.50, 1.0, 100,  150,  150,196.200,196.350,196.100,196.500,0.10,11400,11550,11550,true, true, 'live','london',   'Bullischer Tag'),
  (uid,'ek','EUR/USD','short','2026-06-13','loss',    -1.00, 1.0, 100, -100, -100, 1.08900,1.09000,1.09000,1.08500,0.10,11550,11450,11450,false,false,'live','new_york', 'CPI Spike gegen mich'),
  (uid,'ek','USD/JPY','long', '2026-06-19','win',      2.00, 1.0, 100,  200,  200,157.500,157.700,157.400,157.900,0.10,11450,11650,11650,true, false,'live','london',   'BOJ dovish bleibt'),
  (uid,'ek','NZD/USD','long', '2026-07-02','win',      1.00, 1.0, 100,  100,  100, 0.61500,0.61600,0.61400,0.61700,0.10,11650,11750,11750,false,true, 'live','asia',    'Range Breakout'),
  (uid,'ek','GBP/USD','long', '2026-07-07','win',      2.00, 1.0, 100,  200,  200, 1.27500,1.27700,1.27400,1.27900,0.10,11750,11950,11950,true, true, 'live','london',  'Wochenauftakt Long');

  RAISE NOTICE 'OK: 20 Test-Trades eingefuegt';
END $$;

-- Loeschen:
-- DELETE FROM trades WHERE user_id = (SELECT id FROM auth.users WHERE email = 'kerim.alur@gmail.com') AND date >= '2026-04-01' AND date <= '2026-07-08';
