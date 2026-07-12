"""Macro-Feature-Tabelle: COT + Zinsen + Saisonalitaet je G8-Waehrung.

Nutzung:
    from macro_features import build_feature_table
    df = build_feature_table()                # heute
    df = build_feature_table("2024-06-03")    # as-of (Backtest, kein Look-ahead)
"""
from .feature_table import build_feature_table, export_csv

__all__ = ["build_feature_table", "export_csv"]
