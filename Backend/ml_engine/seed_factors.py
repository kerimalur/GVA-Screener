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
