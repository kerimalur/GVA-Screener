"""CLI des Macro-Feature-Moduls.

  python -m macro_features                       # Tabelle heute
  python -m macro_features --as-of 2024-06-03    # Backtest-Zeitpunkt
  python -m macro_features --csv features.csv    # Export
  python -m macro_features --audit               # Look-ahead-Nachweis je Quelle
"""
from __future__ import annotations

import argparse

import pandas as pd

from .config import COT_RELEASE_LAG_DAYS, FRED_PUBLICATION_LAG_DAYS, G8, SEASONALITY_YEARS
from .feature_table import SCORE_COLS, build_feature_table, export_csv


def _audit(df: pd.DataFrame, as_of: pd.Timestamp) -> None:
    """Je Quelle: letzter verwendeter Datenpunkt + wann er verfügbar wurde."""
    print(f"\n=== Look-ahead-Audit (as_of = {as_of.date()}) ===")
    print(f"COT: Report-Stand + {COT_RELEASE_LAG_DAYS} Tage Release-Lag <= as_of")
    for ccy in G8:
        rd = df.loc[ccy, "cot_report_date"]
        if pd.isna(rd):
            print(f"  {ccy}: keine Daten")
            continue
        rel = rd + pd.Timedelta(days=COT_RELEASE_LAG_DAYS)
        ok = "OK" if rel <= as_of else "VERLETZT"
        print(f"  {ccy}: report {rd.date()} -> released {rel.date()}  [{ok}]")
    print(f"FRED: Beobachtung + {FRED_PUBLICATION_LAG_DAYS} Tage Publikations-Lag <= as_of")
    for ccy in G8:
        od = df.loc[ccy, "rate_obs_date"]
        if pd.isna(od):
            print(f"  {ccy}: keine Daten")
            continue
        avail = od + pd.Timedelta(days=FRED_PUBLICATION_LAG_DAYS)
        ok = "OK" if avail <= as_of else "VERLETZT"
        print(f"  {ccy}: obs {od.date()} -> verfuegbar {avail.date()}  [{ok}]")
    y0 = as_of.year - SEASONALITY_YEARS
    print(f"Saisonalitaet: Monats-Buckets aus abgeschlossenen Monaten vor {as_of.date():%Y-%m}, 17J-Fenster ~{y0}+")


def main() -> None:
    ap = argparse.ArgumentParser(prog="macro_features")
    ap.add_argument("--as-of", default=None, help="Stichtag YYYY-MM-DD (Default heute)")
    ap.add_argument("--csv", default=None, help="Export-Pfad")
    ap.add_argument("--audit", action="store_true", help="Look-ahead-Nachweis drucken")
    args = ap.parse_args()

    as_of = pd.Timestamp(args.as_of).normalize() if args.as_of else pd.Timestamp.today().normalize()
    df = build_feature_table(as_of)

    view_cols = SCORE_COLS + [
        "avg_score", "confluence",
        "comm_net", "comm_net_d1w", "comm_z", "cot_divergence",
        "rate_level", "rate_diff_avg", "rate_mom_6m",
        "season_mean_ret", "season_hit_years", "season_active",
    ]
    pd.set_option("display.width", 220)
    print(f"Feature-Tabelle (as_of {df.attrs['as_of']}, sortiert stark long -> stark short)\n")
    print(df[view_cols].round(3).to_string())

    if args.audit:
        _audit(df, as_of)
    if args.csv:
        export_csv(df, args.csv)
        print(f"\nCSV geschrieben: {args.csv} ({df.shape[0]} Zeilen x {df.shape[1]} Spalten)")


if __name__ == "__main__":
    main()
