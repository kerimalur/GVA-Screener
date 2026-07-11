# ML-COT+Saisonalitäts-Modell — Claude Code Prompt

> Diesen Prompt direkt in Claude Code einfügen.

---

```markdown
## Kontext

GVA-Screener — privates FX-Trading-Tool.
- **Backend:** `Backend/` auf Render, FastAPI (Python). Enthält GVA-Scanner, OANDA-Anbindung, Telegram-Alerts. `main.py` ist der Einstiegspunkt, `fundamentals.py` hat FRED-Zugriff.
- **Frontend:** `frontend-next/` auf Vercel (Next.js 16). Enthält das ML-Labor (`lib/ml/`) mit Faktor-Matrix, Backtest, Health-Check.
- **Supabase** (Projekt `bpggwelpuvbkeudrqoiv`): `cot_reports` (Legacy NonComm), `cot_tff_reports` (TFF Leveraged Funds), `price_daily` (28 FX-Pairs, ab 2008), `fred_series` (Zinsen/Yields), `sentiment_snapshots`, `weekly_outlook_snapshots`.
- **Supabase-Zugriff im Backend:** Env-Vars `SUPABASE_URL` (oder `NEXT_PUBLIC_SUPABASE_URL`) und `SUPABASE_SERVICE_ROLE_KEY` — Muster siehe `supabase_signals.py`.

Aktueller Ansatz: regelbasierter Screener mit 5 Faktoren × binären Schwellen → ≥2 gleichgerichtete = Signal. **Backtest: ~50% Winrate (keine Edge).** Der beste Einzelfaktor (Saisonalität) schafft 55.7%, die beste Kombi (Zins+Saison) 57.9% bei 4W-Horizont.

**Ziel:** Ein echtes ML-Modell (LightGBM) das aus den **Rohdaten** von COT-Reports und Saisonalität lernt, die wahrscheinliche Direction für die nächsten 1–4 Wochen vorherzusagen. Das Modell soll deutlich mehr Informationen aus den Daten extrahieren als die heutigen Einzel-Schwellen.

## Aufgabe

Baue ein ML-Modul im Python-Backend (`Backend/ml/`) mit folgender Architektur:

### 1. Feature-Engineering (`Backend/ml/features.py`)

Lese die Rohdaten aus Supabase und extrahiere pro **Woche × Pair** folgende Features:

**COT-Features (pro Währung, dann Differenz Base−Quote = Pair-Feature):**
1. `net_percentile_1y` — Netto-Position als Perzentil der letzten 52 Wochen
2. `net_percentile_3y` — Netto-Position als Perzentil der letzten 156 Wochen
3. `net_percentile_5y` — Netto-Position als Perzentil der letzten 260 Wochen
4. `flow_1w_pct_oi` — Netto-Änderung 1 Woche in % Open Interest
5. `flow_4w_pct_oi` — Netto-Änderung 4 Wochen in % Open Interest
6. `flow_8w_pct_oi` — Netto-Änderung 8 Wochen in % Open Interest
7. `flow_13w_pct_oi` — Netto-Änderung 13 Wochen in % Open Interest
8. `flow_acceleration` — (4W-Flow aktuell) minus (4W-Flow vor 4 Wochen) → beschleunigt/bremst?
9. `streak_weeks` — Wochen mit gleichem Flow-Vorzeichen in Folge
10. `comm_vs_nc_divergence` — Differenz der 4W-Flows (Commercials minus Non-Commercials, % OI). Positiv = Hedger akkumulieren während Specs verkaufen → potenzielles Reversal.
11. `oi_change_4w_pct` — Open-Interest-Veränderung 4W in % → neue Positionen (expandierend) vs. Liquidation (schrumpfend)

Für jedes Pair: Base-Feature minus Quote-Feature ergibt das Pair-Level-COT-Feature (11 Features × 2 Varianten [Legacy NC + TFF Leveraged] = 22 COT-Features je Pair, PLUS die 11 Divergenz-Features = **33 COT-Features**).

**Saisonalitäts-Features (pro Pair):**
12. `month` — aktueller Monat (1–12), one-hot-encoded (12 Features)
13. `month_avg_return` — historischer Ø-Return dieses Pairs in diesem Monat (über alle verfügbaren Jahre bis zum Stichtag — as-of, kein Lookahead!)
14. `month_hitrate` — historische Hitrate dieses Pairs in diesem Monat (as-of)
15. `week_of_month` — Woche 1–5 im Monat (Quartalsende-Effekte, Monatsanfang-Flows)
16. `is_quarter_end` — Boolean: ist es die letzte Woche eines Quartals?
17. `half_year` — H1 (Jan–Jun) vs. H2 (Jul–Dez)

**Gesamt: ~50 Features pro Woche × Pair.**

**Target-Variable:**
- `direction_Nw` — Binär: Kurs in N Wochen höher (1 = LONG) oder niedriger (0 = SHORT). Vier Targets: N ∈ {1, 2, 3, 4}.
- Berechnet aus `price_daily`: Close am Montag der Signal-Woche vs. erster Close am/nach Montag + N×7 Tage (Toleranz 5 Tage für Feiertage).

**As-of-Sicherheit (KRITISCH):**
- Alle Features MÜSSEN strikt as-of berechnet werden: für eine Woche mit Start-Montag X dürfen nur Daten verwendet werden mit Datum ≤ X.
- COT-Reports (Dienstag-Stichtag, Freitag-Veröffentlichung): der Report einer Woche ist am folgenden Montag verfügbar → as-of-sicher.
- Saisonalitäts-Statistiken: Rolling berechnen (nur Jahre < aktuelles Jahr für Monats-Ø, KEIN Lookahead auf den aktuellen Monat).
- Perzentile: Rolling-Fenster, das am jeweiligen Stichtag endet.

### 2. Modell-Training (`Backend/ml/train.py`)

**Modell:** LightGBM (Gradient Boosted Trees) — `pip install lightgbm`.

**Walk-Forward-Validation (PFLICHT):**
- Training-Window: 156 Wochen (3 Jahre)
- Test-Window: 52 Wochen (1 Jahr)
- Step: 26 Wochen (halbes Jahr vorwärts schieben)
- → Bei 900 Wochen Daten: ~25 Folds
- Pro Fold: trainiere auf Training-Window, teste auf Test-Window.
- **KEIN Pair-Leakage:** Alle Pairs im selben Fold (nicht Pair A trainieren, Pair B testen — die Pairs sind korreliert).
- Output pro Fold: OOS-Accuracy, OOS-AUC, OOS-Winrate, n, Calibration (vorhergesagte vs. tatsächliche Wahrscheinlichkeit).

**Hyperparameter (konservativ, Overfitting vermeiden):**
- `n_estimators`: 100–300 (nicht mehr, Datensatz ist klein)
- `max_depth`: 3–5 (flache Bäume = weniger Overfitting)
- `min_child_samples`: 50–100 (große Blätter)
- `learning_rate`: 0.05–0.1
- `subsample`: 0.7–0.8
- `colsample_bytree`: 0.7–0.8
- `reg_alpha` + `reg_lambda`: 0.1–1.0 (L1/L2-Regularisierung)
- Hyperparameter-Tuning: simple Grid-Search über die Walk-Forward-Folds (optimiere Ø OOS-AUC, NICHT In-Sample).

**Trainiere 4 separate Modelle** (je ein Target-Horizont: 1W, 2W, 3W, 4W).

**Feature Importance:** nach Training `model.feature_importance(importance_type='gain')` speichern — zeigt welche Features tatsächlich prädiktiv sind.

### 3. Modell-Persistierung und Inference (`Backend/ml/predict.py`)

- Trainiertes Modell speichern als `.pkl` (joblib) ODER Modell-Weights + Feature-Names als JSON in Supabase-Tabelle `ml_models` (id, created_at, horizon, model_blob BYTEA, feature_names JSONB, metrics JSONB, config JSONB).
- Inference-Funktion: nimmt aktuelles Pair + aktuelle COT/Saison-Daten → gibt `{direction: "LONG"|"SHORT", probability: 0.0–1.0, confidence: "high"|"medium"|"low"}` zurück.
- Confidence-Schwellen: probability ≥ 0.58 = high, ≥ 0.54 = medium, darunter = low (kein Signal).

### 4. API-Endpunkte (`Backend/ml/routes.py` + Integration in `main.py`)

Registriere die ML-Routen in `main.py` als eigenen APIRouter:

```python
from ml.routes import ml_router
app.include_router(ml_router, prefix="/ml")
```

**Endpunkte:**

- `POST /ml/train` — Startet Training (alle 4 Horizonte). Gibt sofort Job-ID zurück, Training läuft im Background-Thread. Ergebnis in `ml_models`-Tabelle.
- `GET /ml/status` — Status des letzten Trainings (running/done/error + Metriken).
- `GET /ml/predict?pair=EUR_USD&horizon=2` — Prediction für ein Pair (nutzt neuestes Modell). Liest aktuelle COT/Preis-Daten aus Supabase, berechnet Features, gibt Direction + Probability zurück.
- `GET /ml/predict-all?horizon=2` — Predictions für alle 28 Pairs.
- `GET /ml/report` — Walk-Forward-Report: OOS-Winrate pro Fold, Feature Importance Top 15, Calibration-Plot-Daten (als JSON, nicht als Bild).
- `GET /ml/feature-importance?horizon=2` — Feature Importance sortiert.

### 5. Supabase-Tabellen (Migrationen)

Erstelle die nötigen Tabellen. Da das Backend keinen Migrations-Runner hat, erstelle ein SQL-File `Backend/ml/migrations.sql` das manuell in Supabase ausgeführt werden kann:

```sql
-- ML-Modelle (trainierte Weights)
CREATE TABLE IF NOT EXISTS ml_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  horizon INT NOT NULL,          -- 1, 2, 3, oder 4 (Wochen)
  model_blob BYTEA,              -- serialisiertes LightGBM-Modell
  feature_names JSONB NOT NULL,  -- ["net_percentile_1y_diff", ...]
  metrics JSONB NOT NULL,        -- {oos_winrate, oos_auc, oos_n, fold_details, ...}
  config JSONB NOT NULL,         -- Hyperparameter + Training-Config
  is_active BOOLEAN DEFAULT true -- nur das neueste Modell pro Horizont aktiv
);

-- ML-Predictions (optional, für Tracking)
CREATE TABLE IF NOT EXISTS ml_predictions (
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
```

### 6. Frontend-Integration (minimal, aber nützlich)

Auf der bestehenden `/ml`-Seite im Next.js-Frontend eine neue Sektion "ML-Modell" einbauen:

- API-URL: `process.env.NEXT_PUBLIC_BACKEND_URL` (zeigt auf Render-Backend, z.B. `https://gva-screener.onrender.com`).
- Anzeige: letzte Predictions aller 28 Pairs als Tabelle (Pair, Direction, Probability, Confidence). Farbig: high confidence = kräftige Farbe, low = ausgegraut.
- Button "Training starten" → ruft `/ml/train` auf.
- Feature Importance als horizontales Balkendiagramm (Top 15 Features, farbcodiert nach Kategorie: COT-blau, Saison-grün).
- Walk-Forward-Report: OOS-Winrate pro Fold als Sparkline/Mini-Chart, Ø OOS-Winrate groß angezeigt.

## Anforderungen

- **Python 3.10+**, Dependencies: `lightgbm`, `scikit-learn`, `numpy`, `pandas`, `joblib`, `requests` (für Supabase REST-API, wie in `supabase_signals.py`).
- Supabase-Zugriff im Backend über REST-API (wie `supabase_signals.py` es macht — Env-Vars `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`), NICHT über das Python-SDK.
- Bestehende Backend-Dateien (`main.py`, `analyzer.py`, `data_pipeline.py`, `fundamentals.py`, `macro.py`, `supabase_signals.py`) **NICHT verändern** außer dem Hinzufügen des Router-Imports in `main.py`.
- Alle neuen Dateien in `Backend/ml/` (mit `__init__.py`).
- Walk-Forward-Validation MUSS strikt temporal sein: kein Datenpunkt aus der Zukunft darf im Training landen.
- Training kann langsam sein (5–15 Minuten), das ist OK — läuft on-demand, nicht im Cron.
- Modell-Größe: LightGBM-Modelle sind typisch <1 MB — passt in BYTEA-Spalte.
- Feature-Engineering muss robust mit fehlenden Daten umgehen: wenn COT für eine Währung fehlt → Feature = NaN, LightGBM handhabt NaN nativ.
- **Render-Deployment:** `requirements.txt` im `Backend/`-Ordner updaten mit den neuen Dependencies.
- Frontend-Komponente: gleiches Styling wie `LaborExplorer.tsx` (text-up/text-down/text-muted/text-faint, bg-surface2, border-border, font-mono).

## Akzeptanzkriterien

1. `Backend/ml/features.py` extrahiert ~50 Features pro Woche × Pair aus Supabase, strikt as-of.
2. `Backend/ml/train.py` trainiert 4 LightGBM-Modelle (je Horizont) mit Walk-Forward-Validation (~25 Folds).
3. Ø OOS-Winrate ist im Report sichtbar. Das Modell muss nicht sofort >55% schaffen — aber der Walk-Forward-Report muss klar zeigen, ob es Edge gibt oder nicht. Kein In-Sample-Ergebnis als Erfolg verkaufen.
4. `POST /ml/train` startet Training im Background, `GET /ml/status` zeigt Fortschritt.
5. `GET /ml/predict?pair=EUR_USD&horizon=2` gibt Direction + Probability zurück.
6. `GET /ml/report` gibt Walk-Forward-Metriken als JSON zurück.
7. Feature Importance zeigt die Top-15-Features — so sehe ich, ob COT- oder Saison-Features dominieren.
8. Frontend zeigt Predictions-Tabelle + Feature Importance + Walk-Forward-Report.
9. `npm run build` im Frontend und Backend-Start (`uvicorn main:app`) laufen fehlerfrei.
10. Keine Änderungen an bestehenden Dateien außer Router-Import in `main.py` und Dependencies in `requirements.txt`.
```

---

## Ergänzende Hinweise (nicht im Prompt, für Kerims Verständnis)

### Warum LightGBM und nicht ein neuronales Netz?
- 25.200 Samples (900W × 28 Pairs) ist zu wenig für Deep Learning
- LightGBM ist State-of-the-Art für tabellarische Daten dieser Größe
- Interpretierbar: Feature Importance zeigt dir WARUM das Modell so entscheidet
- Schnell: Training in Minuten, nicht Stunden

### Warum ~50 Features statt 5?
Dein aktueller Screener extrahiert pro Faktor EINE Zahl (z.B. COT-Flow ±4). Aber die COT-Rohdaten enthalten viel mehr Information:
- Flow-Acceleration zeigt ob der Trend beschleunigt oder abbremst
- Commercial vs. NC Divergenz ist ein klassisches Reversal-Signal
- OI-Veränderung unterscheidet echte Positionierung von Liquidation
- Mehrere Perzentil-Fenster (1Y/3Y/5Y) fangen unterschiedliche Regime ab

LightGBM kann nicht-lineare Interaktionen zwischen diesen Features lernen, die eine einfache Schwellenwert-Regel nie finden würde.

### Realistische Erwartungen
- OOS-Winrate von 53–57% bei FX ist bereits eine **echte Edge**
- Alles über 55% bei einem Walk-Forward über 17 Jahre wäre sehr stark
- Wenn das Modell bei 50–51% OOS landet: die Features allein reichen nicht, und wir müssen weitere Datenquellen ergänzen (Zinsen, Yields, Risk-Regime)
- Feature Importance wird zeigen, ob COT oder Saisonalität den größeren Beitrag leistet — das informiert den nächsten Schritt
