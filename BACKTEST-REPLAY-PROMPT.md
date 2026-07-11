# GVA Backtest-Replay-Tool — Konzept & Claude Code Prompt

## Konzept: Warum "Replay" und nicht "Backtest"

Kerims Setup ist semi-manuell: GVA-Hit → BOS prüfen → Fib-Level → Volumen in Entry-Box → Fundamentals. Ein automatischer Backtest kann BOS/Fib/Volumen nicht bewerten — das braucht Augenurteil auf dem Chart.

**Lösung: ein Replay-Tool das zwei Dinge leistet:**
1. **GVA-Hits historisch rekonstruieren** (automatisch, mit dem bestehenden Algorithmus)
2. **Fundamental-Snapshot zu jedem Hit-Zeitpunkt zeigen** (as-of, kein Lookahead)

Kerim öffnet dann pro Hit den Chart in TradingView, prüft manuell BOS/Fib/Volumen, und loggt: "Hätte ich diesen Trade genommen? → Ja/Nein → Ergebnis bei 1:3 R:R".

Das ergibt seine **ehrliche Winrate**: nur Trades die er tatsächlich genommen hätte, mit den Confluences die damals wirklich vorlagen.

### Workflow im Tool
1. Pair + Zeitraum wählen (z.B. EURUSD, Jan–Jun 2022)
2. Tool zeigt: alle GVA-Hits in dem Zeitraum (Datum, Level, Short/Long)
3. Pro Hit: Fundamental-Snapshot (alle 5 Faktoren, so wie sie damals standen)
4. Kerim öffnet Chart, prüft manuell, klickt "Trade genommen ✓" oder "Skip ✗"
5. Bei "genommen": automatisch Ergebnis berechnen (1:3 R:R gegen Preisverlauf)
6. Am Ende: Statistik über alle bewerteten Trades

---

## Claude Code Prompt

```markdown
## Kontext

GVA-Screener — privates FX-Trading-Tool.
- **Backend:** `Backend/` auf Render, FastAPI (Python). `analyzer.py` enthält `analyze_gva_zones()` — erkennt GVA-Kerzenmuster auf 3D-Kerzen. `data_pipeline.py` enthält `fetch_and_resample_3d()` — holt Daily-Kerzen von OANDA und resampled auf 3-Tages-Kerzen mit Business-Day-Matrix (Anker 21.04.2026).
- **Frontend:** `frontend-next/` auf Vercel (Next.js 16). ML-Sektion unter `app/(app)/ml/`.
- **Supabase:** `price_daily` (28 FX-Pairs, ab 2008), `cot_reports`, `cot_tff_reports`, `fred_series`, `weekly_outlook_snapshots` (Fundamental-Verdicts, 416 Wochen Backfill).

**GVA-Erkennung:** In `analyzer.py` — sucht auf 3D-Kerzen nach dem Muster: vorherige Kerze bullisch + aktuelle Kerze bearisch (oder umgekehrt), Gap-Toleranz ≤2.5 Pips, aktuelle Body ≥1.3× vorherige Body. Die GVA-Linie liegt auf dem Open der Signal-Kerze. Wenn eine spätere Kerze die Linie berührt → "Hit".

**Kerims Trading-Setup:** GVA-Hit ist nur der erste Filter. Danach prüft er manuell: BOS (Break of Structure), Fib-Retracement, Volumen in der Entry-Box. Die Fundamentals (COT, Saisonalität, Zinsen, Yields, Sentiment) müssen in die gleiche Richtung zeigen. Nur wenn ALLES stimmt → Trade mit 1:3 Risk:Reward.

**Ziel:** Ein Replay-Tool das historische GVA-Hits rekonstruiert, den Fundamental-Snapshot zu jedem Hit-Zeitpunkt zeigt, und Kerim ermöglicht, manuell zu bewerten ob er den Trade genommen hätte — um seine echte Winrate zu ermitteln.

## Aufgabe

### 1. Historische GVA-Hit-Rekonstruktion (`Backend/replay/gva_history.py`)

Rekonstruiere GVA-Hits aus den historischen Preisdaten:

- Lade `price_daily` aus Supabase für das gewählte Pair und den Zeitraum (+ 6 Monate Vorlauf für Musterbildung).
- Resample auf 3D-Kerzen mit EXAKT derselben Business-Day-Matrix wie `data_pipeline.py` (Anker `2026-04-21`, `np.busday_count // 3`). KRITISCH: die 3D-Kerzen müssen identisch sein, sonst stimmen die Linien nicht.
- Wende `analyze_gva_zones()` an — aber modifiziert: statt nur die aktuell aktiven Linien zurückzugeben, speichere JEDEN Hit (Zeitpunkt an dem eine Linie berührt wird) mit: Hit-Datum, Line-Level, Line-Formation-Datum, Richtung (SHORT/LONG).
- Output: Liste aller Hits im Zeitraum, chronologisch.

**Wichtig:** Nutze `price_daily` aus Supabase statt Live-OANDA-Daten (OANDA-API hat nur begrenzte Historie). Das Resampling muss trotzdem identisch sein.

### 2. Fundamental-Snapshot-Rekonstruktion (Frontend, existiert bereits)

Die Logik für as-of-Fundamental-Snapshots existiert bereits in `lib/ml/outlookSnapshots.ts` (Backfill-Funktion `computeWeek()`). Für das Replay-Tool:

- Nutze `weekly_outlook_snapshots` aus Supabase — dort liegen bereits 416 Wochen Backfill-Verdicts (ab ~2018).
- Pro GVA-Hit: finde den Snapshot der Woche in der der Hit liegt (`week_start ≤ hit_date < week_start + 7 Tage`).
- Zeige pro Hit: Pair-Verdict (LONG/SHORT/neutral), aligned_count, und die Einzel-Faktoren mit Richtung und Text.

### 3. Trade-Ergebnis-Berechnung (`Backend/replay/trade_result.py`)

Wenn Kerim einen Hit als "Trade genommen" markiert:

- **Entry:** Close-Preis am Hit-Tag (aus `price_daily`).
- **SL berechnen:** Für SHORT-Trades: High der GVA-Signal-Kerze (3D) + kleiner Buffer (5 Pips). Für LONG-Trades: Low der GVA-Signal-Kerze − 5 Pips Buffer.
- **TP berechnen:** 1:3 Risk:Reward. SL-Abstand × 3 = TP-Abstand.
- **Ergebnis simulieren:** Gehe die täglichen Kerzen nach dem Entry durch:
  - Wenn TP zuerst erreicht → WIN (Entry bis TP in Pips als Gewinn)
  - Wenn SL zuerst erreicht → LOSS (Entry bis SL in Pips als Verlust)
  - Wenn beides am selben Tag → konservativ SL (Worst Case)
  - Timeout: wenn nach 20 Handelstagen weder SL noch TP → Close zum aktuellen Preis, als "Timeout" markieren.
- Speichere das Ergebnis.

### 4. Supabase-Tabelle für Replay-Bewertungen

SQL-Datei `Backend/replay/migrations.sql`:

```sql
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
  result_rr FLOAT,                   -- tatsächliches R:R (bei Timeout < 3)
  exit_date DATE,
  -- Meta
  notes TEXT,                         -- Kerims Notizen zum Trade
  UNIQUE(instrument, hit_date, hit_direction)
);
```

### 5. API-Endpunkte (`Backend/replay/routes.py`)

Registriere als Router in `main.py`:
```python
from replay.routes import replay_router
app.include_router(replay_router, prefix="/replay")
```

**Endpunkte:**

- `GET /replay/hits?pair=EUR_USD&from=2022-01-01&to=2022-06-30` — Rekonstruiert GVA-Hits im Zeitraum. Gibt Liste zurück: `[{hit_date, level, direction, line_formed_date, fundamental_snapshot}]`. Der Fundamental-Snapshot kommt aus `weekly_outlook_snapshots`.
- `POST /replay/evaluate` — Kerim bewertet einen Hit: `{instrument, hit_date, hit_direction, trade_taken, skip_reason?, notes?}`. Wenn `trade_taken=true`: Backend berechnet automatisch Entry/SL/TP/Ergebnis und speichert alles in `backtest_replay`.
- `GET /replay/stats?from=2022-01-01&to=2026-06-30` — Aggregierte Statistik über alle bewerteten Trades: Winrate, Ø R:R, Profit Factor, Anzahl, aufgeschlüsselt nach Richtung, Pair, Confluence-Stärke, Jahr.
- `GET /replay/trades?pair=EUR_USD` — Alle bewerteten Trades für ein Pair (für Review/Journal).

### 6. Frontend (`app/(app)/ml/replay/page.tsx`)

Neue Seite unter ML → Replay:

**Layout:**

```
┌─────────────────────────────────────────────────────────┐
│ [Pair-Dropdown ▾]  [Von: 📅]  [Bis: 📅]  [Laden]       │
├─────────────────────────────────────────────────────────┤
│ GVA-Hits: 14 gefunden  │  Bewertet: 3/14  │  WR: 66.7% │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ◀ Hit 4 von 14 ▶          12. Mai 2022                │
│                                                         │
│  ┌─── GVA-Hit ────────────────────────────────┐        │
│  │ SHORT Line @ 1.05432                        │        │
│  │ Gebildet am: 28. April 2022                 │        │
│  │ Hit am: 12. Mai 2022                        │        │
│  └─────────────────────────────────────────────┘        │
│                                                         │
│  ┌─── Fundamentals (KW19, 2022) ──────────────┐        │
│  │ Verdict: SHORT (3/4 Faktoren)               │        │
│  │                                              │        │
│  │ ✓ Zinsdiff    SHORT  EUR 0.00% vs USD 1.00% │        │
│  │ ✓ COT-Flow    SHORT  Flow -6.2 % OI         │        │
│  │ ✓ Saisonalität SHORT  Mai hist. -0.45%      │        │
│  │ ✗ Yield-Spread NEUTRAL  Δ +0.08pp           │        │
│  └─────────────────────────────────────────────┘        │
│                                                         │
│  ┌─── Deine Bewertung ────────────────────────┐        │
│  │                                              │        │
│  │  [✓ Trade genommen]    [✗ Skip]             │        │
│  │                                              │        │
│  │  Notizen: [________________________]         │        │
│  │                                              │        │
│  │  → Ergebnis: WIN +147 Pips (1:3.0)          │        │
│  └─────────────────────────────────────────────┘        │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ Statistik (alle bewerteten Trades)                      │
│ WR: 58.3%  │  Trades: 12  │  Ø RR: 2.1  │  PF: 1.8    │
│ Nach Confluence: 2F=52% | 3F=61% | 4F=75%              │
└─────────────────────────────────────────────────────────┘
```

**Navigation:**
- Kalender-Picker für Von/Bis-Datum
- Vor/Zurück-Pfeile (◀ ▶) um durch die Hits zu blättern
- Tastenkürzel: Pfeiltasten links/rechts = vorheriger/nächster Hit
- Farbcodierung der Hits in der Navigation: grün = bewertet+Win, rot = bewertet+Loss, grau = noch nicht bewertet, durchgestrichen = Skip

**TradingView-Link:**
- Pro Hit einen "In TradingView öffnen"-Button/Link der TradingView im Browser öffnet mit dem richtigen Pair und ungefähren Zeitpunkt:
  `https://www.tradingview.com/chart/?symbol=FX:EURUSD&interval=D` (Daily-Chart, Kerim navigiert dann manuell zum Datum)
- Datum prominent anzeigen damit Kerim es in TradingView eingeben kann.

**Statistik-Sektion (unten):**
- Winrate, Anzahl Trades, Ø R:R, Profit Factor
- Aufschlüsselung nach: Confluence-Stärke (2/3/4/5 Faktoren aligned), Richtung (Long/Short), Pair, Jahr
- Nur über tatsächlich bewertete Trades (trade_taken = true), NICHT über Skips

## Anforderungen

- **Backend:** Python, neue Dateien in `Backend/replay/` (mit `__init__.py`). Supabase über REST-API (Muster aus `supabase_signals.py`).
- **3D-Kerzen-Resampling:** EXAKT dieselbe Logik wie `data_pipeline.py` — Business-Day-Matrix mit Anker `2026-04-21`, `np.busday_count // 3`. Nicht neu erfinden, sondern die Logik portieren (von pandas auf die `price_daily`-Daten anwenden).
- **Frontend:** Next.js, neue Seite `app/(app)/ml/replay/page.tsx` + Komponenten in `components/ml/ReplayExplorer.tsx`. API-Calls an das Render-Backend (`process.env.NEXT_PUBLIC_BACKEND_URL`).
- Styling: identisch zu `LaborExplorer.tsx` (Tailwind, text-up/text-down/text-muted/text-faint, bg-surface2, border-border, font-mono für Zahlen).
- Bestehende Dateien NICHT verändern außer:
  - `main.py`: Router-Import hinzufügen
  - `requirements.txt`: Dependencies updaten (numpy, pandas sind schon drin)
  - Navigation im Frontend: Replay-Link unter ML-Sektion hinzufügen
- Trade-Ergebnis-Berechnung muss robust sein: Feiertage/Wochenenden überspringen, fehlende Tage tolerieren.
- `GET /replay/hits` darf 5–15 Sekunden dauern (3D-Resampling + GVA-Erkennung on-the-fly) — Frontend zeigt Ladeindikator.

## Akzeptanzkriterien

1. `GET /replay/hits?pair=EUR_USD&from=2022-01-01&to=2022-06-30` gibt historische GVA-Hits zurück, mit korrektem 3D-Resampling.
2. Jeder Hit hat den passenden Fundamental-Snapshot aus `weekly_outlook_snapshots`.
3. "Trade genommen" berechnet korrekt Entry/SL/TP bei 1:3 R:R und simuliert das Ergebnis gegen `price_daily`.
4. Frontend zeigt Hits mit Vor/Zurück-Navigation, Fundamental-Details, Bewertungs-Buttons.
5. Statistik-Sektion zeigt Winrate/PF/RR nur über bewertete Trades.
6. `npm run build` + Backend-Start fehlerfrei.
7. Keine Änderungen an bestehenden Dateien außer Router-Import und Nav-Link.
```

---

## Reihenfolge der Prompts

1. **Zuerst:** ML-COT-Modell-Prompt (trainiert das LightGBM-Modell)
2. **Dann:** Backtest-Replay-Prompt (dieses Dokument)
3. **Danach:** Kerim entscheidet anhand der ML-Ergebnisse, ob das Replay-Tool die Screener-Logik oder das ML-Modell als Fundamental-Snapshot zeigen soll — und baut das dann ein.
