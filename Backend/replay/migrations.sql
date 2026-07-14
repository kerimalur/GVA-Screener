-- Replay-Bewertungen: Kerims manuelle Trade-Entscheidungen + simulierte Ergebnisse.
-- RLS an, keine Policies -> nur Service-Role-Key (wie alle Daten-Tabellen).

CREATE TABLE IF NOT EXISTS backtest_replay (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  instrument TEXT NOT NULL,
  hit_date DATE NOT NULL,
  hit_level FLOAT NOT NULL,
  hit_direction TEXT NOT NULL,        -- "SHORT" oder "LONG"
  line_formed_date DATE NOT NULL,     -- wann die GVA-Linie gebildet wurde
  -- Fundamental-Snapshot
  fundamental_direction TEXT,          -- Verdict der Woche: "LONG"/"SHORT"/null
  fundamental_aligned_count INT,
  fundamental_factors JSONB,
  -- Kerims manuelle Bewertung
  trade_taken BOOLEAN,                -- hat er den Trade genommen?
  skip_reason TEXT,                   -- warum nicht? (optional)
  -- Trade-Ergebnis (nur wenn trade_taken = true)
  entry_price FLOAT,
  sl_price FLOAT,
  tp_price FLOAT,
  result TEXT,                        -- "WIN" / "LOSS" / "TIMEOUT"
  result_pips FLOAT,
  result_rr FLOAT,                    -- tatsächliches R:R (bei Timeout < 3)
  exit_date DATE,
  -- Meta
  notes TEXT,                         -- Kerims Notizen zum Trade
  UNIQUE(instrument, hit_date, hit_direction)
);

ALTER TABLE backtest_replay ENABLE ROW LEVEL SECURITY;

-- 2026-07-14: SL/TP/R:R-Simulation komplett entfernt (GVA_BACKTEST_ROADMAP.md
-- Phase 1). Replay speichert nur noch: Linie gebildet, gehittet, Preis, Bewertung.
ALTER TABLE backtest_replay
  DROP COLUMN IF EXISTS entry_price,
  DROP COLUMN IF EXISTS sl_price,
  DROP COLUMN IF EXISTS tp_price,
  DROP COLUMN IF EXISTS result,
  DROP COLUMN IF EXISTS result_pips,
  DROP COLUMN IF EXISTS result_rr,
  DROP COLUMN IF EXISTS exit_date;
