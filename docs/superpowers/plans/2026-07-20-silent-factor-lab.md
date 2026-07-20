# Silent Factor Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jeden Panel-Faktor (cot/rates/season/ranking_baseline) je Währung wöchentlich forward auf Trefferquote tracken, mit Seed aus der Historie, und in einem versteckten Tab ehrlich anzeigen.

**Architecture:** Generalisiert den `run_weekly`-Paper-Track auf N Faktoren. Reine Faktor-Logik in `factors.py` (unit-getestet), Seed-Job über die Panel-Historie, wöchentlicher Forward-Job `run_factors.py` (reused `next_week_start`/`insert_ignore`/`mature_mask`), Speicher in neuer Tabelle `factor_track`, Anzeige unter `/ml/factor-lab`.

**Tech Stack:** Python (pandas/numpy, pytest), FastAPI-Backend-Umgebung, Supabase/PostgREST, Next.js (App Router, Server Components), GitHub Actions.

---

## Referenzen (vor Start lesen)
- Spec: `docs/superpowers/specs/2026-07-20-silent-factor-lab-design.md`
- Muster-Job: `Backend/ml_engine/run_weekly.py` (`next_week_start`, `mature_mask`, `check_run_result`, Reife-Block)
- `Backend/ml_engine/db.py` (`insert_ignore` gibt geschriebene Zeilen zurück), `Backend/ml_engine/baseline.py` (`baseline_scores`)
- `Backend/macro_features/panel.py` (`build_feature_panel`, Spalten `cot_score`/`rates_score`/`season_score`/`fwd_ret_{h}w`)
- `Backend/ml_engine/migrations.sql` (`ml_weekly_rankings` als Schema-Vorlage), `Backend/tests/test_weekly.py` (Test-Stil)

## Dateistruktur
| Datei | Verantwortung |
|-------|---------------|
| `Backend/ml_engine/factors.py` (neu) | Faktor-Registry + reine Logik (`factor_scores`, `direction_of`, `hit_of`, `build_rows`) |
| `Backend/ml_engine/seed_factors.py` (neu) | Einmaliger Seed aus Panel-Historie |
| `Backend/ml_engine/run_factors.py` (neu) | Wöchentlicher Forward-Job + Reife |
| `Backend/ml_engine/migrations.sql` (mod) | `factor_track`-Tabelle als Baseline ergänzen |
| `Backend/tests/test_factors.py` (neu) | Unit-Tests der reinen Logik |
| `frontend-next/lib/ml/factorLab.ts` (neu) | Server-Loader: `factor_track` → Hitrate je (factor,horizon,source) |
| `frontend-next/app/(app)/ml/factor-lab/page.tsx` (neu) | Versteckter Tab (Tabelle) |
| `frontend-next/components/layout/nav.ts` (mod) | Eintrag „Factor-Lab" in Gruppe „Labor · versteckt" |
| `.github/workflows/ml-weekly.yml` (mod) | Step `python -m ml_engine.run_factors` |

---

## Task 1: Reine Faktor-Logik (`factors.py`)

**Files:**
- Create: `Backend/ml_engine/factors.py`
- Test: `Backend/tests/test_factors.py`

- [ ] **Step 1: Failing-Test schreiben**

`Backend/tests/test_factors.py`:
```python
"""Reine Faktor-Logik des Factor-Tracks (Projekt B)."""
import numpy as np
import pandas as pd

from ml_engine.factors import (
    FACTORS,
    direction_of,
    hit_of,
    factor_scores,
    build_rows,
)


def test_direction_of():
    assert direction_of(0.4) == "long"
    assert direction_of(-0.4) == "short"
    assert direction_of(0.0) == "neutral"
    assert direction_of(float("nan")) == "neutral"


def test_hit_of():
    assert hit_of(0.4, 0.02) is True      # long richtig
    assert hit_of(0.4, -0.02) is False     # long falsch
    assert hit_of(-0.4, -0.02) is True     # short richtig
    assert hit_of(0.0, 0.02) is None       # neutral → nicht bewertbar
    assert hit_of(0.4, float("nan")) is None  # kein realisierter Return


def test_factor_scores_atomar_und_composite():
    panel = pd.DataFrame({
        "ccy": ["EUR", "USD"],
        "cot_score": [0.5, -0.5],
        "rates_score": [0.2, -0.2],
        "season_score": [0.0, 0.4],
    })
    assert list(factor_scores(panel, "cot")) == [0.5, -0.5]
    # ranking_baseline = 0.5·rates + 0.5·season
    np.testing.assert_allclose(factor_scores(panel, "ranking_baseline"), [0.1, 0.1])


def test_build_rows_struktur():
    week = pd.Timestamp("2026-07-27")
    panel = pd.DataFrame({
        "week_start": [week, week],
        "ccy": ["EUR", "USD"],
        "cot_score": [0.5, -0.5],
        "rates_score": [0.2, -0.2],
        "season_score": [0.0, 0.4],
        "fwd_ret_1w": [0.01, np.nan],
        "fwd_ret_4w": [np.nan, np.nan],
    })
    rows = build_rows(panel, week, source="seed", horizons=[1, 4])
    # 4 Faktoren × 2 Währungen × 2 Horizonte = 16 Zeilen
    assert len(rows) == len(FACTORS) * 2 * 2
    eur_cot_1w = next(r for r in rows if r["factor"] == "cot" and r["ccy"] == "EUR" and r["horizon"] == 1)
    assert eur_cot_1w["direction"] == "long"
    assert eur_cot_1w["realized_return"] == 0.01
    assert eur_cot_1w["hit"] is True
    assert eur_cot_1w["source"] == "seed"
    # ohne fwd_ret → realized/hit None (offen)
    eur_cot_4w = next(r for r in rows if r["factor"] == "cot" and r["ccy"] == "EUR" and r["horizon"] == 4)
    assert eur_cot_4w["realized_return"] is None
    assert eur_cot_4w["hit"] is None
```

- [ ] **Step 2: Test laufen lassen (muss fehlschlagen)**

Run: `cd Backend && python -m pytest tests/test_factors.py -q`
Expected: FAIL (`ModuleNotFoundError: ml_engine.factors`)

- [ ] **Step 3: `factors.py` implementieren**

`Backend/ml_engine/factors.py`:
```python
"""Faktor-Definitionen + reine Zeilen-Assembly für den Factor-Track (Projekt B).

Ein Faktor = wöchentliche Richtungswette je Währung. Score-Vorzeichen = Richtung,
gereift gegen fwd_ret_{h}w (demeaned Korb, panel.py). Rein (keine I/O) → testbar.
v1: nur Panel-Faktoren. real_yield/macro_score = v2 (kein Python-Wochen-Produzent).
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

from .baseline import baseline_scores

FACTOR_COLUMNS = {"cot": "cot_score", "rates": "rates_score", "season": "season_score"}
FACTORS = [*FACTOR_COLUMNS.keys(), "ranking_baseline"]
HORIZONS = [1, 4]
EPS = 1e-9


def factor_scores(panel: pd.DataFrame, factor: str) -> np.ndarray:
    """Score-Array in Zeilenreihenfolge des übergebenen Panels."""
    if factor == "ranking_baseline":
        return baseline_scores(panel)  # 0.5·rates + 0.5·season (NaN→0)
    return panel[FACTOR_COLUMNS[factor]].to_numpy(dtype=float)


def direction_of(score: float) -> str:
    """long / short / neutral (NaN oder |score|≤EPS = neutral)."""
    if score is None or math.isnan(score):
        return "neutral"
    if score > EPS:
        return "long"
    if score < -EPS:
        return "short"
    return "neutral"


def hit_of(score: float, realized) -> bool | None:
    """Treffer wenn sign(score)==sign(realized). None = nicht bewertbar
    (neutral oder kein realisierter Return)."""
    if score is None or math.isnan(score) or realized is None or (
        isinstance(realized, float) and math.isnan(realized)
    ):
        return None
    if abs(score) <= EPS:
        return None
    return (realized > 0) == (score > 0)


def build_rows(
    panel: pd.DataFrame,
    week: pd.Timestamp,
    source: str,
    horizons: list[int] = HORIZONS,
) -> list[dict]:
    """factor_track-Zeilen für EINE Woche × alle Faktoren × Währungen × Horizonte.
    realized/hit werden gefüllt, wo fwd_ret_{h}w vorhanden ist; sonst None (offen)."""
    wk = panel[panel["week_start"] == week].reset_index(drop=True)
    out: list[dict] = []
    for factor in FACTORS:
        scores = factor_scores(wk, factor)
        for i, r in wk.iterrows():
            score = float(scores[i])
            for h in horizons:
                fwd = r.get(f"fwd_ret_{h}w", np.nan)
                realized = float(fwd) if pd.notna(fwd) else None
                out.append({
                    "week_start": str(week.date()),
                    "factor": factor,
                    "ccy": r["ccy"],
                    "horizon": h,
                    "score": None if math.isnan(score) else round(score, 6),
                    "direction": direction_of(score),
                    "realized_return": None if realized is None else round(realized, 6),
                    "hit": hit_of(score, realized),
                    "source": source,
                })
    return out
```

- [ ] **Step 4: Test laufen lassen (muss bestehen)**

Run: `cd Backend && python -m pytest tests/test_factors.py -q`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add Backend/ml_engine/factors.py Backend/tests/test_factors.py
git commit -m "feat(ml): reine Faktor-Logik für den Factor-Track (Projekt B)"
```

---

## Task 2: Tabelle `factor_track`

**Files:**
- Modify: `Backend/ml_engine/migrations.sql` (Baseline für frische Setups)
- Supabase: neue Migration `create_factor_track` anwenden (bestehende DB)

- [ ] **Step 1: Baseline in `migrations.sql` ergänzen**

Nach dem `ml_weekly_rankings`-Block (vor den `alter table ... enable row level security;`-Zeilen) einfügen:
```sql
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
```
Und in den bestehenden RLS-Block aufnehmen:
```sql
alter table factor_track enable row level security;
```

- [ ] **Step 2: Migration auf die bestehende DB anwenden**

Via Supabase MCP `apply_migration` (Name `create_factor_track`) ODER Supabase-Dashboard → SQL Editor, mit exakt dem CREATE + INDEX + `alter table factor_track enable row level security;` aus Step 1.

- [ ] **Step 3: Verifizieren**

SQL: `select count(*) from information_schema.columns where table_name='factor_track';`
Expected: 10 (Spalten).

- [ ] **Step 4: Commit**

```bash
git add Backend/ml_engine/migrations.sql
git commit -m "feat(db): factor_track-Tabelle (Projekt B)"
```

---

## Task 3: Seed-Job (`seed_factors.py`)

**Files:**
- Create: `Backend/ml_engine/seed_factors.py`

Kein Unit-Test (I/O-Orchestrierung; die Logik ist in Task 1 getestet). Verifikation = manueller Lauf gegen die DB.

- [ ] **Step 1: `seed_factors.py` implementieren**

`Backend/ml_engine/seed_factors.py`:
```python
"""Einmaliger Seed des Factor-Tracks aus der Panel-Historie (Projekt B).

Roher Faktor-Sign-Hitrate über alle gereiften Wochen. KEIN purged-WF — als
'source=seed' markiert und im UI als „historisch, n effektiv klein" gelabelt.
Insert-only: erneuter Lauf schreibt 0 neue Zeilen.

  python -m ml_engine.seed_factors
"""
from __future__ import annotations

import pandas as pd

from macro_features.panel import build_feature_panel

from . import db
from .factors import HORIZONS, build_rows


def main() -> None:
    panel = build_feature_panel()
    weeks = sorted(panel["week_start"].unique())
    total = 0
    batch: list[dict] = []
    for week in weeks:
        rows = build_rows(panel, pd.Timestamp(week), source="seed", horizons=HORIZONS)
        # Nur gereifte Zeilen seeden (realized vorhanden) — offene bringt der Forward-Job.
        batch.extend(r for r in rows if r["realized_return"] is not None)
        if len(batch) >= 2000:
            total += db.insert_ignore("factor_track", batch, on_conflict="week_start,factor,ccy,horizon")
            batch = []
    if batch:
        total += db.insert_ignore("factor_track", batch, on_conflict="week_start,factor,ccy,horizon")
    print(f"Seed: {total} neue factor_track-Zeilen geschrieben")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Lokal-Syntax prüfen**

Run: `cd Backend && python -m py_compile ml_engine/seed_factors.py && echo OK`
Expected: `OK`

- [ ] **Step 3: Integrations-Lauf (mit Creds, z.B. GitHub Actions manuell oder lokal mit .env)**

Run: `cd Backend && python -m ml_engine.seed_factors`
Expected: `Seed: <N> neue factor_track-Zeilen geschrieben` (N > 0). Zweiter Lauf: `Seed: 0 neue …`.

- [ ] **Step 4: Commit**

```bash
git add Backend/ml_engine/seed_factors.py
git commit -m "feat(ml): Seed-Job für factor_track aus Panel-Historie"
```

---

## Task 4: Forward-Job (`run_factors.py`)

**Files:**
- Create: `Backend/ml_engine/run_factors.py`

Reuse aus `run_weekly.py`: `next_week_start`, `mature_mask`, `check_run_result`. `run_weekly.py` bleibt unverändert.

- [ ] **Step 1: `run_factors.py` implementieren**

`Backend/ml_engine/run_factors.py`:
```python
"""Wöchentlicher Forward-Job des Factor-Tracks (Projekt B), samstags nach COT.

Snapshotet je Faktor × Währung × Horizont die Zielwoche (source='live') und
trägt gereifte Live-Zeilen (realized_return + hit) nach. Insert-only, kein
Repaint. Reuse der run_weekly-Bausteine. run_weekly.py bleibt unangetastet.

  python -m ml_engine.run_factors
"""
from __future__ import annotations

import pandas as pd

from macro_features.panel import build_feature_panel

from . import db
from .factors import HORIZONS, hit_of, build_rows
from .run_weekly import next_week_start, mature_mask, check_run_result


def main() -> None:
    today = pd.Timestamp.today().normalize()
    week = next_week_start(today)
    panel = build_feature_panel(end=week)

    # Zielwoche live snapshotten (realized/hit noch None → Reife später).
    rows = build_rows(panel, week, source="live", horizons=HORIZONS)
    written = db.insert_ignore(
        "factor_track", rows, on_conflict="week_start,factor,ccy,horizon"
    )
    if written == 0:
        print(f"WARN: factor_track: 0 neue Zeilen für {week.date()} — bereits vorhanden.")
    else:
        print(f"factor_track: {written} Zeilen für {week.date()} geschrieben")

    # Reife: offene Live-Zeilen nachtragen.
    open_rows = db.select_all("factor_track", {
        "select": "week_start,factor,ccy,horizon,score",
        "realized_return": "is.null",
        "source": "eq.live",
    })
    matured = 0
    if open_rows:
        df = pd.DataFrame(open_rows)
        df["week_start"] = pd.to_datetime(df["week_start"])
        df = df[mature_mask(df, today)]
        for _, r in df.iterrows():
            h = int(r["horizon"])
            src = panel[(panel["week_start"] == r["week_start"]) & (panel["ccy"] == r["ccy"])]
            if src.empty or pd.isna(src[f"fwd_ret_{h}w"].iloc[0]):
                continue
            realized = float(src[f"fwd_ret_{h}w"].iloc[0])
            score = r["score"]
            db.update("factor_track", {
                "week_start": f"eq.{r['week_start'].date()}",
                "factor": f"eq.{r['factor']}", "ccy": f"eq.{r['ccy']}",
                "horizon": f"eq.{h}",
            }, {
                "realized_return": round(realized, 6),
                "hit": hit_of(float(score) if score is not None else float("nan"), realized),
            })
            matured += 1
    print(f"factor_track Reife: {matured} Zeilen nachgetragen")

    # Abschluss (nach Reife): 0 neue + Zielwoche existiert → grün/INFO; sonst rot.
    target = str(week.date())
    if written > 0:
        target_exists = True
    else:
        target_exists = bool(db.select_all("factor_track", {
            "select": "week_start", "week_start": f"eq.{target}", "limit": 1,
        }))
    latest = db.select_all("factor_track", {
        "select": "week_start", "order": "week_start.desc", "limit": 1,
    })
    latest_week = pd.Timestamp(latest[0]["week_start"]) if latest else None
    print(check_run_result(written, target_exists, latest_week, week))


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Bestehende Tests + Syntax prüfen**

Run: `cd Backend && python -m py_compile ml_engine/run_factors.py && python -m pytest tests/test_factors.py tests/test_weekly.py -q`
Expected: `OK` + alle Tests PASS (run_weekly-Reuse bricht nichts).

- [ ] **Step 3: Integrations-Lauf (mit Creds)**

Run: `cd Backend && python -m ml_engine.run_factors`
Expected: `factor_track: <N> Zeilen …` (erster Lauf N>0). Zweiter Lauf am selben Tag: `WARN: … 0 neue …` + `INFO: … bereits vorhanden` + Exit 0.

- [ ] **Step 4: Commit**

```bash
git add Backend/ml_engine/run_factors.py
git commit -m "feat(ml): wöchentlicher Forward-Job run_factors (Projekt B)"
```

---

## Task 5: Frontend-Loader (`factorLab.ts`)

**Files:**
- Create: `frontend-next/lib/ml/factorLab.ts`

- [ ] **Step 1: Loader implementieren**

`frontend-next/lib/ml/factorLab.ts`:
```ts
import "server-only";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";

export interface FactorStat {
  factor: string;
  horizon: number;
  liveHits: number;
  liveN: number;
  seedHits: number;
  seedN: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- dynamische Supabase-Rows */
function agg(rows: any[]): FactorStat[] {
  const map = new Map<string, FactorStat>();
  for (const r of rows) {
    if (r.hit === null || r.hit === undefined) continue; // neutral / unreif
    const key = `${r.factor}|${r.horizon}`;
    const s =
      map.get(key) ??
      { factor: r.factor, horizon: r.horizon, liveHits: 0, liveN: 0, seedHits: 0, seedN: 0 };
    if (r.source === "live") {
      s.liveN += 1;
      if (r.hit) s.liveHits += 1;
    } else {
      s.seedN += 1;
      if (r.hit) s.seedHits += 1;
    }
    map.set(key, s);
  }
  return [...map.values()];
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const loadFactorStats = unstable_cache(
  async (): Promise<FactorStat[]> => {
    const sb = createServiceClient();
    const { data } = await sb
      .from("factor_track")
      .select("factor,horizon,source,hit")
      .not("hit", "is", null);
    return agg(data ?? []);
  },
  ["factor-lab-v1"],
  { revalidate: 3600 },
);
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend-next && npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add frontend-next/lib/ml/factorLab.ts
git commit -m "feat(frontend): factor_track-Loader (Hitrate je Faktor)"
```

---

## Task 6: Versteckter Tab + Nav

**Files:**
- Create: `frontend-next/app/(app)/ml/factor-lab/page.tsx`
- Modify: `frontend-next/components/layout/nav.ts`

- [ ] **Step 1: Seite implementieren**

`frontend-next/app/(app)/ml/factor-lab/page.tsx`:
```tsx
import "server-only";
import Panel from "@/components/layout/Panel";
import { loadFactorStats, type FactorStat } from "@/lib/ml/factorLab";

export const dynamic = "force-dynamic";
export const metadata = { title: "Factor-Lab — FX Terminal" };

function rate(hits: number, n: number): string {
  return n > 0 ? `${((hits / n) * 100).toFixed(1)} % (n=${n})` : "– noch keine";
}

const FACTOR_LABEL: Record<string, string> = {
  cot: "COT",
  rates: "Zins/Macro",
  season: "Saison",
  ranking_baseline: "Ranking-Baseline (Kombi)",
};

export default async function FactorLabPage() {
  const stats = await loadFactorStats();
  stats.sort((a, b) => {
    const ra = a.liveN ? a.liveHits / a.liveN : -1;
    const rb = b.liveN ? b.liveHits / b.liveN : -1;
    return rb - ra || a.horizon - b.horizon;
  });

  return (
    <div className="space-y-4 max-w-[900px] mx-auto">
      <Panel
        title="Factor-Lab — welcher Faktor trifft?"
        subtitle="Live = echter Forward-Beweis (oberste Instanz). Historisch = Kalibrier-Blick, n effektiv klein (überlappende Fenster, korrelierte Währungen), nicht purged. Neutral zählt nicht."
      >
        <div className="overflow-x-auto p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted text-xs">
                <th className="py-1 pr-3">Faktor</th>
                <th className="pr-3">Horizont</th>
                <th className="pr-3">Live-Hitrate</th>
                <th className="pr-3">Historisch</th>
              </tr>
            </thead>
            <tbody>
              {stats.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-3 text-muted">
                    Noch keine Daten — Seed- und Forward-Job laufen lassen.
                  </td>
                </tr>
              )}
              {stats.map((s: FactorStat) => (
                <tr key={`${s.factor}-${s.horizon}`} className="border-t border-border/40">
                  <td className="py-2 pr-3 font-semibold">{FACTOR_LABEL[s.factor] ?? s.factor}</td>
                  <td className="pr-3 font-mono">{s.horizon}W</td>
                  <td className="pr-3 font-mono">{rate(s.liveHits, s.liveN)}</td>
                  <td className="pr-3 font-mono text-muted">{rate(s.seedHits, s.seedN)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
```

- [ ] **Step 2: Nav-Eintrag ergänzen**

In `frontend-next/components/layout/nav.ts`, in der Gruppe `"Labor · versteckt"` als ERSTEN Eintrag (vor `News-Dashboard`) einfügen:
```ts
      { href: "/ml/factor-lab", label: "Factor-Lab", icon: "ph-flask" },
```
Und in `PAGE_TITLES` ergänzen:
```ts
  "/ml/factor-lab": "Factor-Lab — welcher Faktor trifft?",
```

- [ ] **Step 3: Typecheck + Lint**

Run: `cd frontend-next && npx tsc --noEmit && npx eslint "app/(app)/ml/factor-lab/page.tsx" lib/ml/factorLab.ts components/layout/nav.ts`
Expected: exit 0, keine Fehler

- [ ] **Step 4: Commit**

```bash
git add "frontend-next/app/(app)/ml/factor-lab/page.tsx" frontend-next/components/layout/nav.ts
git commit -m "feat(frontend): verstecktes Factor-Lab + Nav-Eintrag"
```

---

## Task 7: Workflow-Trigger

**Files:**
- Modify: `.github/workflows/ml-weekly.yml`

- [ ] **Step 1: Forward-Job als Step ergänzen**

In `.github/workflows/ml-weekly.yml` nach dem `run: python -m ml_engine.run_weekly`-Step einen zweiten Step mit identischem `env`-Block hinzufügen:
```yaml
      - run: python -m ml_engine.run_factors
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          FRED_API_KEY: ${{ secrets.FRED_API_KEY }}
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ml-weekly.yml
git commit -m "ci: run_factors im wöchentlichen ML-Workflow"
```

---

## Manuelle Schritte (nach Merge)
1. Migration `create_factor_track` anwenden (Task 2, Step 2).
2. Einmalig Seed dispatchen: lokal/Action `python -m ml_engine.seed_factors`.
3. `run_factors` läuft ab dem nächsten Samstag automatisch mit; für Sofort-Start manuell dispatchen.
4. `/ml/factor-lab` prüfen (Gruppe „Labor · versteckt"): Historisch-Spalte gefüllt, Live wächst wöchentlich.

## Self-Review-Notiz
- Spec-Abdeckung: factor_track (T2), Seed (T3), Forward+Reife (T5→T4), UI+Labels (T6), Reuse run_weekly (T4), run_weekly unangetastet (nur Import), Insert-only (insert_ignore). ✓
- Neutral-Ausschluss: `hit=None` → Loader filtert `.not("hit","is",null)` + `agg` überspringt null. ✓
- Namens-Konsistenz: `build_rows`, `hit_of`, `check_run_result`, `next_week_start` identisch in allen Tasks. ✓
- v2 (real_yield/macro_score/setup_finder) bewusst nicht im Plan.
