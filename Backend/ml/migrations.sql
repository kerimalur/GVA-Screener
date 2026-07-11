-- ML-Modul: Tabellen für Modelle + Predictions.
-- Manuell im Supabase SQL-Editor ausführen (Backend hat keinen Migrations-Runner).
--
-- ACHTUNG: ml_predictions existierte als Legacy-Tabelle aus dem FX-Terminal
-- (anderes Schema, user_id-basiert, 0 Zeilen) und wird hier ERSETZT.

DROP TABLE IF EXISTS ml_predictions;

CREATE TABLE IF NOT EXISTS ml_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  horizon INT NOT NULL,          -- 1, 2, 3 oder 4 (Wochen)
  model_blob BYTEA,              -- serialisiertes LightGBM-Modell (joblib)
  feature_names JSONB NOT NULL,  -- ["nc_net_percentile_1y_diff", ...]
  metrics JSONB NOT NULL,        -- {oos_acc, oos_auc, fold_details, feature_importance, ...}
  config JSONB NOT NULL,         -- Hyperparameter + Training-Config
  is_active BOOLEAN DEFAULT true -- nur das neueste Modell je Horizont aktiv
);

CREATE TABLE ml_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  model_id UUID REFERENCES ml_models(id),
  instrument TEXT NOT NULL,
  horizon INT NOT NULL,
  direction TEXT NOT NULL,       -- "LONG" oder "SHORT"
  probability FLOAT NOT NULL,
  week_start DATE NOT NULL,
  actual_direction TEXT,         -- nachträglich befüllt (Validierung)
  UNIQUE(model_id, instrument, week_start, horizon)
);

-- Wie alle Daten-Tabellen: RLS an, keine Policies -> nur service_role
ALTER TABLE ml_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_predictions ENABLE ROW LEVEL SECURITY;
